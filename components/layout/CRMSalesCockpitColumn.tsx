"use client";

import { useState } from "react";
import { ScriptLibrary, FanMetadata } from "@/app/crm-inbox/types";

interface SalesCockpitColumnProps {
  fanMetadata: FanMetadata | null;
  scripts: ScriptLibrary[];
  selectedScript: ScriptLibrary | null;
  onSelectScript: (script: ScriptLibrary) => void;
  onNotesChange: (notes: string) => void;
  isSavingNotes: boolean;
  modelNotes?: string;
  onModelNotesChange?: (notes: string) => void;
  isSavingModelNotes?: boolean;
}

export default function SalesCockpitColumn({
  fanMetadata,
  scripts,
  selectedScript,
  onSelectScript,
  onNotesChange,
  isSavingNotes,
  modelNotes,
  onModelNotesChange,
  isSavingModelNotes,
}: SalesCockpitColumnProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="h-full bg-black/40 border-l border-[#D4AF37]/20 overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-black/60 p-4 border-b border-[#D4AF37]/20 z-10">
        <h2 className="text-sm font-black text-[#D4AF37] uppercase tracking-wider">
          💼 Sales Cockpit
        </h2>
      </div>

      {/* Two Sections */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {/* Model Notes - always the same, regardless of which fan is open */}
        {onModelNotesChange && (
          <div className="border-b border-[#AA7C11]/20 p-4 space-y-2 bg-[#D4AF37]/5">
            <p className="text-xs text-[#D4AF37] uppercase tracking-widest font-bold">
              🏢 Model Notes
            </p>
            <textarea
              value={modelNotes || ""}
              onChange={(e) => onModelNotesChange(e.target.value)}
              placeholder="General notes about this model (visible in every fan chat)..."
              className="w-full h-16 bg-black/60 border border-[#D4AF37]/30 rounded p-2 text-xs text-[#F3E5AB] placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-[#D4AF37] resize-none"
              disabled={isSavingModelNotes}
            />
            {isSavingModelNotes && (
              <p className="text-xs text-slate-500">💾 Saving...</p>
            )}
          </div>
        )}

        {/* TOP: Fan Metadata */}
        <div className="border-b border-[#AA7C11]/20 p-4 space-y-3">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-2 font-bold">
              📝 Fan Notes
            </p>
            <textarea
              value={fanMetadata?.notes || ""}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Add notes about this fan..."
              className="w-full h-20 bg-black/60 border border-[#D4AF37]/30 rounded p-2 text-xs text-[#F3E5AB] placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-[#D4AF37] resize-none"
              disabled={isSavingNotes}
            />
            {isSavingNotes && (
              <p className="text-xs text-slate-500 mt-1">💾 Saving...</p>
            )}
          </div>

          <div>
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-2 font-bold">
              💰 Revenue
            </p>
            <p className="text-sm text-[#D4AF37] font-bold">
              {fanMetadata?.purchase_history || "$0.00"}
            </p>
          </div>

          {fanMetadata?.tags && fanMetadata.tags.length > 0 && (
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-2 font-bold">
                🏷️ Tags
              </p>
              <div className="flex flex-wrap gap-1">
                {fanMetadata.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-1 rounded bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM: Script Library */}
        <div className="flex-1 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">
              📚 Script Library ({scripts.length})
            </p>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-[#D4AF37] hover:text-[#F3E5AB] transition"
            >
              {isExpanded ? "−" : "+"}
            </button>
          </div>

          {isExpanded && (
            <div className="space-y-2">
              {scripts.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">
                  No scripts available
                </p>
              ) : (
                scripts.map((script) => (
                  <button
                    key={script.id}
                    onClick={() => onSelectScript(script)}
                    className={`w-full p-3 rounded-lg text-left transition border ${
                      selectedScript?.id === script.id
                        ? "bg-[#D4AF37]/20 border-[#D4AF37]/50"
                        : "bg-black/60 border-[#AA7C11]/20 hover:border-[#D4AF37]/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-xs font-bold text-[#F3E5AB]">
                          {script.title}
                        </p>
                        {script.trigger_keyword && (
                          <p className="text-xs text-slate-500 mt-1">
                            Keyword: <span className="font-mono">{script.trigger_keyword}</span>
                          </p>
                        )}
                        <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                          {script.script_content}
                        </p>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded whitespace-nowrap flex-shrink-0 ${
                          script.category === "greeting"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : script.category === "offer"
                              ? "bg-amber-500/20 text-amber-300"
                              : script.category === "follow_up"
                                ? "bg-blue-500/20 text-blue-300"
                                : "bg-purple-500/20 text-purple-300"
                        }`}
                      >
                        {script.category}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Status Indicator */}
      <div className="p-3 bg-black/60 border-t border-[#AA7C11]/20 text-center">
        {selectedScript ? (
          <p className="text-xs text-emerald-400">
            ✓ Script selected: <span className="font-bold">{selectedScript.title}</span>
          </p>
        ) : (
          <p className="text-xs text-slate-500">Select a script to inject</p>
        )}
      </div>
    </div>
  );
}
