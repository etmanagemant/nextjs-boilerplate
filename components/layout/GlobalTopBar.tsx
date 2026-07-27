"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import ModelTabsBar from "./ModelTabsBar";
import { useModelTabsDisplay } from "./ModelTabsContext";
import ShiftTimerHeader from "./ShiftTimerHeader";

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
    <header className="fixed top-0 left-0 right-0 z-50 h-32 bg-[#0A0A0A]/95 backdrop-blur border-b border-[#9C7A3D]/20">
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

      <div className="h-full flex items-center gap-4 pl-4 pr-4 relative">
        <Image
          src="/images/logo.png"
          alt="ET Management"
          width={633}
          height={611}
          priority
          className="h-28 w-auto flex-shrink-0"
        />

        {/* Model-Tabs (CRM Inbox) - published via ModelTabsContext from
            CRMInboxClient, so the header can show them without knowing
            anything about the CRM Inbox page itself. Empty/absent on every
            other page. */}
        {modelTabs && modelTabs.models.length > 0 && (
          <div className="flex-1 min-w-0">
            <ModelTabsBar models={modelTabs.models} activeModelId={modelTabs.activeModelId} chatterId={modelTabs.chatterId} />
          </div>
        )}

        <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen((v) => !v)}
              title="Benachrichtigungen"
              className="relative w-10 h-10 flex items-center justify-center rounded-lg text-lg text-[#C9A86A] hover:bg-[#C9A86A]/10 transition border border-transparent hover:border-[#C9A86A]/30"
            >
              🔔
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {notifications.length}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-12 w-72 bg-[#0F0F12] border border-[#C9A86A]/30 rounded-xl shadow-2xl shadow-black/60 py-2 z-50 max-h-96 overflow-auto">
                <p className="px-4 py-2 text-xs font-bold text-[#C9A86A] uppercase tracking-widest border-b border-[#9C7A3D]/20">
                  Benachrichtigungen
                </p>
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-500 text-center">
                    Keine neuen Benachrichtigungen
                  </p>
                ) : (
                  <div className="divide-y divide-[#9C7A3D]/10">
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
