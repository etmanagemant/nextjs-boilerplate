"use client";

interface SmileLeisterProps {
  emojis: string[];
  onEmojiClick: (emoji: string) => void;
}

export default function SmileLeiste({
  emojis,
  onEmojiClick,
}: SmileLeisterProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2">
      <p className="text-xs text-slate-500 uppercase tracking-widest whitespace-nowrap flex-shrink-0">
        Quick Emojis:
      </p>
      <div className="flex gap-1 flex-wrap">
        {emojis.map((emoji, idx) => (
          <button
            key={idx}
            onClick={() => onEmojiClick(emoji)}
            className="text-2xl p-2 rounded-lg bg-black/60 border border-[#AA7C11]/20 hover:border-[#D4AF37]/50 hover:bg-black/80 transition"
            title={`Insert ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
