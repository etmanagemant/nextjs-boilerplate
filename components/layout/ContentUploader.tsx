"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

interface ContentUploaderProps {
  modelId: string;
  onUploadSuccess: () => void;
}

export default function ContentUploader({
  modelId,
  onUploadSuccess,
}: ContentUploaderProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return (
      <div className="text-red-400 text-xs">
        Supabase-Variablen nicht konfiguriert
      </div>
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // ========================================
  // HANDLE FILE UPLOAD
  // ========================================
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!modelId) {
      setErrorMessage("Bitte wähle zuerst ein Model aus!");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setUploadProgress(0);

    try {
      const file = files[0];

      // Validate file type
      if (!file.type.startsWith("image/")) {
        throw new Error("Nur Bilddateien sind erlaubt!");
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        throw new Error("Datei ist zu groß (max 10MB)!");
      }

      // Create unique filename
      const timestamp = Date.now();
      const fileExtension = file.name.split(".").pop();
      const fileName = `${timestamp}-${file.name.replace(/\.[^/.]+$/, "")}.${fileExtension}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from("reddit_content")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        throw new Error("Upload failed - no data returned");
      }

      setUploadProgress(100);

      // Create post entry in database
      const { error: dbError } = await supabase
        .from("content_plan_posts")
        .insert([
          {
            model_id: modelId,
            photo_path: fileName,
            sort_order: new Date().getTime(),
          },
        ]);

      if (dbError) {
        // Delete uploaded file if DB insert fails
        await supabase.storage.from("reddit_content").remove([fileName]);
        throw new Error(`Datenbankfehler: ${dbError.message}`);
      }

      setSuccessMessage(
        `✓ Bild erfolgreich hochgeladen! (${file.name})`
      );
      setUploadProgress(null);

      // Reset after success
      setTimeout(() => {
        setSuccessMessage(null);
        setIsLoading(false);
        onUploadSuccess();
      }, 2000);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unbekannter Fehler";
      setErrorMessage(`❌ Fehler: ${errorMsg}`);
      setIsLoading(false);
      setUploadProgress(null);
    }
  };

  // ========================================
  // DRAG & DROP
  // ========================================
  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileUpload(e.target.files);
  };

  return (
    <section className="bg-black/40 p-6 rounded-xl border border-[#AA7C11]/10 mb-8 shadow-lg">
      <h2 className="text-sm font-bold mb-4 text-[#D4AF37] uppercase tracking-wider">
        📸 Bilder hochladen
      </h2>

      {/* UPLOAD ZONE */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition ${
          isDragActive
            ? "border-[#D4AF37] bg-[#D4AF37]/10"
            : "border-[#AA7C11]/30 bg-[#050505]/50 hover:border-[#AA7C11]/60"
        }`}
      >
        <input
          type="file"
          accept="image/*"
          onChange={handleFileInputChange}
          disabled={isLoading}
          className="absolute inset-0 w-full h-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />

        {isLoading && uploadProgress !== null ? (
          <div className="space-y-3">
            <div className="text-[#D4AF37] font-semibold text-sm">
              Wird hochgeladen...
            </div>
            <div className="w-full bg-[#050505] rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-[#D4AF37] to-[#AA7C11] h-full transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <div className="text-xs text-slate-400">{uploadProgress}%</div>
          </div>
        ) : errorMessage ? (
          <div className="space-y-2">
            <div className="text-red-400 font-semibold text-sm">
              {errorMessage}
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1 rounded hover:bg-red-500/20 cursor-pointer"
            >
              Erneut versuchen
            </button>
          </div>
        ) : successMessage ? (
          <div className="text-emerald-400 font-semibold text-sm">
            {successMessage}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-2xl">📁</div>
            <div className="text-white font-semibold">
              Bild hier ablegen oder klicken
            </div>
            <div className="text-xs text-slate-400">
              Unterstützte Formate: JPG, PNG, GIF, WebP (max 10MB)
            </div>
          </div>
        )}
      </div>

      {/* INFO */}
      <div className="mt-4 text-xs text-slate-500 space-y-1">
        <p>✓ Bilder werden mit aktuellem Datum hochgeladen</p>
        <p>✓ Der Post wird direkt erstellt und ist sofort bearbeitbar</p>
        <p>✓ Mehrere Bilder kannst du nacheinander hochladen</p>
      </div>
    </section>
  );
}
