"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import ModelTabsBar from "./ModelTabsBar";
import { useModelTabsDisplay } from "./ModelTabsContext";
import ShiftTimerHeader from "./ShiftTimerHeader";
import { BellIcon, LogoutIcon } from "./GoldIcons";

interface Notification {
  id: number;
  message: string;
  model_id: string | null;
  created_at: string;
  read_at: string | null;
}

/**
 * Slim top bar replacing the old full header - logo pinned top-left,
 * account actions pinned top-right. The notifications bell now shows real
 * data (see app/api/notifications) - currently only "a model finished
 * uploading a Vault batch" events; empty/invisible for non-admin users
 * since the API itself gates read access to admin/moderator roles.
 */
export default function GlobalTopBar({ userId }: { userId?: string }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const modelTabs = useModelTabsDisplay();

  const loadNotifications = async () => {
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch {
      /* silently keep whatever was there before - not critical */
    }
  };

  useEffect(() => {
    loadNotifications();
    // Polling instead of realtime - this is a low-urgency "FYI" bell, not
    // worth the extra infra for instant delivery.
    const interval = setInterval(loadNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  const markAsRead = async (id: number) => {
    setNotifications((n) => n.filter((x) => x.id !== id));
    try {
      await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    } catch {
      /* already removed optimistically - a failed mark-as-read just means it may reappear on next poll */
    }
  };

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
    <header className="fixed top-0 left-0 right-0 z-50 h-32 bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-white/5 shadow-[0_1px_20px_rgba(0,0,0,0.4)]">
      {/* Absolutely centered regardless of the logo/model-tabs/actions
          widths on either side - true center of the header, not just
          "whatever's left over" between them. Only shown while clocked in
          (see ShiftTimerHeader). On the rare page where the model-tabs bar
          is ALSO showing (clocked in AND on CRM Inbox), this can visually
          sit on top of it - accepted tradeoff, not worth extra layout
          complexity for that combination alone. */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <div className="pointer-events-auto">
          <ShiftTimerHeader userId={userId} />
        </div>
      </div>

      {/* Model-Tabs (CRM Inbox) - anchored to start exactly where the
          sidebar ends / the page content begins (md:left-56 matches
          GlobalSidebar's own w-56), not tucked in right after the logo -
          so they read as tabs FOR that content area, the same way a
          browser's own tabs sit directly above the page they control.
          Bottom-aligned to the header's own bottom edge so the active tab
          can visually merge into the content below it (see ModelTabsBar). */}
      {modelTabs && modelTabs.models.length > 0 && (
        <div className="absolute left-4 md:left-56 right-48 bottom-0 flex items-end">
          <ModelTabsBar models={modelTabs.models} activeModelId={modelTabs.activeModelId} chatterId={modelTabs.chatterId} basePath={modelTabs.basePath} />
        </div>
      )}

      {/* CONFIRMED LIVE this broke every model-tab click: this wrapper
          spans the header's full width (flex container, no max-width), so
          even though the logo sits left and the actions sit right via
          ml-auto, the EMPTY middle of this div still sat on top of (later
          in DOM than) the model-tabs div above and silently ate every
          click over that whole area. pointer-events-none here + auto on
          the actual logo/actions re-opens the tabs underneath, same
          pattern already used for the shift timer. */}
      <div className="h-full flex items-center gap-4 pl-4 pr-4 relative pointer-events-none">
        <Image
          src="/images/logo.png"
          alt="ET Management"
          width={633}
          height={611}
          priority
          className="h-28 w-auto flex-shrink-0 pointer-events-auto"
        />

        <div className="flex items-center gap-2 flex-shrink-0 ml-auto pointer-events-auto">
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen((v) => !v)}
              title="Benachrichtigungen"
              className="relative w-10 h-10 flex items-center justify-center rounded-xl text-[#C9A86A] hover:bg-white/5 hover:scale-105 transition-all duration-200 border border-transparent hover:border-[#C9A86A]/30"
            >
              <BellIcon size={19} />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold shadow-[0_0_8px_rgba(239,68,68,0.6)]">
                  {notifications.length}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-12 w-72 bg-[#0F0F12]/90 backdrop-blur-xl border border-[#C9A86A]/20 rounded-2xl shadow-2xl shadow-black/60 py-2 z-50 max-h-96 overflow-auto">
                <p className="px-4 py-2 text-xs font-bold text-[#C9A86A] uppercase tracking-widest border-b border-white/5">
                  Benachrichtigungen
                </p>
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-500 text-center">
                    Keine neuen Benachrichtigungen
                  </p>
                ) : (
                  <div className="divide-y divide-white/5">
                    {notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => markAsRead(n.id)}
                        className="w-full text-left px-4 py-3 hover:bg-[#C9A86A]/5 transition"
                      >
                        <p className="text-sm text-[#E2C48A]">{n.message}</p>
                        <p className="text-[10px] text-slate-500 mt-1">
                          {new Date(n.created_at).toLocaleString()} · zum Ausblenden klicken
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <form action="/api/logout" method="POST">
            <button
              type="submit"
              title="Abmelden"
              className="flex items-center gap-1.5 px-3 h-10 rounded-xl text-sm font-bold text-[#C9A86A] hover:bg-red-500/10 hover:text-red-400 hover:scale-105 transition-all duration-200 border border-transparent hover:border-red-500/30"
            >
              <LogoutIcon size={17} />
              <span>Logout</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
