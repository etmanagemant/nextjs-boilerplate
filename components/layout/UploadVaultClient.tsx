"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import WorkspaceSidebar from "./WorkspaceSidebar";

interface MediaItem {
  id: string;
  media_url: string;
  preview_url: string | null;
  media_type: "image" | "video" | "document";
  mime_type: string;
  file_size_bytes: number;
  created_at: string;
  storage_path: string | null;
}

interface UploadVaultClientProps {
  initialMedia: MediaItem[];
  userId: string;
  userRole: string;
  userName: string;
}

export default function UploadVaultClient({
  initialMedia,
  userId,
  userRole,
  userName,
}: UploadVaultClientProps) {
  const [media, setMedia] = useState<MediaItem[]>(initialMedia);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [filter, setFilter] = useState<"all" | "image" | "video" | "document">("all");

  const supabase = createClient();

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Determine media type
      const mimeType = file.type;
      let mediaType: "image" | "video" | "document" = "document";

      if (mimeType.startsWith("image/")) {
        mediaType = "image";
      } else if (mimeType.startsWith("video/")) {
        mediaType = "video";
      }

      // Upload to Supabase storage
      const fileName = `${userId}/${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("crm-vault-media")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: publicUrl } = supabase.storage
        .from("crm-vault-media")
        .getPublicUrl(fileName);

      // Create preview URL (for images, use the same URL; for videos, we could create a thumbnail)
      const previewUrl = mediaType === "image" ? publicUrl.publicUrl : null;

      // Save metadata to database
      const { data: mediaRecord, error: dbError } = await supabase
        .from("crm_vault_media")
        .insert({
          chatter_id: userId,
          media_url: publicUrl.publicUrl,
          preview_url: previewUrl,
          media_type: mediaType,
          mime_type: mimeType,
          file_size_bytes: file.size,
          storage_path: fileName,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setMedia([mediaRecord, ...media]);
      setUploadProgress(100);

      setTimeout(() => {
        setUploadProgress(0);
      }, 1000);
    } catch (err) {
      console.error("Error uploading file:", err);
      alert("Fehler beim Upload: " + (err instanceof Error ? err.message : "Unbekannter Fehler"));
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleDelete = async (mediaId: string, storagePath: string | null) => {
    if (!confirm("Möchtest du dieses Media-Item wirklich löschen?")) return;

    try {
      // Delete from storage first (if path exists)
      if (storagePath) {
        const { error: storageError } = await supabase.storage
          .from("crm-vault-media")
          .remove([storagePath]);

        if (storageError) {
          console.warn("Storage deletion warning:", storageError);
          // Continue with DB deletion even if storage deletion fails
        }
      }

      // Delete database record
      const { error: dbError } = await supabase
        .from("crm_vault_media")
        .delete()
        .eq("id", mediaId);

      if (dbError) throw dbError;
      setMedia(media.filter((m) => m.id !== mediaId));
    } catch (err) {
      console.error("Error deleting media:", err);
      alert("Fehler beim Löschen");
    }
  };

  const filteredMedia =
    filter === "all"
      ? media
      : media.filter((m) => m.media_type === filter);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const getMediaIcon = (type: string) => {
    switch (type) {
      case "image":
        return "🖼️";
      case "video":
        return "🎥";
      case "document":
        return "📄";
      default:
        return "📎";
    }
  };

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-[#F3E5AB]">
      <WorkspaceSidebar
        connectedModelIds={[]}
        selectedModel={null}
        onSelectModel={() => {}}
        currentHub="upload"
        userRole={userRole}
      />
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-black uppercase tracking-wider mb-2">
            <span>📤</span>{" "}
            <span className="bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent">
              Upload Vault
            </span>
          </h1>
          <p className="text-slate-400">
            Verwalte deine Media-Dateien und Content für schnelle Integration in Chats
          </p>
        </div>

        {/* Upload Area */}
        <section className="mb-8 p-8 rounded-xl border-2 border-dashed border-[#AA7C11]/50 bg-black/40 hover:border-[#D4AF37]/70 transition cursor-pointer"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDragDrop}
        >
          <div className="text-center">
            <div className="text-5xl mb-4">📁</div>
            <h2 className="text-lg font-bold text-[#D4AF37] mb-2 uppercase">
              Datei hochladen
            </h2>
            <p className="text-slate-400 mb-4">
              Ziehe Dateien hierher oder klicke zum Auswählen
            </p>
            <p className="text-xs text-slate-500 mb-4">
              Unterstützte Formate: Bilder (JPG, PNG, WebP), Videos (MP4, WebM), Dokumente (PDF)
            </p>

            <label className="inline-block">
              <input
                type="file"
                onChange={(e) =>
                  e.target.files && handleFileUpload(e.target.files[0])
                }
                disabled={isUploading}
                className="hidden"
                accept="image/*,video/*,.pdf"
              />
              <button
                className="px-6 py-3 bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] text-black font-bold rounded-lg uppercase tracking-wider transition shadow-lg disabled:opacity-50"
                disabled={isUploading}
              >
                {isUploading ? `Uploading... ${uploadProgress}%` : "➕ Datei wählen"}
              </button>
            </label>

            {isUploading && uploadProgress > 0 && (
              <div className="mt-4 w-full bg-[#050505] rounded-full h-2 overflow-hidden">
                <div
                  className="bg-[#D4AF37] h-full transition-all"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            )}
          </div>
        </section>

        {/* Filter Tabs */}
        <div className="mb-6 flex gap-2 border-b border-[#AA7C11]/20 pb-4 flex-wrap">
          {(["all", "image", "video", "document"] as const).map((filterType) => (
            <button
              key={filterType}
              onClick={() => setFilter(filterType)}
              className={`px-4 py-2 rounded-lg font-bold uppercase text-xs tracking-wider transition ${
                filter === filterType
                  ? "bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]"
                  : "bg-[#050505] text-slate-400 hover:text-[#F3E5AB]"
              }`}
            >
              {filterType === "all"
                ? "📦 Alle"
                : filterType === "image"
                ? "🖼️ Bilder"
                : filterType === "video"
                ? "🎥 Videos"
                : "📄 Dokumente"}
              ({media.filter((m) => filterType === "all" || m.media_type === filterType).length})
            </button>
          ))}
        </div>

        {/* Media Grid */}
        {filteredMedia.length === 0 ? (
          <div className="bg-black/40 p-12 rounded-xl border border-[#AA7C11]/10 text-center text-slate-400">
            <p className="text-lg">
              {media.length === 0
                ? "Noch keine Dateien hochgeladen. Starten Sie mit einem Upload!"
                : "Keine Dateien in dieser Kategorie."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMedia.map((item) => (
              <div
                key={item.id}
                className="bg-black/40 rounded-lg border border-[#AA7C11]/10 overflow-hidden hover:border-[#D4AF37]/30 transition"
              >
                {/* Media Preview */}
                <div className="w-full h-32 bg-[#050505] flex items-center justify-center overflow-hidden">
                  {item.media_type === "image" && item.preview_url ? (
                    <img
                      src={item.preview_url}
                      alt="preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-5xl">{getMediaIcon(item.media_type)}</div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{getMediaIcon(item.media_type)}</span>
                    <span className="text-xs font-bold bg-[#AA7C11]/20 px-2 py-1 rounded uppercase">
                      {item.media_type}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 mb-2 line-clamp-2">
                    {item.mime_type}
                  </p>

                  <p className="text-xs text-slate-500 mb-3">
                    {formatFileSize(item.file_size_bytes)} • {new Date(item.created_at).toLocaleDateString("de-DE")}
                  </p>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <a
                      href={item.media_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 px-2 py-2 bg-[#D4AF37]/20 text-[#D4AF37] font-bold rounded text-xs hover:bg-[#D4AF37]/30 transition text-center"
                    >
                      🔗 Öffnen
                    </a>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(item.media_url);
                        alert("URL kopiert!");
                      }}
                      className="flex-1 px-2 py-2 bg-slate-600/30 text-slate-300 font-bold rounded text-xs hover:bg-slate-600/50 transition"
                    >
                      📋 Link
                    </button>
                    <button
                      onClick={() => handleDelete(item.id, item.storage_path)}
                      className="px-2 py-2 bg-red-500/10 text-red-400 font-bold rounded text-xs hover:bg-red-500/20 transition"
                    >
                      ❌
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </main>
    </div>
  );
}
