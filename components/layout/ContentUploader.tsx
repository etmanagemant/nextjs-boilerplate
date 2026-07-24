"use client";

import { useState, useEffect, useRef } from "react";
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
  const supabaseRef = useRef<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize Supabase in useEffect - SAFE
  useEffect(() => {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseKey) {
        supabaseRef.current = createClient(supabaseUrl, supabaseKey);
        setIsInitialized(true);
      }
    } catch (err) {
      console.error("Supabase init error:", err);
    }
  }, []);

  if (!isInitialized) {
    return (
      <section className="bg-black/40 p-6 rounded-xl border border-[#8A6D3F]/10 mb-8 shadow-lg">
        <h2 className="text-sm font-bold mb-4 text-[#D4AF37] uppercase tracking-wider">
          📸 Bilder hochladen
        </h2>
        <div className="text-yellow-400 text-xs text-center py-4">
          ⏳ Wird geladen...
        </div>
      </section>
    );
  }

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!modelId) {
      setErrorMessage("Bitte wähle zuerst ein Model aus!");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setUploadProgress(0);

    try {
      const file = files[0];

      if (!file.type.startsWith("image/")) {
        throw new Error("Nur Bilddateien!");
      }

      if (file.size > 10 * 1024 * 1024) {
        throw new Error("Datei > 10MB");
      }

      const timestamp = Date.now();
      const ext = file.name.split(".").pop();
      const fileName = `${timestamp}-${Math.random().toString(36).substr(2, 9)}.${ext}`;

      const { error } = await supabaseRef.current.storage
        .from("reddit_content")
        .upload(fileName, file);

      if (error) throw error;

      const { error: dbError } = await supabaseRef.current
        .from("content_plan_posts")
        .insert([
          {
            model_id: modelId,
            photo_path: fileName,
            sort_order: timestamp,
          },
        ]);

      if (dbError) throw dbError;

      setSuccessMessage("✓ Erfolgreich!");
      setUploadProgress(null);

      setTimeout(() => {
        setSuccessMessage(null);
        setIsLoading(false);
        onUploadSuccess();
      }, 2000);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Fehler";
      console.error("Upload error:", error);
      setErrorMessage(`❌ ${msg}`);
      setIsLoading(false);
      setUploadProgress(null);
      setTimeout(() => setErrorMessage(null), 5000);
    }
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(e.type === "dragenter" || e.type === "dragover");
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  return (
    <section className="bg-black/40 p-6 rounded-xl border border-[#8A6D3F]/10 mb-8 shadow-lg">
      <h2 className="text-sm font-bold mb-4 text-[#D4AF37] uppercase tracking-wider">
        📸 Bilder hochladen
      </h2>

      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition cursor-pointer ${
          isDragActive
            ? "border-[#D4AF37] bg-[#D4AF37]/10"
            : "border-[#8A6D3F]/30 bg-[#050505]/50 hover:border-[#8A6D3F]/60"
        }`}
      >
        <input
          type="file"
          accept="image/*"
          onChange={(e) => handleFileUpload(e.target.files)}
          disabled={isLoading}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />

        {isLoading && uploadProgress !== null ? (
          <div className="space-y-3">
            <div className="text-[#D4AF37] font-semibold text-sm"><span>⬆️</span> Lädt...</div>
            <div className="w-full bg-[#050505] rounded-full h-2">
              <div
                className="bg-gradient-to-r from-[#D4AF37] to-[#8A6D3F] h-full transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <div className="text-xs text-slate-400">{uploadProgress}%</div>
          </div>
        ) : errorMessage ? (
          <div className="text-red-400 text-xs font-semibold">{errorMessage}</div>
        ) : successMessage ? (
          <div className="text-emerald-400 text-xs font-semibold">{successMessage}</div>
        ) : (
          <div className="space-y-2">
            <div className="text-3xl">📤</div>
            <div className="text-sm text-[#D4AF37] font-bold">
              Zieh Bilder hier hin oder klick
            </div>
            <div className="text-xs text-slate-400">JPG, PNG, GIF (max 10MB)</div>
          </div>
        )}
      </div>
    </section>
  );
}
