"use client";

import { useState } from "react";
import EmojiPicker from "./EmojiPicker";
import { updateChatterEmojis } from "@/app/management/crm-connect/actions";

interface SmileLeisterProps {
  emojis: string[];
  onEmojiClick: (emoji: string) => void;
  chatterId: string;
  onEmojisChange: (emojis: string[]) => void;
}

export default function SmileLeiste({
  emojis,
  onEmojiClick,
  chatterId,
  onEmojisChange,
}: SmileLeisterProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleToggleQuick = async (emoji: string) => {
    const next = emojis.includes(emoji)
      ? emojis.filter((e) => e !== emoji)
      : [...emojis, emoji];
    onEmojisChange(next);
    try {
      await updateChatterEmojis(chatterId, next);
    } catch (err) {
      console.error("Failed to save quick emojis:", err);
    }
  };

  return (
    <div className="relative flex items-center gap-2 overflow-x-auto pb-2">
      <p className="text-xs text-slate-500 uppercase tracking-widest whitespace-nowrap flex-shrink-0">
        Quick Emojis:
      </p>
      <div className="flex gap-1 flex-wrap">
        {emojis.map((emoji, idx) => (
          <button
            key={idx}
            onClick={() => onEmojiClick(emoji)}
            className="text-2xl p-2 rounded-lg bg-black/60 border border-[#9C7A3D]/20 hover:border-[#C9A86A]/50 hover:bg-black/80 transition"
            title={`Insert ${emoji}`}
          >
            {emoji}
          </button>
        ))}
        <button
          onClick={() => setPickerOpen((v) => !v)}
          title="Mehr Emojis"
          className="text-lg p-2 rounded-lg bg-black/60 border border-dashed border-[#9C7A3D]/40 hover:border-[#C9A86A]/60 text-[#C9A86A] transition"
        >
          {pickerOpen ? "▾" : "➕"}
        </button>
      </div>

      {pickerOpen && (
        <EmojiPicker
          quickEmojis={emojis}
          onSelect={(emoji) => {
            onEmojiClick(emoji);
            setPickerOpen(false);
          }}
          onToggleQuick={handleToggleQuick}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
