"use client";

import { useEffect, useRef, useState } from "react";
import { sendFilesInBatches, type UploadItemStatus } from "@/lib/uploadVaultBatch";
import UploadQueueItem from "./UploadQueueItem";

const formatSeconds = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

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
  status: UploadItemStatus;
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
  // Tabs instead of stacking both sections on one page - per the user's
  // ask, a model uploading 40 files at once (most likely on her phone)
  // shouldn't have to scroll past an entire second section just to reach
  // the send button; showing one bucket at a time roughly halves the
  // scroll distance on its own, on top of the sticky send bar below.
  const [activeTab, setActiveTab] = useState<"reddit" | "onlyfans">("reddit");

  // Voice-memo recording straight from the upload page - OnlyFans accepts
  // audio the same as any other attachment, so a recorded memo just joins
  // the normal OnlyFans queue/send pipeline as a File, no separate path.
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
    if (setter === setOfQueue) setOfAllConfirmed(false);
  };

  const removeRedditItem = (id: string) => setRedditQueue((q) => q.filter((x) => x.id !== id));
  const removeOfItem = (id: string) => setOfQueue((q) => q.filter((x) => x.id !== id));

  const startRecording = async () => {
    setRecordError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      // iOS Safari only supports mp4/aac, Chrome/Android only webm/opus -
      // picking whichever this browser actually supports instead of
      // hardcoding one avoids a silent empty recording on the other platform.
      const preferredTypes = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
      const mimeType = preferredTypes.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const ext = (recorder.mimeType || "").includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `sprachnachricht-${Date.now()}.${ext}`, { type: blob.type });
        addFiles(setOfQueue, [file]);
        stream.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecordSeconds(0);
      setIsRecording(true);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      setRecordError("Mikrofon-Zugriff nicht möglich - bitte im Browser erlauben.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
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
  const [ofAllConfirmed, setOfAllConfirmed] = useState(false);

  const sendOf = async () => {
    if (!canSendOf || vaultFanPrice == null) return;
    setIsSendingOf(true);
    setOfAllConfirmed(false);
    const pending = ofQueue.filter((q) => q.status !== "success");
    const ok = await sendFilesInBatches(
      pending.map((q) => ({ id: q.id, file: q.file })),
      { modelId: model.id, vaultFanId: vaultFanId || undefined, vaultFanLabel: vaultFanLabel || undefined, price: vaultFanPrice },
      (id, status, error) => {
        setOfQueue((q) => q.map((x) => (x.id === id ? { ...x, status, error } : x)));
      }
    );
    setIsSendingOf(false);
    // CRITICAL per the user's explicit ask: a model must never see "done"
    // before every file is actually VPS-confirmed sent - see the shared
    // batching helper for why this can't just mean "no request failed".
    if (ok) {
      setOfAllConfirmed(true);
      // Best-effort - the model's own success screen doesn't depend on
      // this landing, so a failure here shouldn't block/alarm the model.
      fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `📤✨ ${model.name} hat ${pending.length} Datei${pending.length > 1 ? "en" : ""} in den OnlyFans-Tresor hochgeladen! 🎉`,
          modelId: model.id,
        }),
      }).catch(() => {});
    }
  };

  const ofSentCount = ofQueue.filter((q) => q.status === "success").length;
  const ofProgressPercent = ofQueue.length ? Math.round((ofSentCount / ofQueue.length) * 100) : 0;

  return (
    // min-h-screen + normal document flow instead of a fixed h-screen flex
    // frame - mobile browsers resize their chrome (address bar) as you
    // scroll, which makes a fixed 100vh container jump/resize awkwardly;
    // this page doesn't need to fit a fixed frame like the video-heavy
    // CRM Inbox does, so plain scrolling is both simpler and smoother.
    <div className="min-h-screen bg-[#0A0A0A] text-[#E2C48A] pb-28">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-wider mb-2">
            <span>📤</span>{" "}
            <span className="bg-gradient-to-r from-[#E2C48A] to-[#C9A86A] bg-clip-text text-transparent">
              Mein Upload
            </span>
          </h1>
          <p className="text-slate-400 text-sm">{model.name}</p>
        </div>

        {/* Segmented tab switcher - one bucket visible at a time */}
        <div className="flex gap-2 p-1 bg-black/40 rounded-xl border border-[#9C7A3D]/20">
          <button
            onClick={() => setActiveTab("reddit")}
            className={`flex-1 min-h-[44px] rounded-lg text-xs font-bold uppercase tracking-wider transition ${
              activeTab === "reddit" ? "bg-[#C9A86A]/20 text-[#C9A86A]" : "text-slate-400 hover:text-[#E2C48A]"
            }`}
          >
            📸 Reddit-Bilder{redditQueue.length > 0 ? ` (${redditQueue.length})` : ""}
          </button>
          <button
            onClick={() => setActiveTab("onlyfans")}
            className={`flex-1 min-h-[44px] rounded-lg text-xs font-bold uppercase tracking-wider transition ${
              activeTab === "onlyfans" ? "bg-[#C9A86A]/20 text-[#C9A86A]" : "text-slate-400 hover:text-[#E2C48A]"
            }`}
          >
            🔞 OnlyFans{ofQueue.length > 0 ? ` (${ofQueue.length})` : ""}
          </button>
        </div>

        {/* Reddit */}
        {activeTab === "reddit" && (
          <section className="bg-black/40 p-4 sm:p-6 rounded-2xl border border-[#9C7A3D]/20">
            <p className="text-xs text-slate-500 mb-4">Landet automatisch in deinem Content Plan.</p>

            <label
              className="block mb-4 p-6 sm:p-8 rounded-2xl border-2 border-dashed border-[#9C7A3D]/40 bg-gradient-to-b from-black/40 to-black/20 hover:border-[#C9A86A]/70 hover:from-[#C9A86A]/5 active:scale-[0.99] transition-all cursor-pointer text-center"
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
              <div className="text-4xl mb-2">📁</div>
              <span className="text-sm text-slate-400">Bilder auswählen oder hierher ziehen</span>
            </label>

            {redditQueue.length > 0 && (
              <div className="space-y-2">
                {redditQueue.map((item) => (
                  <UploadQueueItem
                    key={item.id}
                    file={item.file}
                    status={item.status}
                    error={item.error}
                    onRemove={() => removeRedditItem(item.id)}
                    compact
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* OnlyFans */}
        {activeTab === "onlyfans" && (
          <section className="bg-black/40 p-4 sm:p-6 rounded-2xl border border-[#9C7A3D]/20">
            <p className="text-xs text-slate-500 mb-4">Landet automatisch in deinem OnlyFans-Tresor.</p>

            {!canSendOf ? (
              <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                Dein Admin muss dafür erst den Vault-Fan und den Preis im Connection Hub einrichten.
              </p>
            ) : (
              <>
                {ofAllConfirmed && ofQueue.length > 0 && (
                  <div className="mb-4 p-4 rounded-2xl border-2 border-emerald-500/50 bg-gradient-to-b from-emerald-500/10 to-emerald-500/5 text-center">
                    <p className="text-2xl mb-1">✅🎉</p>
                    <p className="text-emerald-300 font-bold text-sm">Medien erfolgreich im OnlyFans Tresor!</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Alle {ofQueue.length} Datei(en) bestätigt verschickt - du kannst jetzt sicher weitermachen.
                    </p>
                  </div>
                )}
                <label
                  className="block mb-3 p-6 sm:p-8 rounded-2xl border-2 border-dashed border-[#9C7A3D]/40 bg-gradient-to-b from-black/40 to-black/20 hover:border-[#C9A86A]/70 hover:from-[#C9A86A]/5 active:scale-[0.99] transition-all cursor-pointer text-center"
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
                  <div className="text-4xl mb-2">📁</div>
                  <span className="text-sm text-slate-400">Dateien auswählen oder hierher ziehen</span>
                </label>

                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isSendingOf}
                  className={`w-full mb-4 min-h-[52px] rounded-2xl border-2 font-bold uppercase tracking-wider text-xs transition flex items-center justify-center gap-2 disabled:opacity-40 ${
                    isRecording
                      ? "border-red-500/60 bg-red-500/10 text-red-300"
                      : "border-[#9C7A3D]/40 bg-gradient-to-b from-black/40 to-black/20 text-slate-300 hover:border-[#C9A86A]/70 hover:text-[#E2C48A]"
                  }`}
                >
                  {isRecording ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                      ⏹️ Aufnahme stoppen ({formatSeconds(recordSeconds)})
                    </>
                  ) : (
                    <>🎙️ Sprachnachricht aufnehmen</>
                  )}
                </button>
                {recordError && (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">{recordError}</p>
                )}

                {ofQueue.length > 0 && (
                  <div className="space-y-2">
                    {(isSendingOf || (ofProgressPercent > 0 && ofProgressPercent < 100)) && (
                      <div className="mb-1">
                        <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                          <span>📤 {ofSentCount}/{ofQueue.length} verschickt</span>
                          <span>{ofProgressPercent}%</span>
                        </div>
                        <div className="w-full h-2 bg-black/60 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#C9A86A] to-[#E5C158] transition-all duration-300"
                            style={{ width: `${ofProgressPercent}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {ofQueue.map((item) => (
                      <UploadQueueItem
                        key={item.id}
                        file={item.file}
                        status={item.status}
                        error={item.error}
                        onRemove={() => removeOfItem(item.id)}
                        compact
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>

      {/* Sticky send bar - per the user's ask, a model uploading a big
          batch on her phone shouldn't have to scroll all the way down
          just to find the send button. */}
      {activeTab === "reddit" && redditQueue.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-[#0A0A0A]/95 backdrop-blur border-t border-[#9C7A3D]/20 z-40">
          <div className="max-w-3xl mx-auto">
            <button
              onClick={sendReddit}
              disabled={isSendingReddit}
              className="w-full min-h-[52px] px-6 py-3 bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] active:scale-[0.99] text-black font-bold rounded-xl uppercase tracking-wider text-sm transition shadow-lg disabled:opacity-40"
            >
              {isSendingReddit ? "Wird hochgeladen..." : `${redditQueue.length} Bild(er) hochladen`}
            </button>
          </div>
        </div>
      )}
      {activeTab === "onlyfans" && canSendOf && ofQueue.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-[#0A0A0A]/95 backdrop-blur border-t border-[#9C7A3D]/20 z-40">
          <div className="max-w-3xl mx-auto">
            <button
              onClick={sendOf}
              disabled={isSendingOf}
              className="w-full min-h-[52px] px-6 py-3 bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] active:scale-[0.99] text-black font-bold rounded-xl uppercase tracking-wider text-sm transition shadow-lg disabled:opacity-40"
            >
              {isSendingOf ? `Wird gesendet... (${ofSentCount}/${ofQueue.length})` : `${ofQueue.length} Datei(en) senden`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
