"use client";

import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { useSearchParams } from "next/navigation";
import { FanCrmPanel } from "@/components/FanCrmPanel";
import EmojiBar from "@/components/layout/EmojiBar";
import { usePublishModelTabs } from "@/components/layout/ModelTabsContext";
import {
  HomeIcon, BellIcon, ChatIcon, FolderIcon, ImageIcon, CalendarIcon, ChartIcon, ReceiptIcon, ListIcon,
  NewBadgeIcon, PriceTagIcon, TipIcon, CartIcon, SearchIcon, StarIcon, PinIcon, CheckIcon, DoubleCheckIcon, MuteIcon,
} from "@/components/layout/GoldIcons";

type ConnectedModel = { id: string; name: string; avatar_url?: string | null };

type ChatListItem = {
  withUser: { id: number };
  unreadMessagesCount: number;
  isMutedNotifications?: boolean;
  lastReadMessageId?: number | string;
  lastMessage?: { text: string; createdAt: string; fromUser?: { id: number } };
};

type MediaItem = {
  type: string; // "photo" | "video" | "audio" | "gif" | ...
  files?: {
    full?: { url?: string };
    thumb?: { url?: string };
    preview?: { url?: string };
  };
};

type Message = {
  id: number;
  text: string;
  createdAt: string;
  fromUser?: { id: number };
  isOpened?: boolean;
  media?: MediaItem[];
};

type UserDetail = {
  name?: string;
  username?: string;
  avatar?: string | null;
  // Real OnlyFans subscription dates (from the same users/list batch call
  // already used for name/avatar) - CONFIRMED LIVE present on that
  // response, used to fill Fan-CRM's "Fan seit"/"Letztes Abo" without a
  // separate endpoint.
  subscribedByData?: { subscribeAt?: string | null; expiredAt?: string | null; regularPrice?: number | null; totalSumm?: number | null };
};

// First-pass native inbox UI reading OnlyFans directly via our own signed
// API calls (see app/of-inbox/page.tsx's comment). Fan names/avatars (via
// /of-user-details), custom CRM-only nicknames (crm_fan_nicknames, purely
// local, never touches OnlyFans), and the gold spend-ring (reusing the
// same /api/crm/fan-spend-overlay + crm_fan_metadata the VNC overlay
// script already used) are wired in. NOT yet ported: dark mode toggle,
// sent-by overlay, script-vault button, PPV purchase detector, multi-
// model tab bar, new-tab/refresh chrome - still VNC-only for now.
export default function OfInboxClient({ connectedModels, isAdmin, chatterId }: { connectedModels: ConnectedModel[]; isAdmin: boolean; chatterId: string }) {
  const searchParams = useSearchParams();
  const modelFromUrl = searchParams.get("model");
  const [modelId, setModelId] = useState(modelFromUrl || connectedModels[0]?.id || "");

  // Follows the URL like /crm-inbox's tabs do - clicking a tab in the
  // header (a real navigation, not local state) updates ?model=, which
  // this picks up. Falls back to the first connected model when there's
  // no ?model= at all (unlike /crm-inbox, this page IS the tool - no
  // separate landing state to preserve).
  useEffect(() => {
    if (modelFromUrl) setModelId(modelFromUrl);
  }, [modelFromUrl]);

  usePublishModelTabs(connectedModels, modelId, chatterId, "/of-inbox");
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [chatsError, setChatsError] = useState("");
  const [activeFanId, setActiveFanId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [userDetails, setUserDetails] = useState<Record<string, UserDetail>>({});
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [spendDisplay, setSpendDisplay] = useState<Record<string, string>>({});
  const [fanMetadata, setFanMetadata] = useState<any | null>(null);
  const [fanMetaLastEditedBy, setFanMetaLastEditedBy] = useState<string | null>(null);
  const [messageSearch, setMessageSearch] = useState<string | null>(null);
  const [nicknameModalFanId, setNicknameModalFanId] = useState<number | null>(null);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [notifError, setNotifError] = useState("");

  const loadNotifications = useCallback(async () => {
    if (!modelId) return;
    setNotifLoading(true);
    setNotifError("");
    try {
      const res = await fetch(`/api/crm/of-inbox/notifications?modelId=${encodeURIComponent(modelId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden");
      setNotifications(Array.isArray(data.data) ? data.data : []);
    } catch (e: any) {
      setNotifError(e.message || "Fehler beim Laden der Benachrichtigungen");
    } finally {
      setNotifLoading(false);
    }
  }, [modelId]);

  function toggleNotifPanel() {
    setNotifPanelOpen((v) => {
      const next = !v;
      if (next && notifications.length === 0) loadNotifications();
      return next;
    });
  }

  function notifIcon(type: string) {
    if (type === "subscribed") return <NewBadgeIcon size={16} />;
    if (type === "price_changed") return <PriceTagIcon size={16} />;
    if (type.includes("tip")) return <TipIcon size={16} />;
    if (type.includes("purchase") || type.includes("ppv")) return <CartIcon size={16} />;
    return <BellIcon size={16} />;
  }

  const [chatsHasMore, setChatsHasMore] = useState(true);
  const [chatsLoadingMore, setChatsLoadingMore] = useState(false);
  const chatOffsetRef = useRef(0);

  const loadChats = useCallback(async (opts: { more?: boolean } = {}) => {
    if (!modelId) return;
    const offset = opts.more ? chatOffsetRef.current : 0;
    if (opts.more) setChatsLoadingMore(true);
    else { setChatsLoading(true); chatOffsetRef.current = 0; setChatsHasMore(true); }
    setChatsError("");
    try {
      const res = await fetch(`/api/crm/of-inbox/chats?modelId=${encodeURIComponent(modelId)}&offset=${offset}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden");
      const list: ChatListItem[] = data.data?.list || [];
      setChatsHasMore(!!data.data?.hasMore);
      chatOffsetRef.current = typeof data.data?.nextOffset === "number" ? data.data.nextOffset : offset + list.length;
      setChats((prev) => (opts.more ? [...prev, ...list] : list));

      const fanIds = list.map((c) => String(c.withUser.id));
      if (fanIds.length > 0) {
        fetch(`/api/crm/of-inbox/user-details?modelId=${encodeURIComponent(modelId)}&ids=${fanIds.join(",")}`)
          .then((r) => r.json())
          .then((d) => {
            const raw = d.data;
            const arr: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.list) ? raw.list : Object.values(raw || {});
            const map: Record<string, UserDetail> = {};
            arr.forEach((u: any) => {
              if (u && u.id != null) map[String(u.id)] = { name: u.name || u.displayName, username: u.username, avatar: u.avatar || null, subscribedByData: u.subscribedByData || undefined };
            });
            setUserDetails((prev) => ({ ...prev, ...map }));
          })
          .catch(() => {});

        fetch("/api/crm/fan-spend-overlay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelId, fanIds, newFanIds: [] }),
        })
          .then((r) => r.json())
          .then((d) => setSpendDisplay((prev) => ({ ...prev, ...(d.display || {}) })))
          .catch(() => {});
      }

      if (!opts.more) {
        fetch(`/api/crm/of-inbox/nickname?modelId=${encodeURIComponent(modelId)}`)
          .then((r) => r.json())
          .then((d) => setNicknames(d.nicknames || {}))
          .catch(() => {});
      }
    } catch (e: any) {
      setChatsError(e.message || "Fehler beim Laden der Chats");
    } finally {
      setChatsLoading(false);
      setChatsLoadingMore(false);
    }
  }, [modelId]);

  function handleChatListScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (chatsLoadingMore || chatsLoading || !chatsHasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      loadChats({ more: true });
    }
  }

  useEffect(() => {
    setChats([]);
    setActiveFanId(null);
    setMessages([]);
    loadChats();
  }, [loadChats]);

  const [messagesHasMore, setMessagesHasMore] = useState(true);
  const [messagesLoadingMore, setMessagesLoadingMore] = useState(false);
  const messagesOffsetRef = useRef(0);
  const MESSAGES_PAGE_SIZE = 20;

  const loadMessages = useCallback(async (fanId: number, opts: { more?: boolean } = {}) => {
    if (!modelId) return;
    const offset = opts.more ? messagesOffsetRef.current : 0;
    if (opts.more) setMessagesLoadingMore(true);
    else { setMessagesLoading(true); messagesOffsetRef.current = 0; setMessagesHasMore(true); }
    try {
      const res = await fetch(`/api/crm/of-inbox/messages?modelId=${encodeURIComponent(modelId)}&fanId=${fanId}&offset=${offset}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden");
      const list = Array.isArray(data.data) ? data.data : data.data?.list || [];
      setMessagesHasMore(list.length >= MESSAGES_PAGE_SIZE);
      messagesOffsetRef.current = offset + list.length;
      // API returns newest-first; each older page still needs its own
      // internal order flipped before being stitched onto the FRONT of
      // the already-oldest-first array.
      setMessages((prev) => (opts.more ? [...list.slice().reverse(), ...prev] : list.slice().reverse()));
    } catch (e: any) {
      setSendError(e.message || "Fehler beim Laden der Nachrichten");
    } finally {
      setMessagesLoading(false);
      setMessagesLoadingMore(false);
    }
  }, [modelId]);

  function handleMessagesScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (messagesLoadingMore || messagesLoading || !messagesHasMore || !activeFanId) return;
    if (el.scrollTop <= 100) {
      const prevHeight = el.scrollHeight;
      loadMessages(activeFanId, { more: true }).then(() => {
        // Keep the viewport anchored on what was visible before prepending
        // older messages, instead of jumping to the very top each time.
        requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - prevHeight; });
      });
    }
  }

  const loadFanMetadata = useCallback(async (fanId: number) => {
    if (!modelId) return;
    try {
      const res = await fetch(`/api/crm/of-inbox/fan-metadata?modelId=${encodeURIComponent(modelId)}&fanId=${fanId}`);
      const data = await res.json();
      if (res.ok) {
        setFanMetadata(data.metadata);
        setFanMetaLastEditedBy(data.lastEditedBy || null);
      }
    } catch {}
  }, [modelId]);

  function openChat(fanId: number) {
    setActiveFanId(fanId);
    setSendError("");
    setMessageSearch(null);
    loadMessages(fanId);
    loadFanMetadata(fanId);
  }

  async function handleSend() {
    if (!draft.trim() || !activeFanId || !modelId) return;
    setSending(true);
    setSendError("");
    try {
      const res = await fetch("/api/crm/of-inbox/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, fanId: activeFanId, text: draft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Senden fehlgeschlagen");
      setDraft("");
      await loadMessages(activeFanId);
      await loadChats();
    } catch (e: any) {
      setSendError(e.message || "Senden fehlgeschlagen");
    } finally {
      setSending(false);
    }
  }

  function editNickname(fanId: number) {
    setNicknameModalFanId(fanId);
    setNicknameDraft(nicknames[String(fanId)] || "");
  }

  async function saveNickname() {
    if (nicknameModalFanId == null) return;
    const fanId = nicknameModalFanId;
    const value = nicknameDraft.trim();
    setNicknames((prev) => ({ ...prev, [String(fanId)]: value }));
    setNicknameModalFanId(null);
    try {
      await fetch("/api/crm/of-inbox/nickname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, fanId, nickname: value }),
      });
    } catch {}
  }

  // OnlyFans' own message HTML often has <br>/<p> line breaks (e.g. multi-
  // line promo spam) - CSS truncate alone can't collapse those explicit
  // breaks, which was blowing up individual chat-list rows to many lines
  // tall. Stripping tags entirely for the preview guarantees one line.
  function stripHtmlPreview(html: string): string {
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  function displayName(fanId: number): string {
    const u = userDetails[String(fanId)];
    const nick = nicknames[String(fanId)];
    // The real OnlyFans display name (e.g. "Daniel Buda") is what a fan
    // actually chose to be called - prefer it over the @username (often
    // just an auto-generated "u12345678" if they never customized it).
    const realName = u?.name || u?.username || `Fan #${fanId}`;
    return nick ? `${nick} (${realName})` : realName;
  }

  function Avatar({ fanId, size }: { fanId: number; size: number }) {
    const u = userDetails[String(fanId)];
    const spend = spendDisplay[String(fanId)];
    // Still reading from our own crm_fan_metadata cache (populated by a
    // periodic VPS sync, can lag behind reality) - a same-request live
    // OnlyFans source was attempted (subscribedByData.totalSumm) but
    // CONFIRMED LIVE 2026-07-30 that field does NOT exist on the real
    // users/list?cl[]= response at all (only view/avatar/name/username/
    // subscribedOn-ish fields) - removed rather than leave dead code
    // pretending to be live. Real fix needs a genuinely confirmed
    // per-fan spend endpoint, not yet found - see task list.
    const label = spend === "NEW" ? "NEW" : spend && spend !== "0" ? `$${spend}` : "$0";
    return (
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <div
          className="rounded-full overflow-hidden bg-black/40 flex items-center justify-center text-xs font-bold text-slate-400"
          style={{ width: size, height: size, boxShadow: "0 0 0 2px #0A0A0A, 0 0 0 4px #E5C158" }}
        >
          {u?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={u.avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            (u?.name || String(fanId)).slice(0, 1).toUpperCase()
          )}
        </div>
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-gradient-to-b from-[#E5C158] to-[#9C7A3D] text-black font-extrabold text-[9px] leading-none px-1.5 py-0.5 rounded-full whitespace-nowrap shadow">
          {label}
        </span>
      </div>
    );
  }

  // Direct CDN URLs (signed, no auth of ours needed) - real media, real
  // audio, no VNC frame relay involved, so none of the earlier VNC audio-
  // latency problems apply here at all.
  function MessageMedia({ media }: { media?: MediaItem[] }) {
    if (!media || media.length === 0) return null;
    return (
      <div className="flex flex-col gap-2 mb-2">
        {media.map((m, i) => {
          const url = m.files?.full?.url || m.files?.preview?.url;
          if (!url) return null;
          if (m.type === "photo" || m.type === "gif") {
            // eslint-disable-next-line @next/next/no-img-element
            return <img key={i} src={url} alt="" className="max-w-full rounded-lg max-h-80 object-contain" />;
          }
          if (m.type === "video") {
            return <video key={i} src={url} controls className="max-w-full rounded-lg max-h-80" />;
          }
          if (m.type === "audio") {
            return <audio key={i} src={url} controls className="max-w-full" />;
          }
          return null;
        })}
      </div>
    );
  }

  return (
    <main className="p-3 w-full h-[calc(100vh-8rem)] flex flex-col overflow-hidden bg-[#0A0A0A] text-[#E2C48A]">
      {/* Model-Auswahl läuft jetzt über die Tabs im Header (GlobalTopBar via
          usePublishModelTabs oben), genau wie bei /crm-inbox - kein
          eigenes Dropdown mehr nötig. */}
      {!modelId ? (
        <div className="text-sm text-slate-400">Kein verbundenes Model gefunden.</div>
      ) : (
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Icon-Leiste, in der Reihenfolge wie bei OnlyFans selbst - nur
              Glocke und Nachrichten sind bisher an echte Endpunkte
              angebunden, der Rest ist bewusst ausgegraut statt vorgetäuscht
              funktionsfähig zu sein. */}
          <div className="w-12 flex-shrink-0 flex flex-col items-center gap-3 pt-1">
            {/* Home zeigt nur Werbe-Feed anderer Creator - für Chatter
                komplett raus, für Admin/Content-Manager als ausgegrauter
                Platzhalter belassen. */}
            {isAdmin && (
              <button
                disabled
                title="Zeigt nur Werbe-/Entdecken-Beiträge anderer Creator - für uns nicht relevant"
                className="opacity-30 cursor-not-allowed"
              >
                <HomeIcon />
              </button>
            )}
            <div className="relative">
              <button
                onClick={toggleNotifPanel}
                className={`hover:scale-110 transition ${notifPanelOpen ? "scale-110" : ""}`}
                title="Benachrichtigungen"
              >
                <BellIcon />
              </button>
              {notifPanelOpen && (
                <div className="absolute top-full left-0 mt-2 w-96 max-h-[500px] overflow-y-auto scrollbar-hide bg-[#0A0A0A] border border-[#9C7A3D]/30 rounded-xl shadow-2xl z-30">
                  <div className="p-3 border-b border-[#9C7A3D]/20 flex items-center justify-between sticky top-0 bg-[#0A0A0A]">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#C9A86A]">Benachrichtigungen</span>
                    <button onClick={loadNotifications} className="text-xs text-slate-400 hover:text-[#E2C48A]">↻</button>
                  </div>
                  {notifLoading && <div className="p-3 text-xs text-slate-500 italic">Lade…</div>}
                  {notifError && <div className="p-3 text-xs text-red-400">{notifError}</div>}
                  {!notifLoading && notifications.length === 0 && !notifError && (
                    <div className="p-3 text-xs text-slate-500">Keine Benachrichtigungen</div>
                  )}
                  <div className="divide-y divide-[#9C7A3D]/10">
                    {notifications.map((n) => (
                      <div key={n.id} className={`p-3 flex gap-2 ${!n.isRead ? "bg-[#C9A86A]/5" : ""}`}>
                        <span className="flex-shrink-0 mt-0.5">{notifIcon(n.type)}</span>
                        <div className="min-w-0 flex-1">
                          {n.user?.name && (
                            <div className="text-xs font-bold text-[#E2C48A]">{n.user.name}</div>
                          )}
                          <div className="text-xs text-slate-300" dangerouslySetInnerHTML={{ __html: n.text }} />
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {n.createdAt ? new Date(n.createdAt).toLocaleString("de-DE") : ""}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button title="Nachrichten (aktiv)" className="text-[#C9A86A]"><ChatIcon /></button>
            {/* Task: chatter role only ever needs Messages/Bell (above) +
                Tresor/Listen - the rest (Galerie/Kalender/Statistik/
                Warteschlange) is admin/content-manager only. */}
            {(isAdmin ? [FolderIcon, ImageIcon, CalendarIcon, ChartIcon, ReceiptIcon] : [FolderIcon, ListIcon]).map((IconComp, i) => (
              <button key={i} disabled title="Noch nicht verfügbar" className="opacity-30 cursor-not-allowed">
                <IconComp />
              </button>
            ))}
          </div>

          <div className="w-[380px] flex-shrink-0 border border-[#9C7A3D]/20 rounded-xl overflow-hidden flex flex-col h-full">
            <div className="p-3 border-b border-[#9C7A3D]/20 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#C9A86A]">Chats</span>
              <button onClick={() => loadChats()} className="text-xs text-slate-400 hover:text-[#E2C48A]">↻</button>
            </div>
            {chatsLoading && <div className="p-3 text-xs text-slate-500 italic">Lade…</div>}
            {chatsError && <div className="p-3 text-xs text-red-400">{chatsError}</div>}
            <div className="divide-y divide-[#9C7A3D]/10 flex-1 min-h-0 overflow-y-auto scrollbar-hide" onScroll={handleChatListScroll}>
              {chats.map((c) => (
                <button
                  key={c.withUser.id}
                  onClick={() => openChat(c.withUser.id)}
                  className={`w-full text-left p-3.5 hover:bg-black/30 transition flex items-center gap-3 ${activeFanId === c.withUser.id ? "bg-[#C9A86A]/10" : ""}`}
                >
                  <Avatar fanId={c.withUser.id} size={52} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 justify-between">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="text-base font-bold text-white truncate">{displayName(c.withUser.id)}</span>
                        {c.isMutedNotifications && <MuteIcon size={14} />}
                      </span>
                      {c.unreadMessagesCount > 0 && (
                        <span className="text-xs bg-[#C9A86A] text-black font-bold px-2 py-0.5 rounded-full ml-1 flex-shrink-0">{c.unreadMessagesCount}</span>
                      )}
                    </div>
                    {c.lastMessage && (
                      <div className="text-sm text-slate-400 mt-0.5 truncate">
                        {stripHtmlPreview(c.lastMessage.text)}
                      </div>
                    )}
                  </div>
                </button>
              ))}
              {chatsLoadingMore && <div className="p-3 text-xs text-slate-500 italic text-center">Lade weitere…</div>}
            </div>
          </div>

          <div className="flex-1 min-w-0 border border-[#9C7A3D]/20 rounded-xl flex flex-col">
            {!activeFanId ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500">Chat auswählen</div>
            ) : (
              <>
                <div className="p-4 border-b border-[#9C7A3D]/20 flex items-center gap-3">
                  <Avatar fanId={activeFanId} size={44} />
                  <span className="text-base font-bold text-white">{displayName(activeFanId)}</span>
                  <button
                    onClick={() => editNickname(activeFanId)}
                    className="text-sm text-slate-400 hover:text-[#E2C48A] ml-1"
                    title="Eigenen Namen vergeben"
                  >
                    ✏️
                  </button>
                  <div className="flex items-center gap-3 ml-auto text-slate-400">
                    <button
                      onClick={() => setMessageSearch((v) => (v === null ? "" : null))}
                      className={messageSearch !== null ? "text-[#E2C48A]" : "hover:text-[#E2C48A]"}
                      title="In dieser Konversation suchen"
                    >
                      <SearchIcon size={18} />
                    </button>
                    {/* Noch nicht an echte OnlyFans-Endpunkte angebunden (der
                        genaue API-Aufruf dafür wurde noch nicht live
                        gefunden) - bewusst ausgegraut statt so zu tun als
                        würden sie funktionieren. */}
                    <button disabled title="Noch nicht verfügbar" className="opacity-30 cursor-not-allowed"><StarIcon size={18} /></button>
                    <button disabled title="Noch nicht verfügbar" className="opacity-30 cursor-not-allowed"><BellIcon size={18} /></button>
                    <button disabled title="Noch nicht verfügbar" className="opacity-30 cursor-not-allowed"><PinIcon size={18} /></button>
                    <button disabled title="Noch nicht verfügbar" className="opacity-30 cursor-not-allowed"><ImageIcon size={18} /></button>
                  </div>
                </div>
                {messageSearch !== null && (
                  <div className="px-3 py-2 border-b border-[#9C7A3D]/20 bg-black/20">
                    <input
                      autoFocus
                      value={messageSearch}
                      onChange={(e) => setMessageSearch(e.target.value)}
                      placeholder="Nachrichten durchsuchen…"
                      className="w-full bg-[#050505] border border-[#9C7A3D]/30 rounded px-3 py-1.5 text-sm text-white outline-none focus:border-[#C9A86A]"
                    />
                  </div>
                )}
                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-4 space-y-2" onScroll={handleMessagesScroll}>
                  {messagesLoading && <div className="text-xs text-slate-500 italic">Lade…</div>}
                  {messagesLoadingMore && <div className="text-xs text-slate-500 italic text-center">Lade ältere…</div>}
                  {(() => {
                    // isOpened is PPV-unlock status, NOT a read receipt
                    // (CONFIRMED LIVE 2026-07-30: stayed false on days-old
                    // free messages) - the real read signal is the chat
                    // list's own lastReadMessageId (highest message id the
                    // fan has actually seen).
                    const activeChat = chats.find((c) => c.withUser.id === activeFanId);
                    const lastRead = activeChat?.lastReadMessageId != null ? Number(activeChat.lastReadMessageId) : 0;
                    const filtered = messages.filter((m) => !messageSearch || m.text.toLowerCase().includes(messageSearch.toLowerCase()));
                    let lastDateKey = "";
                    const today = new Date().toDateString();
                    const yesterday = new Date(Date.now() - 86400000).toDateString();
                    return filtered.map((m) => {
                    const isOwn = String(m.fromUser?.id) !== String(activeFanId);
                    const isRead = isOwn && Number(m.id) <= lastRead;
                    const msgDate = m.createdAt ? new Date(m.createdAt) : null;
                    const dateKey = msgDate ? msgDate.toDateString() : "";
                    const showDivider = dateKey && dateKey !== lastDateKey;
                    lastDateKey = dateKey;
                    const dividerLabel = !msgDate ? "" : dateKey === today ? "Heute" : dateKey === yesterday ? "Gestern" : msgDate.toLocaleDateString("de-DE", { day: "numeric", month: "long" });
                    const time = msgDate ? msgDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "";
                    return (
                      <Fragment key={m.id}>
                        {showDivider && (
                          <div className="text-center text-[11px] text-slate-500 font-bold uppercase tracking-wider my-3">{dividerLabel}</div>
                        )}
                        <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[70%] rounded-xl px-4 py-2.5 text-base ${isOwn ? "bg-[#C9A86A]/20 text-white" : "bg-black/30 text-slate-200"}`}>
                            <MessageMedia media={m.media} />
                            {m.text && <div dangerouslySetInnerHTML={{ __html: m.text }} />}
                            {isOwn && (
                              <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-400">
                                <span>{time}</span>
                                {isRead ? <DoubleCheckIcon size={13} /> : <CheckIcon size={11} />}
                              </div>
                            )}
                            {!isOwn && time && (
                              <div className="text-[10px] text-slate-500 mt-1">{time}</div>
                            )}
                          </div>
                        </div>
                      </Fragment>
                    );
                  });
                  })()}
                </div>
                <div className="p-3 border-t border-[#9C7A3D]/20">
                  {sendError && <div className="text-xs text-red-400 mb-2">{sendError}</div>}
                  <EmojiBar onPick={(e) => setDraft((d) => d + e)} />
                  <div className="flex gap-2">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
                      placeholder="Nachricht schreiben…"
                      className="flex-1 bg-[#050505] border border-[#9C7A3D]/30 rounded px-4 py-2.5 text-base text-white outline-none focus:border-[#C9A86A]"
                    />
                    <button
                      onClick={handleSend}
                      disabled={sending || !draft.trim()}
                      className="bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] text-black font-bold px-5 py-2.5 rounded text-base disabled:opacity-50"
                    >
                      {sending ? "…" : "Senden"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {activeFanId && fanMetadata && (() => {
            // Was enriching from userDetails[...].subscribedByData.subscribeAt,
            // but CONFIRMED LIVE 2026-07-30 that field doesn't exist on the
            // real users/list response at all (see Avatar's spend label
            // comment) - reverted to the plain DB value rather than keep
            // code reading a field that's always undefined.
            return (
              <div className="w-80 flex-shrink-0 border border-[#9C7A3D]/20 rounded-xl overflow-hidden h-full">
                <FanCrmPanel
                  modelId={modelId}
                  fanId={String(activeFanId)}
                  metadata={fanMetadata}
                  lastEditedBy={fanMetaLastEditedBy}
                  onSaved={() => loadFanMetadata(activeFanId)}
                  isAdmin={isAdmin}
                />
              </div>
            );
          })()}
        </div>
      )}

      {nicknameModalFanId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setNicknameModalFanId(null)}>
          <div
            className="w-full max-w-sm bg-[#0A0A0A] border border-[#C9A86A]/30 rounded-xl shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-[#C9A86A] uppercase tracking-wider mb-3">Eigener Name für diesen Fan</h3>
            <p className="text-xs text-slate-400 mb-3">Nur im CRM sichtbar, OnlyFans bleibt unverändert.</p>
            <input
              autoFocus
              value={nicknameDraft}
              onChange={(e) => setNicknameDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveNickname(); if (e.key === "Escape") setNicknameModalFanId(null); }}
              className="w-full bg-black/60 border border-[#C9A86A]/30 rounded px-3 py-2 text-sm text-white outline-none focus:border-[#C9A86A] mb-4"
              placeholder="Name eingeben…"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setNicknameModalFanId(null)}
                className="px-3 py-1.5 rounded text-sm text-slate-400 hover:text-white transition"
              >
                Abbrechen
              </button>
              <button
                onClick={saveNickname}
                className="px-4 py-1.5 rounded text-sm font-bold bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] text-black hover:from-[#E5C158] transition"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
