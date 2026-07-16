"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";

interface Script {
  id: string;
  title: string;
  script_content: string;
  category: "greeting" | "offer" | "follow_up" | "custom";
  is_global: boolean;
  assigned_to_user: string | null;
  created_at: string;
}

interface Chatter {
  user_id: string;
  full_name: string;
  role: string;
}

interface ScriptVaultClientProps {
  initialScripts: Script[];
  chatters: Chatter[];
  userId: string;
  userRole: string;
  userName: string;
}

export default function ScriptVaultClient({
  initialScripts,
  chatters,
  userId,
  userRole,
  userName,
}: ScriptVaultClientProps) {
  const [scripts, setScripts] = useState<Script[]>(initialScripts);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    category: "custom" as "greeting" | "offer" | "follow_up" | "custom",
    isGlobal: false,
    assignTo: "",
  });

  const supabase = createClient();

  const handleReset = () => {
    setFormData({
      title: "",
      content: "",
      category: "custom",
      isGlobal: false,
      assignTo: "",
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.content) return;

    setIsLoading(true);
    try {
      if (editingId) {
        // Update existing script
        const { data, error } = await supabase
          .from("crm_script_library")
          .update({
            title: formData.title,
            script_content: formData.content,
            category: formData.category,
            is_global: formData.isGlobal,
            assigned_to_user: formData.assignTo || null,
          })
          .eq("id", editingId)
          .select()
          .single();

        if (error) throw error;
        setScripts(scripts.map((s) => (s.id === editingId ? data : s)));
      } else {
        // Create new script
        const { data, error } = await supabase
          .from("crm_script_library")
          .insert({
            title: formData.title,
            script_content: formData.content,
            category: formData.category,
            is_global: formData.isGlobal,
            assigned_to_user: formData.assignTo || null,
            created_by: userId,
          })
          .select()
          .single();

        if (error) throw error;
        setScripts([data, ...scripts]);
      }

      handleReset();
    } catch (err) {
      console.error("Error saving script:", err);
      alert("Fehler beim Speichern des Scripts");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (script: Script) => {
    setFormData({
      title: script.title,
      content: script.script_content,
      category: script.category,
      isGlobal: script.is_global,
      assignTo: script.assigned_to_user || "",
    });
    setEditingId(script.id);
    setShowForm(true);
  };

  const handleDelete = async (scriptId: string) => {
    if (!confirm("Möchtest du dieses Script wirklich löschen?")) return;

    try {
      const { error } = await supabase
        .from("crm_script_library")
        .delete()
        .eq("id", scriptId);

      if (error) throw error;
      setScripts(scripts.filter((s) => s.id !== scriptId));
    } catch (err) {
      console.error("Error deleting script:", err);
      alert("Fehler beim Löschen des Scripts");
    }
  };

  const displayScripts = scripts.filter((s) => {
    // Show global scripts and user's own scripts
    if (s.is_global) return true;
    if (s.assigned_to_user === userId) return true;
    // Admins see all scripts for management
    if (userRole === "admin") return true;
    return false;
  });

  return (
    <main className="min-h-screen bg-[#0A0A0A] text-[#F3E5AB]">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-black uppercase tracking-wider mb-2">
            <span>📜</span>{" "}
            <span className="bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent">
              Script Vault
            </span>
          </h1>
          <p className="text-slate-400">
            {userRole === "admin"
              ? "Verwalte globale und persönliche Sales-Scripts für alle Chatters"
              : "Deine persönlichen und globalen Response-Templates"}
          </p>
        </div>

        {/* Add New Script Button */}
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="mb-8 px-6 py-3 bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] text-black font-bold rounded-lg uppercase tracking-wider transition shadow-lg"
          >
            ➕ Neues Script erstellen
          </button>
        )}

        {/* Script Form */}
        {showForm && (
          <section className="mb-8 bg-black/40 p-6 rounded-xl border border-[#AA7C11]/20 shadow-lg">
            <h2 className="text-lg font-bold text-[#D4AF37] mb-4 uppercase">
              {editingId ? "✏️ Script bearbeiten" : "✨ Neues Script hinzufügen"}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">
                  Script-Titel
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="z.B. Willkommens-Gruß"
                  className="w-full bg-[#050505] border border-[#AA7C11]/20 rounded px-3 py-2 text-white text-sm outline-none focus:border-[#D4AF37]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">
                  Script-Text
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  placeholder="Dein Sales-Script hier..."
                  rows={6}
                  className="w-full bg-[#050505] border border-[#AA7C11]/20 rounded px-3 py-2 text-white text-sm outline-none focus:border-[#D4AF37]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">
                    Kategorie
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        category: e.target.value as any,
                      })
                    }
                    className="w-full bg-[#050505] border border-[#AA7C11]/20 rounded px-3 py-2 text-white text-sm outline-none focus:border-[#D4AF37]"
                  >
                    <option value="greeting">Willkommengruß</option>
                    <option value="offer">Angebot</option>
                    <option value="follow_up">Follow-Up</option>
                    <option value="custom">Sonstiges</option>
                  </select>
                </div>

                {userRole === "admin" && (
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">
                      Zuordnung
                    </label>
                    <select
                      value={formData.assignTo}
                      onChange={(e) =>
                        setFormData({ ...formData, assignTo: e.target.value })
                      }
                      className="w-full bg-[#050505] border border-[#AA7C11]/20 rounded px-3 py-2 text-white text-sm outline-none focus:border-[#D4AF37]"
                    >
                      <option value="">-- Global verfügbar --</option>
                      {chatters.map((c) => (
                        <option key={c.user_id} value={c.user_id}>
                          {c.full_name} ({c.role})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isGlobal}
                    onChange={(e) =>
                      setFormData({ ...formData, isGlobal: e.target.checked })
                    }
                    className="w-4 h-4 accent-[#D4AF37]"
                  />
                  <span className="text-xs font-bold text-slate-400">
                    🌍 Global für alle sichtbar
                  </span>
                </label>
              </div>

              <div className="flex gap-3 pt-4 border-t border-[#AA7C11]/10">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] px-4 py-2 text-black font-bold rounded uppercase cursor-pointer disabled:opacity-50 transition"
                >
                  {isLoading ? "Speichern..." : editingId ? "✓ Aktualisieren" : "✓ Erstellen"}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex-1 bg-slate-600/30 text-slate-300 py-2 px-4 rounded-lg font-bold uppercase tracking-wider text-sm hover:bg-slate-600/50 transition"
                >
                  ✕ Abbrechen
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Scripts Grid */}
        <div className="space-y-4">
          {displayScripts.length === 0 ? (
            <div className="bg-black/40 p-8 rounded-xl border border-[#AA7C11]/10 text-center text-slate-400">
              <p className="text-sm">
                {scripts.length === 0
                  ? "Noch keine Scripts vorhanden. Erstelle dein erstes Script!"
                  : "Keine Scripts für dich verfügbar."}
              </p>
            </div>
          ) : (
            displayScripts.map((script) => (
              <div
                key={script.id}
                className="bg-black/40 p-4 rounded-lg border border-[#AA7C11]/10 space-y-3 hover:border-[#D4AF37]/30 transition"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <h3 className="font-bold text-[#D4AF37] mb-1">
                      {script.title}
                    </h3>
                    <div className="flex gap-2 mb-2 flex-wrap">
                      <span className="text-[10px] bg-[#AA7C11]/20 px-2 py-1 rounded uppercase font-bold">
                        {script.category === "greeting"
                          ? "👋 Willkommengruß"
                          : script.category === "offer"
                          ? "🎁 Angebot"
                          : script.category === "follow_up"
                          ? "📨 Follow-Up"
                          : "📌 Sonstiges"}
                      </span>
                      {script.is_global && (
                        <span className="text-[10px] bg-emerald-500/20 px-2 py-1 rounded uppercase font-bold text-emerald-400">
                          🌍 Global
                        </span>
                      )}
                      {script.assigned_to_user &&
                        script.assigned_to_user !== userId && (
                          <span className="text-[10px] bg-blue-500/20 px-2 py-1 rounded uppercase font-bold text-blue-400">
                            👤 Zugeordnet
                          </span>
                        )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {userRole === "admin" && (
                      <button
                        onClick={() => handleEdit(script)}
                        className="text-[#D4AF37] hover:text-[#E5C158] font-bold text-sm"
                      >
                        ✏️
                      </button>
                    )}
                    {userRole === "admin" && (
                      <button
                        onClick={() => handleDelete(script.id)}
                        className="text-red-400 hover:text-red-300 font-bold text-sm"
                      >
                        ❌
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-400 bg-[#050505]/50 p-3 rounded whitespace-pre-wrap max-h-24 overflow-y-auto">
                  {script.script_content}
                </p>

                <p className="text-[10px] text-slate-500">
                  Erstellt: {new Date(script.created_at).toLocaleString("de-DE")}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
