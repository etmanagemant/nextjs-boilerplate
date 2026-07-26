"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { ChatSearchPicker } from "./ChatSearchPicker";
import { sendFilesInBatches, type UploadItemStatus } from "@/lib/uploadVaultBatch";

interface ConnectedModel {
  id: string;
  name: string;
}

interface VaultFanMapping {
  model_id: string;
  vault_fan_label: string | null;
  vault_fan_id: string | null;
  vault_fan_price: number | null;
}

interface UploadVaultClientProps {
  userId: string;
  userRole: string;
  connectedModels: ConnectedModel[];
  initialMappings: VaultFanMapping[];
}

type QueueItem = {
  id: string;
  file: File;
  status: UploadItemStatus;
  error?: string;
};

/**
 * OnlyFans has no direct bulk-upload-to-vault feature the team uses - per
 * the user's own explanation, the workaround is sending a file as a priced
 * message to a dedicated "Vault-Fan" (a real external fan account, or
 * historically another one of their own model accounts), which OnlyFans
 * then archives into the real Vault automatically. Price is set once per
 * model in the Connection Hub (CRMConnectClient) - explicitly moved there
 * per the user's ask so this page's day-to-day upload flow has no price
 * field to touch at all; it's just read here (read-only) and applied
 * automatically to every send.
 */
export default function UploadVaultClient({
  userId,
  userRole,
  connectedModels,
  initialMappings,
}: UploadVaultClientProps) {
  const [activeModelId, setActiveModelId] = useState(connectedModels[0]?.id || "");
  const [mappings, setMappings] = useState<VaultFanMapping[]>(initialMappings);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const [savingLabel, setSavingLabel] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const supabase = createClient();

  const currentMapping = mappings.find((m) => m.model_id === activeModelId);
  const vaultFanLabel = currentMapping?.vault_fan_label || "";
  const vaultFanId = currentMapping?.vault_fan_id || "";
  const vaultFanPrice = currentMapping?.vault_fan_price;

  const selectModel = (modelId: string) => {
    setActiveModelId(modelId);
    const mapping = mappings.find((m) => m.model_id === modelId);
    setLabelDraft(mapping?.vault_fan_label || "Vault");
  };

  useEffect(() => {
    if (activeModelId) {
      const mapping = mappings.find((m) => m.model_id === activeModelId);
      setLabelDraft(mapping?.vault_fan_label || "Vault");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveMapping = async (patch: Partial<VaultFanMapping>) => {
    const { error } = await supabase
      .from("crm_vault_fan_mapping")
      .upsert({ model_id: activeModelId, ...patch, updated_at: new Date().toISOString() });
    if (error) throw error;
    setMappings([
      ...mappings.filter((m) => m.model_id !== activeModelId),
      {
        model_id: activeModelId,
        vault_fan_label: currentMapping?.vault_fan_label ?? null,
        vault_fan_id: currentMapping?.vault_fan_id ?? null,
        vault_fan_price: currentMapping?.vault_fan_price ?? null,
        ...patch,
      },
    ]);
  };

  const handleSetVaultFan = async (item: { label: string; fanId?: string | null }) => {
    if (!activeModelId) return;
    setSavingLabel(true);
    try {
      setLabelDraft(item.label);
      await saveMapping({ vault_fan_label: item.label, vault_fan_id: item.fanId || null });
    } catch (err) {
      console.error("Error saving vault-fan mapping:", err);
      alert("Fehler beim Speichern der Vault-Fan-Zuordnung");
    } finally {
      setSavingLabel(false);
    }
  };

  const handleSaveLabelManual = async () => {
    if (!activeModelId || !labelDraft.trim()) return;
    setSavingLabel(true);
    try {
      // Manual entry has no confirmed fan ID behind it - clears any
      // previously-picked ID so sending falls back to the (less
      // reliable) text search rather than silently keeping a stale ID
      // that no longer matches this typed label.
      await saveMapping({ vault_fan_label: labelDraft.trim(), vault_fan_id: null });
    } catch (err) {
      console.error("Error saving vault-fan mapping:", err);
      alert("Fehler beim Speichern der Vault-Fan-Zuordnung");
    } finally {
      setSavingLabel(false);
    }
  };

  const addFiles = (files: FileList | File[]) => {
    const items: QueueItem[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      status: "pending",
    }));
    setQueue([...queue, ...items]);
    setAllConfirmed(false);
  };

  const removeItem = (id: string) => setQueue(queue.filter((q) => q.id !== id));

  const [allConfirmed, setAllConfirmed] = useState(false);

  const sendAll = async () => {
    if (!activeModelId || queue.length === 0 || vaultFanPrice == null) return;
    setIsSending(true);
    setAllConfirmed(false);
    const pending = queue.filter((q) => q.status !== "success");
    const ok = await sendFilesInBatches(
      pending.map((q) => ({ id: q.id, file: q.file })),
      { modelId: activeModelId, vaultFanId, vaultFanLabel, price: vaultFanPrice },
      (id, status, error) => {
        setQueue((q) => q.map((x) => (x.id === id ? { ...x, status, error } : x)));
      }
    );
    setIsSending(false);
    // CRITICAL: only ever shown once every single file across every batch
    // came back as a VPS-confirmed send, never just "the requests didn't
    // throw" - see the shared helper's own comment for why.
    if (ok) setAllConfirmed(true);
  };

  const statusLabel: Record<QueueItem["status"], string> = {
    pending: "⏳ Wartet",
    uploading: "📤 Wird hochgeladen...",
    staged: "📦 Hochgeladen, wartet auf Versand",
    success: "✅ Gesendet",
    error: "❌ Fehler",
  };

  const canSend = (!!vaultFanLabel || !!vaultFanId) && vaultFanPrice != null;
  const sentCount = queue.filter((q) => q.status === "success").length;
  const progressPercent = queue.length ? Math.round((sentCount / queue.length) * 100) : 0;

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-[#E2C48A]">
      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          <div className="mb-6">
            <h1 className="text-3xl font-black uppercase tracking-wider mb-2">
              <span>📤</span>{" "}
              <span className="bg-gradient-to-r from-[#E2C48A] to-[#C9A86A] bg-clip-text text-transparent">
                Upload Vault
              </span>
            </h1>
            <p className="text-slate-400 text-sm">
              Dateien werden automatisch mit dem im Connection Hub hinterlegten Preis an den Vault-Fan geschickt - OnlyFans legt sie dann selbst im Tresor ab.
            </p>
          </div>

          {connectedModels.length > 0 && (
            <div className="flex gap-2 mb-6 flex-wrap">
              {connectedModels.map((m) => (
                <button
                  key={m.id}
                  onClick={() => selectModel(m.id)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                    activeModelId === m.id
                      ? "bg-[#C9A86A]/20 text-[#C9A86A] border border-[#C9A86A]/50"
                      : "bg-white/5 text-slate-400 hover:text-[#E2C48A] border border-transparent"
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}

          {activeModelId && (
            <section className="mb-6 bg-black/40 p-4 rounded-xl border border-[#9C7A3D]/20 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">
                  Vault-Fan für dieses Model
                </label>
                <div className="flex items-center gap-3 flex-wrap relative">
                  <button
                    onClick={() => setPickerOpen((v) => !v)}
                    className="px-4 py-2 bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] text-black font-bold rounded text-xs uppercase disabled:opacity-40"
                  >
                    🔍 Im Chat suchen
                  </button>
                  {vaultFanLabel && (
                    <span className="text-xs text-slate-400">
                      Aktuell: "{vaultFanLabel}"{!vaultFanId && " (manuell, kein bestätigter Chat)"}
                    </span>
                  )}
                  {pickerOpen && activeModelId && (
                    <ChatSearchPicker
                      modelId={activeModelId}
                      onSelect={(item) => handleSetVaultFan(item)}
                      onClose={() => setPickerOpen(false)}
                    />
                  )}
                </div>

                <details className="mt-3">
                  <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-400">Manuell eintragen</summary>
                  <div className="flex gap-2 max-w-md mt-2">
                    <input
                      type="text"
                      value={labelDraft}
                      onChange={(e) => setLabelDraft(e.target.value)}
                      placeholder="Vault"
                      className="flex-1 bg-[#050505] border border-[#9C7A3D]/20 rounded px-3 py-2 text-white text-sm outline-none focus:border-[#C9A86A]"
                    />
                    <button
                      onClick={handleSaveLabelManual}
                      disabled={savingLabel || !labelDraft.trim()}
                      className="px-4 py-2 bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] text-black font-bold rounded text-xs uppercase disabled:opacity-40"
                    >
                      {savingLabel ? "..." : "✓ Speichern"}
                    </button>
                  </div>
                </details>
              </div>

              {/* Preis wird nicht mehr hier eingestellt - fester Wert pro
                  Model, einmal im Connection Hub hinterlegt und automatisch
                  auf jeden Upload angewendet. Nur noch reine Anzeige hier,
                  damit der Upload-Ablauf kein Preisfeld zum Anfassen hat. */}
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">Preis</label>
                {vaultFanPrice != null ? (
                  <p className="text-sm text-[#C9A86A] font-bold">${vaultFanPrice}</p>
                ) : (
                  <p className="text-sm text-red-400">Noch kein Preis hinterlegt</p>
                )}
                <p className="text-[10px] text-slate-500 mt-1">
                  Wird automatisch auf jeden Upload angewendet - einstellbar im Connection Hub, nicht hier.
                </p>
              </div>
            </section>
          )}

          <section
            className="mb-6 p-8 rounded-xl border-2 border-dashed border-[#9C7A3D]/50 bg-black/40 hover:border-[#C9A86A]/70 transition cursor-pointer"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
            }}
          >
            <div className="text-center">
              <div className="text-5xl mb-4">📁</div>
              <p className="text-slate-400 mb-4">Dateien hierher ziehen oder klicken (Mehrfachauswahl möglich)</p>
              <label className="inline-block">
                <input
                  type="file"
                  multiple
                  onChange={(e) => e.target.files && addFiles(e.target.files)}
                  className="hidden"
                  accept="image/*,video/*"
                />
                <span className="inline-block px-6 py-3 bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] text-black font-bold rounded-lg uppercase tracking-wider transition shadow-lg cursor-pointer">
                  ➕ Dateien wählen
                </span>
              </label>
            </div>
          </section>

          {allConfirmed && queue.length > 0 && (
            <section className="mb-6 p-5 rounded-xl border-2 border-emerald-500/50 bg-emerald-500/10 text-center">
              <p className="text-2xl mb-1">✅🎉</p>
              <p className="text-emerald-300 font-bold">Medien erfolgreich im OnlyFans Tresor!</p>
              <p className="text-xs text-slate-400 mt-1">
                Alle {queue.length} Datei(en) wurden bestätigt verschickt - du kannst die Seite jetzt sicher verlassen.
              </p>
            </section>
          )}

          {queue.length > 0 && (
            <section className="space-y-2 mb-6">
              {(isSending || (progressPercent > 0 && progressPercent < 100)) && (
                <div className="mb-3">
                  <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                    <span>📤 {sentCount}/{queue.length} verschickt</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="w-full h-2 bg-black/60 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#C9A86A] to-[#E5C158] transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
              {queue.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 bg-black/40 p-3 rounded-lg border border-[#9C7A3D]/10"
                >
                  <span className="text-2xl flex-shrink-0">{item.file.type.startsWith("video") ? "🎥" : "🖼️"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{item.file.name}</p>
                    <p className="text-[10px] text-slate-500">{statusLabel[item.status]}{item.error ? ` - ${item.error}` : ""}</p>
                  </div>
                  {item.status === "pending" && (
                    <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-300 text-sm">
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={sendAll}
                disabled={isSending || !canSend}
                className="w-full mt-3 px-6 py-3 bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] text-black font-bold rounded-lg uppercase tracking-wider transition shadow-lg disabled:opacity-40"
              >
                {isSending
                  ? `Wird gesendet... (${sentCount}/${queue.length})`
                  : !canSend
                  ? !vaultFanLabel && !vaultFanId
                    ? "Erst Vault-Fan festlegen"
                    : "Preis fehlt - im Connection Hub hinterlegen"
                  : `${queue.length} Datei(en) senden${queue.length > 1 ? ` (${Math.ceil(queue.length / 20)} Nachricht${Math.ceil(queue.length / 20) > 1 ? "en" : ""})` : ""}`}
              </button>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
