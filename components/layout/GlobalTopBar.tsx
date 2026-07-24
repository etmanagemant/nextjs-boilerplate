"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";

/**
 * Slim top bar replacing the old full header - logo pinned top-left,
 * account actions pinned top-right. The notifications bell is a UI shell
 * for now (new subs/purchased posts/likes) - showing that data means
 * syncing those OnlyFans events into our own DB first, which doesn't exist
 * yet; wiring it up is separate follow-up work.
 */
export default function GlobalTopBar() {
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    if (notifOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [notifOpen]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-32 bg-[#0A0A0A]/95 backdrop-blur border-b border-[#9C7A3D]/20">
      <div className="h-full flex items-center justify-between pl-4 pr-4">
        <Image
          src="/images/logo.png"
          alt="ET Management"
          width={633}
          height={611}
          priority
          className="h-28 w-auto"
        />

        <div className="flex items-center gap-2">
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen((v) => !v)}
              title="Benachrichtigungen"
              className="w-10 h-10 flex items-center justify-center rounded-lg text-lg text-[#C9A86A] hover:bg-[#C9A86A]/10 transition border border-transparent hover:border-[#C9A86A]/30"
            >
              🔔
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-12 w-72 bg-[#0F0F12] border border-[#C9A86A]/30 rounded-xl shadow-2xl shadow-black/60 py-2 z-50">
                <p className="px-4 py-2 text-xs font-bold text-[#C9A86A] uppercase tracking-widest border-b border-[#9C7A3D]/20">
                  Benachrichtigungen
                </p>
                <p className="px-4 py-6 text-sm text-slate-500 text-center">
                  Keine neuen Benachrichtigungen
                </p>
              </div>
            )}
          </div>

          <form action="/api/logout" method="POST">
            <button
              type="submit"
              title="Abmelden"
              className="flex items-center gap-1.5 px-3 h-10 rounded-lg text-sm font-bold text-[#C9A86A] hover:bg-red-500/10 hover:text-red-400 transition border border-transparent hover:border-red-500/30"
            >
              <span className="text-lg">🚪</span>
              <span>Logout</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
