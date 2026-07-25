"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { ChatSearchPicker } from "./ChatSearchPicker";

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
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
};

/**
 * OnlyFans has no direct bulk-upload-to-vault feature the team uses - per
 * the user's own explanation, the workaround is sending a file as a priced
 * message to a dedicated "Vault-Fan" (a real external fan account, or
 * historically another one of their own model accounts), which OnlyFans
 * then archives into the real Vault automatically. Price is set once per
 * model here (not typed per file, per the user's explicit ask) and
 * applied automatically to every send.
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
  const [priceDraft, setPriceDraft] = useState("");
  const [savingLabel, setSavingLabel] = useState(false);
  const [savingPrice, setSavingPrice] = useState(false);
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
    setPriceDraft(mapping?.vault_fan_price != null ? String(mapping.vault_fan_price) : "");
  };

  useEffect(() => {
    if (activeModelId) {
      const mapping = mappings.find((m) => m.model_id === activeModelId);
      setLabelDraft(mapping?.vault_fan_label || "Vault");
      setPriceDraft(mapping?.vault_fan_price != null ? String(mapping.vault_fan_price) : "");
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

  const handleSavePrice = async () => {
    if (!activeModelId || !priceDraft.trim()) return;
    setSavingPrice(true);
    try {
      await saveMapping({ vault_fan_price: Number(priceDraft) || 0 });
    } catch (err) {
      console.error("Error saving vault-fan price:", err);
      alert("Fehler beim Speichern des Preises");
    } finally {
      setSavingPrice(false);
    }
  };

  const addFiles = (files: FileList | File[]) => {
    const items: QueueItem[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      status: "pending",
    }));
    setQueue([...queue, ...items]);
  };

  const removeItem = (id: string) => setQueue(queue.filter((q) => q.id !== id));

  const sendAll = async () => {
    if (!activeModelId || queue.length === 0) return;
    setIsSending(true);
    for (const item of queue) {
      if (item.status === "success") continue;
      setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "uploading" } : x)));
      try {
        const formData = new FormData();
        formData.append("file", item.file);
        formData.append("modelId", activeModelId);
        if (vaultFanId) formData.append("vaultFanId", vaultFanId);
        if (vaultFanLabel) formData.append("vaultFanLabel", vaultFanLabel);
        if (vaultFanPrice != null) formData.append("price", String(vaultFanPrice));

        const res = await fetch("/api/crm/upload-to-vault-fan", { method: "POST", body: formData });
        const data = await res.json();
        if (data.status === "success") {
          setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "success" } : x)));
        } else {
          setQueue((q) =>
            q.map((x) => (x.id === item.id ? { ...x, status: "error", error: data.message || data.error || "Fehler" } : x))
          );
        }
      } catch (err) {
        setQueue((q) =>
          q.map((x) => (x.id === item.id ? { ...x, status: "error", error: "Netzwerkfehler" } : x))
        );
      }
    }
    setIsSending(false);
  };

  const statusLabel: Record<QueueItem["status"], string> = {
    pending: "⏳ Wartet",
    uploading: "📤 Wird gesendet...",
    success: "✅ Gesendet",
    error: "❌ Fehler",
  };

  const canSend = (!!vaultFanLabel || !!vaultFanId) && vaultFanPrice != null;

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
              Dateien werden automatisch mit dem hier festgelegten Preis an den Vault-Fan geschickt - OnlyFans legt sie dann selbst im Tresor ab.
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

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">
                  Preis (wird automatisch für jede Datei verwendet)
                </label>
                <div className="flex gap-2 max-w-xs">
                  <input
                    type="number"
                    step="0.01"
                    value={priceDraft}
                    onChange={(e) => setPriceDraft(e.target.value)}
                    placeholder="z.B. 5.00"
                    className="flex-1 bg-[#050505] border border-[#9C7A3D]/20 rounded px-3 py-2 text-white text-sm outline-none focus:border-[#C9A86A]"
                  />
                  <button
                    onClick={handleSavePrice}
                    disabled={savingPrice || !priceDraft.trim()}
                    className="px-4 py-2 bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] text-black font-bold rounded text-xs uppercase disabled:opacity-40"
                  >
                    {savingPrice ? "..." : "✓ Speichern"}
                  </button>
                </div>
                {vaultFanPrice != null && (
                  <p className="text-[10px] text-slate-500 mt-1">Aktuell gespeichert: ${vaultFanPrice}</p>
                )}
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

          {queue.length > 0 && (
            <section className="space-y-2 mb-6">
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
                {isSending ? "Wird gesendet..." : !canSend ? "Erst Vault-Fan und Preis festlegen" : `${queue.length} Datei(en) senden`}
              </button>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
