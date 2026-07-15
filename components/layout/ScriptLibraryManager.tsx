"use client";

import { useState, useEffect } from "react";
import {
  addScriptToLibrary,
  deleteScriptFromLibrary,
  updateScript,
  ScriptLibraryItem,
} from "@/app/management/crm-connect/actions";

interface Script {
  id: string;
  title: string;
  script_content: string;
  category: "greeting" | "offer" | "follow_up" | "custom";
  is_global: boolean;
  assigned_to_user: string | null;
}

interface ScriptLibraryManagerProps {
  globalScripts: Script[];
  teamChatters: Array<{ user_id: string; full_name: string }>;
  onRefresh: () => void;
}

export default function ScriptLibraryManager({
  globalScripts,
  teamChatters,
  onRefresh,
}: ScriptLibraryManagerProps) {
  const [isAddingScript, setIsAddingScript] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<ScriptLibraryItem>>({
    title: "",
    scriptContent: "",
    category: "custom",
    isGlobal: true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleAddScript = async () => {
    if (!formData.title || !formData.scriptContent) {
      setMessage({ type: "error", text: "Please fill in all fields" });
      return;
    }

    setIsLoading(true);
    try {
      await addScriptToLibrary(formData as ScriptLibraryItem);
      setMessage({ type: "success", text: "Script added successfully!" });
      setFormData({
        title: "",
        scriptContent: "",
        category: "custom",
        isGlobal: true,
      });
      setIsAddingScript(false);
      setTimeout(() => onRefresh(), 500);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Error adding script",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteScript = async (scriptId: string) => {
    if (!confirm("Are you sure you want to delete this script?")) return;

    setIsLoading(true);
    try {
      await deleteScriptFromLibrary(scriptId);
      setMessage({ type: "success", text: "Script deleted successfully!" });
      setTimeout(() => onRefresh(), 500);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Error deleting script",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateScript = async (scriptId: string) => {
    if (!formData.title || !formData.scriptContent) {
      setMessage({ type: "error", text: "Please fill in all fields" });
      return;
    }

    setIsLoading(true);
    try {
      await updateScript(scriptId, formData);
      setMessage({ type: "success", text: "Script updated successfully!" });
      setEditingId(null);
      setFormData({
        title: "",
        scriptContent: "",
        category: "custom",
        isGlobal: true,
      });
      setTimeout(() => onRefresh(), 500);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Error updating script",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const categoryColors: Record<string, string> = {
    greeting: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    offer: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    follow_up: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    custom: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-[#D4AF37] uppercase tracking-wider">
            📚 Script Library
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Manage communication templates and global scripts
          </p>
        </div>
        <button
          onClick={() => setIsAddingScript(!isAddingScript)}
          disabled={isAddingScript || editingId !== null}
          className="bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 disabled:opacity-50 text-[#D4AF37] px-4 py-2 rounded-lg font-bold text-sm uppercase tracking-wider transition"
        >
          {isAddingScript ? "✕ Cancel" : "+ Add Script"}
        </button>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`p-4 rounded-lg border ${
            message.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-red-500/10 border-red-500/30 text-red-300"
          }`}
        >
          {message.type === "success" ? "✓" : "⚠️"} {message.text}
        </div>
      )}

      {/* Add/Edit Form */}
      {(isAddingScript || editingId !== null) && (
        <div className="bg-black/40 p-6 rounded-xl border border-[#D4AF37]/20 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              Script Title
            </label>
            <input
              type="text"
              value={formData.title || ""}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="e.g., Welcome Greeting"
              className="w-full bg-black/60 border border-[#D4AF37]/30 rounded-lg px-4 py-2 text-sm text-[#F3E5AB] placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              Script Content
            </label>
            <textarea
              value={formData.scriptContent || ""}
              onChange={(e) =>
                setFormData({ ...formData, scriptContent: e.target.value })
              }
              placeholder="Enter the communication script..."
              className="w-full h-32 bg-black/60 border border-[#D4AF37]/30 rounded-lg px-4 py-2 text-sm text-[#F3E5AB] placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#D4AF37] resize-none"
              disabled={isLoading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                Category
              </label>
              <select
                value={formData.category || "custom"}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    category: e.target.value as ScriptLibraryItem["category"],
                  })
                }
                className="w-full bg-black/60 border border-[#D4AF37]/30 rounded-lg px-4 py-2 text-sm text-[#F3E5AB] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                disabled={isLoading}
              >
                <option value="greeting">Greeting</option>
                <option value="offer">Offer</option>
                <option value="follow_up">Follow-up</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                Visibility
              </label>
              <select
                value={formData.isGlobal ? "global" : "personal"}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    isGlobal: e.target.value === "global",
                  })
                }
                className="w-full bg-black/60 border border-[#D4AF37]/30 rounded-lg px-4 py-2 text-sm text-[#F3E5AB] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                disabled={isLoading}
              >
                <option value="global">Global</option>
                <option value="personal">Personal</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() =>
                editingId ? handleUpdateScript(editingId) : handleAddScript()
              }
              disabled={isLoading}
              className="flex-1 bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB] text-[#0A0A0A] py-2 px-4 rounded-lg font-bold uppercase tracking-wider text-sm hover:shadow-lg hover:shadow-[#D4AF37]/50 disabled:opacity-50 transition"
            >
              {isLoading ? "🔄 Saving..." : editingId ? "✓ Update" : "✓ Add"}
            </button>
            <button
              onClick={() => {
                setIsAddingScript(false);
                setEditingId(null);
                setFormData({
                  title: "",
                  scriptContent: "",
                  category: "custom",
                  isGlobal: true,
                });
              }}
              className="flex-1 bg-slate-600/30 text-slate-300 py-2 px-4 rounded-lg font-bold uppercase tracking-wider text-sm hover:bg-slate-600/50 transition"
            >
              ✕ Cancel
            </button>
          </div>
        </div>
      )}

      {/* Scripts List */}
      <div className="space-y-3">
        {globalScripts.length === 0 ? (
          <div className="bg-black/40 p-8 rounded-xl border border-[#AA7C11]/10 text-center text-slate-400">
            <p className="text-sm">No scripts in library yet. Create one to get started!</p>
          </div>
        ) : (
          globalScripts.map((script) => (
            <div
              key={script.id}
              className="bg-black/40 p-4 rounded-lg border border-[#AA7C11]/10 space-y-3"
            >
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="text-sm font-bold text-[#F3E5AB]">
                      {script.title}
                    </h4>
                    <span
                      className={`text-xs px-2 py-1 rounded border ${
                        categoryColors[script.category] || categoryColors.custom
                      }`}
                    >
                      {script.category}
                    </span>
                    {script.is_global ? (
                      <span className="text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        🌍 Global
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        👤 Personal
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2">
                    {script.script_content}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setFormData({
                        title: script.title,
                        scriptContent: script.script_content,
                        category: script.category,
                        isGlobal: script.is_global,
                      });
                      setEditingId(script.id);
                    }}
                    className="text-[#D4AF37] hover:text-[#F3E5AB] text-sm font-bold transition"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteScript(script.id)}
                    className="text-red-400 hover:text-red-300 text-sm font-bold transition"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
