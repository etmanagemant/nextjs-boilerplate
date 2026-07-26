"use client";

import { useEffect, useState } from "react";
import type { UploadItemStatus } from "@/lib/uploadVaultBatch";

const STATUS_STYLE: Record<UploadItemStatus, { label: string; className: string }> = {
  pending: { label: "Wartet", className: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  uploading: { label: "Wird hochgeladen...", className: "bg-blue-500/15 text-blue-300 border-blue-500/30 animate-pulse" },
  staged: { label: "Hochgeladen, wartet auf Versand", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  success: { label: "Gesendet", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  error: { label: "Fehler", className: "bg-red-500/15 text-red-300 border-red-500/30" },
};

/**
 * A real image/video thumbnail instead of a generic emoji icon - both
 * prettier and more trustworthy (a model can actually see what she's
 * about to send instead of trusting a filename). Shared between Upload
 * Vault and the model role's own upload, per the user's ask for a
 * consistent, nicer look in both places.
 */
export default function UploadQueueItem({
  file,
  status,
  error,
  onRemove,
  compact = false,
}: {
  file: File;
  status: UploadItemStatus;
  error?: string;
  onRemove?: () => void;
  compact?: boolean;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const isVideo = file.type.startsWith("video");
  const isAudio = file.type.startsWith("audio");
  const style = STATUS_STYLE[status];
  const size = compact ? "w-12 h-12" : "w-14 h-14";

  return (
    <div className="flex items-center gap-3 bg-black/40 p-2.5 rounded-xl border border-[#9C7A3D]/10">
      <div className={`${size} flex-shrink-0 rounded-lg overflow-hidden bg-black/60 border border-[#9C7A3D]/20 flex items-center justify-center`}>
        {isAudio ? (
          <span className="text-xl">🎙️</span>
        ) : (
          previewUrl &&
          (isVideo ? (
            <video src={previewUrl} muted preload="metadata" className="w-full h-full object-cover" />
          ) : (
            <img src={previewUrl} alt="" className="w-full h-full object-cover" />
          ))
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`truncate ${compact ? "text-xs" : "text-sm"}`}>{file.name}</p>
        <span
          className={`inline-block mt-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${style.className}`}
        >
          {style.label}
          {error ? ` - ${error}` : ""}
        </span>
      </div>
      {status === "pending" && onRemove && (
        <button
          onClick={onRemove}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-red-400 hover:text-red-300 hover:bg-red-500/10 transition text-sm"
        >
          ✕
        </button>
      )}
    </div>
  );
}
