"use client";

import { useEffect, useState } from "react";

// A reasonably large, categorized set (not the full Unicode emoji list -
// that's thousands of characters, unusable in a picker) covering what a
// chat/sales context actually needs. Favorites are per-browser (persisted
// in localStorage, not a DB table - purely a personal UI preference, no
// need to sync across devices for this).
const CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: "Häufig",
    emojis: ["😊", "😂", "🔥", "❤️", "😍", "👏", "🎉", "😉", "😘", "🙈", "💦", "🍑", "😏", "🥵", "😈", "🤤", "💋", "🍆", "🌶️", "😻"],
  },
  {
    label: "Gesichter",
    emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🥵", "🥶", "😵", "🤯", "🤠", "🥳", "😎", "🤓", "🧐"],
  },
  {
    label: "Herzen",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "😻"],
  },
  {
    label: "Gesten",
    emojis: ["👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "👊", "👏", "🙌", "👐", "🤲", "🙏", "💪", "👉", "👈", "👆", "👇", "☝️", "✋"],
  },
  {
    label: "NSFW/Flirty",
    emojis: ["🍑", "🍆", "💦", "🌶️", "😈", "🥵", "🤤", "👅", "💋", "🍒", "🔥", "😏", "🙈", "😻", "🐱", "🍌", "🎀"],
  },
  {
    label: "Feiern",
    emojis: ["🎉", "🎊", "🥳", "🎁", "🏆", "⭐", "✨", "💫", "🌟", "👑", "💎", "💰", "💵", "💸"],
  },
];

const ALL_EMOJIS = Array.from(new Set(CATEGORIES.flatMap((c) => c.emojis)));
const FAVORITES_KEY = "etm_emoji_favorites";
const DEFAULT_FAVORITES = ["😊", "😂", "🔥", "❤️", "😍", "👏", "😘", "💦", "🍑", "😈"];

export default function EmojiBar({ onPick }: { onPick: (emoji: string) => void }) {
  const [favorites, setFavorites] = useState<string[]>(DEFAULT_FAVORITES);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      if (stored) setFavorites(JSON.parse(stored));
    } catch {}
  }, []);

  function saveFavorites(next: string[]) {
    setFavorites(next);
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch {}
  }

  function toggleFavorite(emoji: string) {
    saveFavorites(favorites.includes(emoji) ? favorites.filter((e) => e !== emoji) : [...favorites, emoji]);
  }

  const filtered = search.trim()
    ? ALL_EMOJIS.filter((e) => e.includes(search.trim()))
    : null;

  return (
    <div className="relative">
      {/* Always-visible favorites bar right above the input, per the
          user's explicit ask - not hidden behind a button. */}
      <div className="flex items-center gap-1 mb-2 bg-black/30 border border-[#9C7A3D]/20 rounded-lg px-2 py-1.5 overflow-x-auto">
        {favorites.map((e) => (
          <button key={e} onClick={() => onPick(e)} className="text-lg hover:scale-125 transition flex-shrink-0">
            {e}
          </button>
        ))}
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="text-xs text-slate-400 hover:text-[#E2C48A] flex-shrink-0 ml-1 px-1.5 py-0.5 rounded border border-[#9C7A3D]/30"
          title="Alle Emojis"
        >
          + Mehr
        </button>
      </div>

      {pickerOpen && (
        <div className="absolute bottom-full left-0 mb-1 w-80 max-h-80 overflow-y-auto bg-[#0A0A0A] border border-[#9C7A3D]/30 rounded-xl shadow-2xl p-3 z-20">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Emoji suchen..."
            className="w-full bg-black/40 border border-[#9C7A3D]/30 rounded px-2 py-1 text-sm text-white mb-2 outline-none focus:border-[#C9A86A]"
          />
          {filtered ? (
            <div className="grid grid-cols-8 gap-1">
              {filtered.map((e) => (
                <EmojiCell key={e} emoji={e} isFav={favorites.includes(e)} onPick={onPick} onToggleFav={toggleFavorite} />
              ))}
            </div>
          ) : (
            CATEGORIES.map((cat) => (
              <div key={cat.label} className="mb-2">
                <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">{cat.label}</div>
                <div className="grid grid-cols-8 gap-1">
                  {cat.emojis.map((e) => (
                    <EmojiCell key={cat.label + e} emoji={e} isFav={favorites.includes(e)} onPick={onPick} onToggleFav={toggleFavorite} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function EmojiCell({ emoji, isFav, onPick, onToggleFav }: { emoji: string; isFav: boolean; onPick: (e: string) => void; onToggleFav: (e: string) => void }) {
  return (
    <div className="relative group">
      <button onClick={() => onPick(emoji)} className="text-lg hover:scale-125 transition w-full py-0.5">
        {emoji}
      </button>
      <button
        onClick={(ev) => { ev.stopPropagation(); onToggleFav(emoji); }}
        className={`absolute -top-1 -right-1 text-[9px] opacity-0 group-hover:opacity-100 transition ${isFav ? "opacity-100" : ""}`}
        title={isFav ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}
      >
        {isFav ? "⭐" : "☆"}
      </button>
    </div>
  );
}
