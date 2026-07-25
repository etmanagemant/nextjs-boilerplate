"use client";

import { useState } from "react";

interface ModelInfo {
  id: string;
  name: string;
}

interface ModelWorkspaceClientProps {
  model: ModelInfo | null;
  vaultFanLabel: string | null;
  vaultFanId: string | null;
  vaultFanPrice: number | null;
}

type QueueItem = {
  id: string;
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
};

/**
 * A model's entire workspace: two upload buckets tied to their own,
 * admin-assigned model (models.owner_user_id) - no model picker, no
 * access to anyone else's data. Reddit images go through the same
 * /api/upload-content route the Content Plan page itself uses (real
 * Supabase Storage upload, not the dead local-filesystem server action -
 * that one writes to the Vercel deploy's own disk, which doesn't persist
 * in production). OnlyFans files reuse the same Vault-Fan send mechanism
 * as Upload Vault, just locked to this one model. Price is set once by
 * the admin in Upload Vault and applied automatically here - models
 * never see or enter a price themselves.
 */
export default function ModelWorkspaceClient({ model, vaultFanLabel, vaultFanId, vaultFanPrice }: ModelWorkspaceClientProps) {
  const [redditQueue, setRedditQueue] = useState<QueueItem[]>([]);
  const [isSendingReddit, setIsSendingReddit] = useState(false);
  const [ofQueue, setOfQueue] = useState<QueueItem[]>([]);
  const [isSendingOf, setIsSendingOf] = useState(false);

  if (!model) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-black/40 border border-[#9C7A3D]/20 rounded-xl p-8 text-center">
          <div className="text-3xl mb-3">⏳</div>
          <h1 className="text-lg font-black uppercase tracking-wider text-[#E2C48A] mb-2">
            Dir wurde noch kein Model zugewiesen
          </h1>
          <p className="text-sm text-slate-400">Bitte kontaktiere deinen Admin, damit dein Account im Connection Hub zugeordnet wird.</p>
        </div>
      </div>
    );
  }

  const addFiles = (setter: typeof setRedditQueue, files: FileList | File[]) => {
    const items: QueueItem[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      status: "pending",
    }));
    setter((q) => [...q, ...items]);
  };

  const sendReddit = async () => {
    setIsSendingReddit(true);
    for (const item of redditQueue) {
      if (item.status === "success") continue;
      setRedditQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "uploading" } : x)));
      try {
        const formData = new FormData();
        formData.append("file", item.file);
        formData.append("modelId", model.id);
        const res = await fetch("/api/upload-content", { method: "POST", body: formData });
        const result = await res.json();
        if (!res.ok || result.error) {
          setRedditQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "error", error: result.error || "Fehler" } : x)));
        } else {
          setRedditQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "success" } : x)));
        }
      } catch {
        setRedditQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "error", error: "Netzwerkfehler" } : x)));
      }
    }
    setIsSendingReddit(false);
  };

  const canSendOf = (!!vaultFanLabel || !!vaultFanId) && vaultFanPrice != null;

  const sendOf = async () => {
    if (!canSendOf) return;
    setIsSendingOf(true);
    for (const item of ofQueue) {
      if (item.status === "success") continue;
      setOfQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "uploading" } : x)));
      try {
        const formData = new FormData();
        formData.append("file", item.file);
        formData.append("modelId", model.id);
        if (vaultFanId) formData.append("vaultFanId", vaultFanId);
        if (vaultFanLabel) formData.append("vaultFanLabel", vaultFanLabel);
        if (vaultFanPrice != null) formData.append("price", String(vaultFanPrice));

        const res = await fetch("/api/crm/upload-to-vault-fan", { method: "POST", body: formData });
        const data = await res.json();
        if (data.status === "success") {
          setOfQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "success" } : x)));
        } else {
          setOfQueue((q) =>
            q.map((x) => (x.id === item.id ? { ...x, status: "error", error: data.message || data.error || "Fehler" } : x))
          );
        }
      } catch {
        setOfQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "error", error: "Netzwerkfehler" } : x)));
      }
    }
    setIsSendingOf(false);
  };

  const statusLabel: Record<QueueItem["status"], string> = {
    pending: "⏳ Wartet",
    uploading: "📤 Wird gesendet...",
    success: "✅ Gesendet",
    error: "❌ Fehler",
  };

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-[#E2C48A]">
      <main className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto p-6 space-y-8">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-wider mb-2">
              <span>📤</span>{" "}
              <span className="bg-gradient-to-r from-[#E2C48A] to-[#C9A86A] bg-clip-text text-transparent">
                Mein Upload
              </span>
            </h1>
            <p className="text-slate-400 text-sm">{model.name}</p>
          </div>

          {/* Reddit */}
          <section className="bg-black/40 p-6 rounded-xl border border-[#9C7A3D]/20">
            <h2 className="text-sm font-bold mb-1 text-[#C9A86A] uppercase tracking-wider">📸 Reddit-Bilder</h2>
            <p className="text-xs text-slate-500 mb-4">Landet automatisch in deinem Content Plan.</p>

            <label
              className="block mb-4 p-6 rounded-xl border-2 border-dashed border-[#9C7A3D]/50 bg-black/40 hover:border-[#C9A86A]/70 transition cursor-pointer text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files.length) addFiles(setRedditQueue, e.dataTransfer.files);
              }}
            >
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => e.target.files && addFiles(setRedditQueue, e.target.files)}
                className="hidden"
              />
              <div className="text-3xl mb-2">📁</div>
              <span className="text-sm text-slate-400">Bilder hierher ziehen oder klicken</span>
            </label>

            {redditQueue.length > 0 && (
              <div className="space-y-2">
                {redditQueue.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 bg-[#050505]/60 p-2.5 rounded-lg border border-[#9C7A3D]/10">
                    <span className="text-xl flex-shrink-0">🖼️</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate">{item.file.name}</p>
                      <p className="text-[10px] text-slate-500">{statusLabel[item.status]}{item.error ? ` - ${item.error}` : ""}</p>
                    </div>
                  </div>
                ))}
                <button
                  onClick={sendReddit}
                  disabled={isSendingReddit}
                  className="w-full mt-2 px-6 py-2.5 bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] text-black font-bold rounded-lg uppercase tracking-wider text-xs transition shadow-lg disabled:opacity-40"
                >
                  {isSendingReddit ? "Wird hochgeladen..." : `${redditQueue.length} Bild(er) hochladen`}
                </button>
              </div>
            )}
          </section>

          {/* OnlyFans */}
          <section className="bg-black/40 p-6 rounded-xl border border-[#9C7A3D]/20">
            <h2 className="text-sm font-bold mb-1 text-[#C9A86A] uppercase tracking-wider">🔞 OnlyFans-Dateien</h2>
            <p className="text-xs text-slate-500 mb-4">Landet automatisch in deinem OnlyFans-Tresor.</p>

            {!canSendOf ? (
              <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                Dein Admin muss dafür erst den Vault-Fan und den Preis im Upload Vault einrichten.
              </p>
            ) : (
              <>
                <label
                  className="block mb-4 p-6 rounded-xl border-2 border-dashed border-[#9C7A3D]/50 bg-black/40 hover:border-[#C9A86A]/70 transition cursor-pointer text-center"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files.length) addFiles(setOfQueue, e.dataTransfer.files);
                  }}
                >
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    onChange={(e) => e.target.files && addFiles(setOfQueue, e.target.files)}
                    className="hidden"
                  />
                  <div className="text-3xl mb-2">📁</div>
                  <span className="text-sm text-slate-400">Dateien hierher ziehen oder klicken</span>
                </label>

                {ofQueue.length > 0 && (
                  <div className="space-y-2">
                    {ofQueue.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 bg-[#050505]/60 p-2.5 rounded-lg border border-[#9C7A3D]/10">
                        <span className="text-xl flex-shrink-0">{item.file.type.startsWith("video") ? "🎥" : "🖼️"}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate">{item.file.name}</p>
                          <p className="text-[10px] text-slate-500">{statusLabel[item.status]}{item.error ? ` - ${item.error}` : ""}</p>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={sendOf}
                      disabled={isSendingOf}
                      className="w-full mt-2 px-6 py-2.5 bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] text-black font-bold rounded-lg uppercase tracking-wider text-xs transition shadow-lg disabled:opacity-40"
                    >
                      {isSendingOf ? "Wird gesendet..." : `${ofQueue.length} Datei(en) senden`}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
