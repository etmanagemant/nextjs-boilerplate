"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

interface Script {
  id: string;
  title: string;
  script_content: string;
  category: "greeting" | "offer" | "follow_up" | "custom";
  is_global: boolean;
  assigned_to_user: string | null;
}

interface ScriptPickerProps {
  userId: string;
  userRole: string;
  onSelect: (content: string) => void;
  onClose: () => void;
}

const CATEGORY_LABEL: Record<Script["category"], string> = {
  greeting: "👋 Willkommensgruß",
  offer: "🎁 Angebot",
  follow_up: "📨 Follow-Up",
  custom: "📌 Sonstiges",
};

/**
 * Quick-insert picker for the Script Vault, shown next to the emoji bar in
 * OnlyFansViewer - same "click to insert into the real compose box"
 * pattern as EmojiPicker, just for whole saved script texts instead of
 * single emoji. Reuses crm_script_library directly (same table/filtering
 * as ScriptVaultClient) rather than a new endpoint.
 */
export default function ScriptPicker({ userId, userRole, onSelect, onClose }: ScriptPickerProps) {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("crm_script_library")
        .select("id, title, script_content, category, is_global, assigned_to_user")
        .order("created_at", { ascending: false });
      setScripts(data || []);
      setIsLoading(false);
    })();
  }, []);

  const visibleScripts = scripts.filter(
    (s) => s.is_global || s.assigned_to_user === userId || userRole === "admin"
  );

  return (
    <div className="absolute bottom-full mb-2 left-0 right-0 z-30 bg-[#0A0A0A] border border-[#C9A86A]/40 rounded-xl shadow-2xl shadow-black/60 flex flex-col max-h-80 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#9C7A3D]/20">
        <span className="text-xs font-bold text-[#C9A86A] uppercase tracking-wider">📜 Script Vault</span>
        <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300 px-2 flex-shrink-0">
          ✕
        </button>
      </div>

      <div className="overflow-y-auto p-2 space-y-1.5">
        {isLoading ? (
          <p className="text-xs text-slate-500 text-center py-4">Lade Scripts...</p>
        ) : visibleScripts.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">Noch keine Scripts verfügbar.</p>
        ) : (
          visibleScripts.map((script) => (
            <button
              key={script.id}
              onClick={() => onSelect(script.script_content)}
              className="w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-[#C9A86A]/15 transition"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-[#E2C48A] truncate">{script.title}</span>
                <span className="text-[9px] text-slate-500 flex-shrink-0">{CATEGORY_LABEL[script.category]}</span>
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">{script.script_content}</p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
