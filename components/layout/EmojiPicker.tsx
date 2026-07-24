"use client";

import { useState } from "react";
import { EMOJI_CATEGORIES } from "@/lib/emojiData";

interface EmojiPickerProps {
  quickEmojis: string[];
  onSelect: (emoji: string) => void;
  onToggleQuick: (emoji: string) => void;
  onClose: () => void;
}

/**
 * Full categorized emoji picker (iOS-keyboard-style: category tabs + grid).
 * The star badge on each cell toggles membership in the chatter's own quick
 * bar - a separate click target from the emoji itself so browsing doesn't
 * accidentally insert/select anything.
 */
export default function EmojiPicker({
  quickEmojis,
  onSelect,
  onToggleQuick,
  onClose,
}: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState(0);
  const category = EMOJI_CATEGORIES[activeCategory];

  return (
    <div className="absolute bottom-full mb-2 left-0 right-0 z-30 bg-[#0A0A0A] border border-[#C9A86A]/40 rounded-xl shadow-2xl shadow-black/60 flex flex-col max-h-80 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#9C7A3D]/20">
        <div className="flex gap-1 overflow-x-auto">
          {EMOJI_CATEGORIES.map((cat, idx) => (
            <button
              key={cat.name}
              onClick={() => setActiveCategory(idx)}
              title={cat.name}
              className={`text-lg flex-shrink-0 w-8 h-8 rounded-lg transition ${
                idx === activeCategory
                  ? "bg-[#C9A86A]/20 border border-[#C9A86A]/50"
                  : "hover:bg-white/5"
              }`}
            >
              {cat.icon}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="text-xs text-slate-500 hover:text-slate-300 px-2 flex-shrink-0"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-8 gap-1 p-3 overflow-y-auto">
        {category.emojis.map((emoji) => {
          const isQuick = quickEmojis.includes(emoji);
          return (
            <div key={emoji} className="relative group">
              <button
                onClick={() => onSelect(emoji)}
                className="text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition"
                title={emoji}
              >
                {emoji}
              </button>
              <button
                onClick={() => onToggleQuick(emoji)}
                title={isQuick ? "Aus Schnellauswahl entfernen" : "Zur Schnellauswahl hinzufügen"}
                className={`absolute -top-1 -right-1 text-[10px] w-3.5 h-3.5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition ${
                  isQuick ? "opacity-100 text-[#E2C48A]" : "text-slate-500"
                }`}
              >
                {isQuick ? "★" : "☆"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
