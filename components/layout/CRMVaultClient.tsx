"use client";

import { useState, useEffect } from "react";
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

interface CRMVaultClientProps {
  initialScripts: Script[];
  initialChatters: Chatter[];
}

export default function CRMVaultClient({
  initialScripts,
  initialChatters,
}: CRMVaultClientProps) {
  const [scripts, setScripts] = useState<Script[]>(initialScripts);
  const [isLoading, setIsLoading] = useState(false);
  const [newScript, setNewScript] = useState({
    title: "",
    content: "",
    category: "custom" as const,
    isGlobal: false,
  });

  const supabase = createClient();

  const handleAddScript = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScript.title || !newScript.content) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("crm_script_library")
        .insert({
          title: newScript.title,
          script_content: newScript.content,
          category: newScript.category,
          is_global: newScript.isGlobal,
        })
        .select()
        .single();

      if (error) throw error;

      setScripts([data, ...scripts]);
      setNewScript({
        title: "",
        content: "",
        category: "custom",
        isGlobal: false,
      });
    } catch (err) {
      console.error("Error adding script:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteScript = async (scriptId: string) => {
    try {
      await supabase
        .from("crm_script_library")
        .delete()
        .eq("id", scriptId);

      setScripts(scripts.filter((s) => s.id !== scriptId));
    } catch (err) {
      console.error("Error deleting script:", err);
    }
  };

  return (
    <main className="p-6 max-w-6xl mx-auto min-h-screen bg-[#0A0A0A] text-[#F3E5AB]">
      <div className="mb-8">
        <h1 className="text-3xl font-black uppercase tracking-wider mb-2">
          <span>📚</span> <span className="bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent">Script Vault</span>
        </h1>
        <p className="text-slate-400">Verwalte globale und benutzerdefinierte Sales-Scripts für alle Chatters</p>
      </div>

      {/* Add New Script Form */}
      <section className="mb-8 bg-black/40 p-6 rounded-xl border border-[#AA7C11]/20 shadow-lg">
        <h2 className="text-lg font-bold text-[#D4AF37] mb-4 uppercase">✨ Neues Script hinzufügen</h2>
        <form onSubmit={handleAddScript} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">Script-Titel</label>
            <input
              type="text"
              value={newScript.title}
              onChange={(e) => setNewScript({ ...newScript, title: e.target.value })}
              placeholder="z.B. Welcome Greeting"
              className="w-full bg-[#050505] border border-[#AA7C11]/20 rounded px-3 py-2 text-white text-sm outline-none focus:border-[#D4AF37]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">Script-Text</label>
            <textarea
              value={newScript.content}
              onChange={(e) => setNewScript({ ...newScript, content: e.target.value })}
              placeholder="Dein Sales-Script hier..."
              rows={5}
              className="w-full bg-[#050505] border border-[#AA7C11]/20 rounded px-3 py-2 text-white text-sm outline-none focus:border-[#D4AF37]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">Kategorie</label>
              <select
                value={newScript.category}
                onChange={(e) => setNewScript({ ...newScript, category: e.target.value as any })}
                className="w-full bg-[#050505] border border-[#AA7C11]/20 rounded px-3 py-2 text-white text-sm outline-none focus:border-[#D4AF37]"
              >
                <option value="greeting">Greeting</option>
                <option value="offer">Offer</option>
                <option value="follow_up">Follow-up</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newScript.isGlobal}
                  onChange={(e) => setNewScript({ ...newScript, isGlobal: e.target.checked })}
                  className="w-4 h-4 accent-[#D4AF37]"
                />
                <span className="text-xs font-bold text-slate-400">Global verfügbar</span>
              </label>
            </div>
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] px-4 py-3 text-black font-bold rounded uppercase cursor-pointer disabled:opacity-50"
          >
            {isLoading ? "Wird hinzugefügt..." : "✅ Script hinzufügen"}
          </button>
        </form>
      </section>

      {/* Scripts List */}
      <section>
        <h2 className="text-lg font-bold text-[#D4AF37] mb-4 uppercase">📋 Alle Scripts ({scripts.length})</h2>
        <div className="space-y-3">
          {scripts.length > 0 ? (
            scripts.map((script) => (
              <div key={script.id} className="bg-black/40 p-4 rounded-lg border border-[#AA7C11]/20 hover:border-[#D4AF37]/40 transition">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-[#F3E5AB]">{script.title}</h3>
                    <div className="flex gap-2 mt-1">
                      <span className="text-[10px] bg-[#AA7C11]/20 px-2 py-1 rounded uppercase font-bold">{script.category}</span>
                      {script.is_global && <span className="text-[10px] bg-emerald-500/20 px-2 py-1 rounded uppercase font-bold text-emerald-400">🌍 Global</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteScript(script.id)}
                    className="text-red-400 hover:text-red-300 font-bold text-xs"
                  >
                    ❌ Löschen
                  </button>
                </div>
                <p className="text-xs text-slate-400 bg-[#050505]/50 p-2 rounded whitespace-pre-wrap">{script.script_content}</p>
                <p className="text-[10px] text-slate-500 mt-2">
                  Erstellt: {new Date(script.created_at).toLocaleString("de-DE")}
                </p>
              </div>
            ))
          ) : (
            <div className="text-center text-slate-400 py-8">
              Noch keine Scripts vorhanden. Erstelle dein erstes Script oben!
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
