"use client";

import { useState } from "react";
import { connectCreatorSession } from "@/app/management/crm-connect/actions";

interface ConnectCreatorPanelProps {
  modelId: string;
  modelName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ConnectCreatorPanel({
  modelId,
  modelName,
  isOpen,
  onClose,
  onSuccess,
}: ConnectCreatorPanelProps) {
  const [authJsonInput, setAuthJsonInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      // Validate JSON
      try {
        JSON.parse(authJsonInput);
      } catch {
        throw new Error(
          "Invalid JSON format. Please paste a valid JSON object."
        );
      }

      const formData = new FormData();
      formData.append("model_id", modelId);
      formData.append("auth_cookies", authJsonInput);

      const result = await connectCreatorSession(formData);

      setSuccess(result.message);
      setAuthJsonInput("");

      // Reset and close after 2 seconds
      setTimeout(() => {
        onClose();
        onSuccess();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over Panel */}
      <div className="fixed right-0 top-0 h-screen w-full max-w-md bg-[#0A0A0A] border-l border-[#D4AF37]/20 shadow-2xl z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#0A0A0A] border-b border-[#D4AF37]/20 p-6 flex justify-between items-center">
          <h2 className="text-xl font-black text-[#D4AF37] uppercase tracking-wider">
            🔗 Connect Creator
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-[#D4AF37] text-2xl font-bold transition"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Model Info */}
          <div className="bg-black/40 p-4 rounded-lg border border-[#D4AF37]/20">
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">
              Selected Creator
            </p>
            <p className="text-lg font-bold text-[#F3E5AB]">{modelName}</p>
          </div>

          {/* Instructions */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <h3 className="text-sm font-bold text-blue-300 mb-2">
              📋 Authentication Header Format
            </h3>
            <p className="text-xs text-blue-200 mb-3">
              Paste the OnlyFans authentication JSON object. This should contain:
            </p>
            <code className="block bg-black/60 p-3 rounded text-xs text-lime-400 font-mono overflow-x-auto">
              {`{
  "auth_id": "...",
  "sess": "...",
  "user_agent": "...",
  "x_bc_token": "..."
}`}
            </code>
          </div>

          {/* JSON Input */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                OnlyFans Auth Cookies (JSON)
              </label>
              <textarea
                value={authJsonInput}
                onChange={(e) => setAuthJsonInput(e.target.value)}
                placeholder={`Paste your OnlyFans authentication JSON here...`}
                className="w-full h-48 bg-black/60 border border-[#D4AF37]/30 rounded-lg p-4 text-sm text-[#F3E5AB] font-mono placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent resize-none"
                disabled={isLoading}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-xs text-red-300">
                  <span className="font-bold">⚠️ Error:</span> {error}
                </p>
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                <p className="text-xs text-emerald-300">
                  <span className="font-bold">✓ Success:</span> {success}
                </p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !authJsonInput.trim()}
              className={`w-full py-3 px-4 rounded-lg font-bold uppercase tracking-wider text-sm transition ${
                isLoading || !authJsonInput.trim()
                  ? "bg-slate-600/30 text-slate-500 cursor-not-allowed"
                  : "bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB] text-[#0A0A0A] hover:shadow-lg hover:shadow-[#D4AF37]/50"
              }`}
            >
              {isLoading ? "🔄 Connecting..." : "✓ Connect Creator"}
            </button>
          </form>

          {/* Security Notice */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
            <p className="text-xs text-amber-200">
              <span className="font-bold">🔒 Security:</span> Authentication
              tokens are encrypted and stored securely in the database. Never
              share your credentials with third parties.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
