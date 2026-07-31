"use client";

import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { useSearchParams } from "next/navigation";
import { FanCrmPanel } from "@/components/FanCrmPanel";
import EmojiBar from "@/components/layout/EmojiBar";
import NextShiftsWidget from "@/components/layout/NextShiftsWidget";
import { usePublishModelTabs } from "@/components/layout/ModelTabsContext";
import {
  HomeIcon, BellIcon, ChatIcon, ImageIcon, CalendarIcon, ChartIcon, ReceiptIcon,
  NewBadgeIcon, PriceTagIcon, TipIcon, CartIcon, SearchIcon, StarIcon, PinIcon, CheckIcon, DoubleCheckIcon, MuteIcon, CloseIcon, HeartIcon, BookmarkIcon, ArrowLeftIcon,
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
  // CONFIRMED LIVE 2026-07-31 (echte Felder aus /of-messages): price=0 bei
  // Gratis-Nachrichten, canPurchase=true wenn eine PPV noch nicht
  // freigeschaltet ist. isLiked/isPinned kommen direkt von OnlyFans mit,
  // kein eigener Zustand mehr nötig für den Erstladung-Status.
  price?: number;
  isFree?: boolean;
  canPurchase?: boolean;
  isLiked?: boolean;
  isPinned?: boolean;
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
// /of-user-details), fan renaming (writes OnlyFans' own real "Benutzer
// umbenennen" field, Task #43 - no separate CRM-only table anymore), and
// the gold spend-ring (reusing the same /api/crm/fan-spend-overlay +
// crm_fan_metadata the VNC overlay script already used) are wired in.
// NOT yet ported: dark mode toggle,
// sent-by overlay, script-vault button, PPV purchase detector, multi-
// model tab bar, new-tab/refresh chrome - still VNC-only for now.
type Shift = { id: number; shift_date: string; notes: string };

export default function OfInboxClient({ connectedModels, isAdmin, chatterId, userEmail = "", allShifts = [] }: { connectedModels: ConnectedModel[]; isAdmin: boolean; chatterId: string; userEmail?: string; allShifts?: Shift[] }) {
  const searchParams = useSearchParams();
  const modelFromUrl = searchParams.get("model");
  const [modelId, setModelId] = useState(modelFromUrl || "");

  // Follows the URL like /crm-inbox's tabs do - clicking a tab in the
  // header (a real navigation, not local state) updates ?model=, which
  // this picks up. CONFIRMED intentional (2026-07-31, reversing an
  // earlier choice): does NOT fall back to the first connected model
  // without an explicit ?model= - landing on OF Inbox (Beta) directly
  // should show the Stechuhr/Schichten start screen first (matches
  // /crm-inbox), so a chatter only ever waits on a model's data loading
  // right after they themselves clicked that model's tab, not silently
  // in the background right after opening the page.
  useEffect(() => {
    if (modelFromUrl) setModelId(modelFromUrl);
  }, [modelFromUrl]);

  usePublishModelTabs(connectedModels, modelId, chatterId, "/of-inbox");

  // Tresor/Listen/Statistik/Kalender/Auszahlungen (Tasks #47-#50) - alle
  // read-only, ein Fetch pro Panel-Öffnung, kein eigener Pagination-Aufwand
  // in dieser ersten Fassung. Response-Shapes CONFIRMED LIVE gegen das
  // Testmodel (2026-07-31), nicht geraten:
  // vault-lists: data.list[]; vault-media: data.list[]; lists: data ist
  // direkt das Array (kein data.list!); stats: data.overview.massMessages
  // + data.top.purchases; schedules: data.list[]; earnings: data ist ein
  // flaches Objekt.
  const [activePanel, setActivePanel] = useState<null | "vault" | "lists" | "stats" | "schedules" | "earnings">(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState("");
  const [vaultLists, setVaultLists] = useState<any[]>([]);
  const [vaultMedia, setVaultMedia] = useState<any[]>([]);
  const [vaultActiveListId, setVaultActiveListId] = useState<string | null>(null);
  const [vaultTypeFilter, setVaultTypeFilter] = useState<string | null>(null);
  const [vaultMediaHasMore, setVaultMediaHasMore] = useState(true);
  const [vaultMediaLoadingMore, setVaultMediaLoadingMore] = useState(false);
  const vaultMediaOffsetRef = useRef(0);
  const [lightboxMedia, setLightboxMedia] = useState<any | null>(null);
  const [pinnedPanelOpen, setPinnedPanelOpen] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const [pinnedLoading, setPinnedLoading] = useState(false);
  const [fanLists, setFanLists] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [earnings, setEarnings] = useState<any>(null);

  const VAULT_PAGE_SIZE = 40;

  async function loadVaultMedia(listId: string | null, opts: { more?: boolean } = {}) {
    if (!modelId) return;
    const offset = opts.more ? vaultMediaOffsetRef.current : 0;
    const res = await fetch(`/api/crm/of-inbox/vault-media?modelId=${encodeURIComponent(modelId)}&offset=${offset}${listId ? `&listId=${encodeURIComponent(listId)}` : ""}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Fehler beim Laden");
    const list = data.data?.list || [];
    setVaultMediaHasMore(list.length >= VAULT_PAGE_SIZE);
    vaultMediaOffsetRef.current = offset + list.length;
    setVaultMedia((prev) => (opts.more ? [...prev, ...list] : list));
  }

  function handleVaultMediaScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (vaultMediaLoadingMore || panelLoading || !vaultMediaHasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      setVaultMediaLoadingMore(true);
      loadVaultMedia(vaultActiveListId, { more: true }).finally(() => setVaultMediaLoadingMore(false));
    }
  }

  async function openPanel(panel: NonNullable<typeof activePanel>) {
    if (activePanel === panel) { setActivePanel(null); return; }
    setActivePanel(panel);
    if (!modelId) return;
    setPanelLoading(true);
    setPanelError("");
    try {
      if (panel === "vault") {
        setVaultActiveListId(null);
        setVaultTypeFilter(null);
        vaultMediaOffsetRef.current = 0;
        setVaultMediaHasMore(true);
        // Task #58: die zwei Requests liefen vorher nacheinander, jetzt
        // parallel - spürbar schnelleres erstes Laden.
        const [listsRes] = await Promise.all([
          fetch(`/api/crm/of-inbox/vault-lists?modelId=${encodeURIComponent(modelId)}`).then((r) => r.json()),
          loadVaultMedia(null),
        ]);
        if (listsRes.error) throw new Error(listsRes.error);
        setVaultLists(listsRes.data?.list || []);
      } else if (panel === "lists") {
        const res = await fetch(`/api/crm/of-inbox/lists?modelId=${encodeURIComponent(modelId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Fehler beim Laden");
        setFanLists(Array.isArray(data.data) ? data.data : []);
      } else if (panel === "stats") {
        const res = await fetch(`/api/crm/of-inbox/stats?modelId=${encodeURIComponent(modelId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Fehler beim Laden");
        setStats(data.data || null);
      } else if (panel === "schedules") {
        const res = await fetch(`/api/crm/of-inbox/schedules?modelId=${encodeURIComponent(modelId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Fehler beim Laden");
        setSchedules(data.data?.list || []);
      } else if (panel === "earnings") {
        const res = await fetch(`/api/crm/of-inbox/earnings?modelId=${encodeURIComponent(modelId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Fehler beim Laden");
        setEarnings(data.data || null);
      }
    } catch (e: any) {
      setPanelError(e.message || "Fehler beim Laden");
    } finally {
      setPanelLoading(false);
    }
  }

  async function selectVaultList(listId: string | null) {
    setVaultActiveListId(listId);
    vaultMediaOffsetRef.current = 0;
    setVaultMediaHasMore(true);
    setPanelLoading(true);
    setPanelError("");
    try {
      await loadVaultMedia(listId);
    } catch (e: any) {
      setPanelError(e.message || "Fehler beim Laden");
    } finally {
      setPanelLoading(false);
    }
  }

  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [chatsError, setChatsError] = useState("");
  const [activeFanId, setActiveFanId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  // Task #33/#37: same crm_onlyfans_sent_log VNC's overlay reads from -
  // /api/crm/of-inbox/send now writes an entry there itself (it already
  // knows the sender), this just reads it back for display.
  const [sentLog, setSentLog] = useState<{ chatter_name: string; message_text: string | null; media_key: string | null }[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [userDetails, setUserDetails] = useState<Record<string, UserDetail>>({});
  const [spendDisplay, setSpendDisplay] = useState<Record<string, string>>({});
  const [fanMetadata, setFanMetadata] = useState<any | null>(null);
  const [fanMetaLastEditedBy, setFanMetaLastEditedBy] = useState<string | null>(null);
  const [messageSearch, setMessageSearch] = useState<string | null>(null);
  const [chatSearchResults, setChatSearchResults] = useState<Message[] | null>(null);
  const [listsPanelOpen, setListsPanelOpen] = useState(false);
  const [availableLists, setAvailableLists] = useState<{ id: string; type: string; name: string }[]>([]);
  const [addedToList, setAddedToList] = useState<Set<string>>(new Set());
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryMedia, setGalleryMedia] = useState<any[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [nicknameModalFanId, setNicknameModalFanId] = useState<number | null>(null);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [notifError, setNotifError] = useState("");
  const [notifHasMore, setNotifHasMore] = useState(true);
  const [notifLoadingMore, setNotifLoadingMore] = useState(false);
  const notifOffsetRef = useRef(0);
  const NOTIF_PAGE_SIZE = 20;

  const loadNotifications = useCallback(async (opts: { more?: boolean } = {}) => {
    if (!modelId) return;
    const offset = opts.more ? notifOffsetRef.current : 0;
    if (opts.more) setNotifLoadingMore(true);
    else { setNotifLoading(true); notifOffsetRef.current = 0; setNotifHasMore(true); }
    setNotifError("");
    try {
      const res = await fetch(`/api/crm/of-inbox/notifications?modelId=${encodeURIComponent(modelId)}&offset=${offset}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden");
      const list = Array.isArray(data.data) ? data.data : [];
      setNotifHasMore(list.length >= NOTIF_PAGE_SIZE);
      notifOffsetRef.current = offset + list.length;
      setNotifications((prev) => (opts.more ? [...prev, ...list] : list));
    } catch (e: any) {
      setNotifError(e.message || "Fehler beim Laden der Benachrichtigungen");
    } finally {
      setNotifLoading(false);
      setNotifLoadingMore(false);
    }
  }, [modelId]);

  function handleNotifScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (notifLoadingMore || notifLoading || !notifHasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) loadNotifications({ more: true });
  }

  // Groups notification types the same way OnlyFans' own notification
  // tabs do, instead of one flat list - matches the categories the user
  // asked for (Abos, Bezahlung, Likes).
  function notifCategory(type: string): string {
    if (type === "subscribed" || type === "price_changed") return "Abos";
    if (type.includes("tip") || type.includes("purchase") || type.includes("ppv")) return "Bezahlung";
    if (type.includes("like")) return "Likes";
    return "Sonstiges";
  }
  const NOTIF_CATEGORY_ORDER = ["Abos", "Bezahlung", "Likes", "Sonstiges"];

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
    else {
      setMessagesLoading(true); messagesOffsetRef.current = 0; setMessagesHasMore(true);
      fetch(`/api/crm/log-sent-message?modelId=${encodeURIComponent(modelId)}&fanId=${fanId}`)
        .then((r) => r.json())
        .then((d) => setSentLog(d.entries || []))
        .catch(() => setSentLog([]));
    }
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
    setListsPanelOpen(false);
    setAddedToList(new Set());
    setPinnedPanelOpen(false);
    setPinnedMessages([]);
    setGalleryOpen(false);
    setGalleryMedia([]);
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
    setNicknameDraft(userDetails[String(fanId)]?.name || "");
  }

  // Task #43: writes OnlyFans' own real "Benutzer umbenennen" field
  // (CONFIRMED LIVE 2026-07-31: PUT /subscriptions/{fanId} {displayName}),
  // replacing the old CRM-only crm_fan_nicknames table - this is the SAME
  // name OnlyFans itself shows everywhere, not a separate local label.
  async function saveNickname() {
    if (nicknameModalFanId == null || !modelId) return;
    const fanId = nicknameModalFanId;
    const value = nicknameDraft.trim();
    setUserDetails((prev) => ({ ...prev, [String(fanId)]: { ...prev[String(fanId)], name: value } }));
    setNicknameModalFanId(null);
    try {
      await fetch("/api/crm/of-inbox/fan-rename", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, fanId, displayName: value }),
      });
    } catch {}
  }

  // OnlyFans' own message HTML often has <br>/<p> line breaks (e.g. multi-
  // line promo spam) - CSS truncate alone can't collapse those explicit
  // breaks, which was blowing up individual chat-list rows to many lines
  // tall. Stripping tags entirely for the preview guarantees one line.
  // Task #55: CONFIRMED LIVE 2026-07-31 - pin is POST, unpin is DELETE,
  // same URL. isPinned comes back on the message itself (real field,
  // CONFIRMED LIVE) - updated directly on the message instead of separate
  // local state, so it survives reloads correctly.
  async function togglePin(messageId: number, currentlyPinned: boolean) {
    if (!modelId || !activeFanId) return;
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, isPinned: !currentlyPinned } : m)));
    try {
      await fetch("/api/crm/of-inbox/message-pin", {
        method: currentlyPinned ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, fanId: activeFanId, messageId }),
      });
    } catch {}
  }

  // Task #56: CONFIRMED LIVE 2026-07-31 - OnlyFans' own 24h "Senden
  // rückgängig machen". OnlyFans enforces the 24h window server-side, the
  // UI here just hides the button past that point too.
  async function deleteOwnMessage(messageId: number) {
    if (!modelId || !activeFanId) return;
    if (!window.confirm("Diese gesendete Nachricht wirklich löschen?")) return;
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    try {
      await fetch("/api/crm/of-inbox/message", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, fanId: activeFanId, messageId }),
      });
    } catch {}
  }

  // Task #52: real "FINDEN"-Tab search within one chat, debounced.
  useEffect(() => {
    if (messageSearch === null || messageSearch.trim() === "" || !modelId || !activeFanId) {
      setChatSearchResults(null);
      return;
    }
    const handle = setTimeout(() => {
      fetch(`/api/crm/of-inbox/chat-search?modelId=${encodeURIComponent(modelId)}&fanId=${activeFanId}&query=${encodeURIComponent(messageSearch)}`)
        .then((r) => r.json())
        .then((d) => {
          const list = Array.isArray(d.data) ? d.data : d.data?.list || [];
          setChatSearchResults(list);
        })
        .catch(() => setChatSearchResults([]));
    }, 350);
    return () => clearTimeout(handle);
  }, [messageSearch, modelId, activeFanId]);

  // Task #54: CONFIRMED LIVE 2026-07-31 - only exists on FAN-sent
  // messages, not the model's own (no "Gefällt mir" on own bubbles).
  // isLiked is a real field on the message (CONFIRMED LIVE).
  async function toggleLike(messageId: number, currentlyLiked: boolean) {
    if (!modelId || !activeFanId) return;
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, isLiked: !currentlyLiked } : m)));
    try {
      await fetch("/api/crm/of-inbox/message-like", {
        method: currentlyLiked ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, fanId: activeFanId, messageId }),
      });
    } catch {}
  }

  // Task: "Stummschalten" ist keine eigene Funktion, sondern nur
  // Mitgliedschaft in der eingebauten Liste "muted" (CONFIRMED LIVE
  // 2026-07-31) - isMutedNotifications kommt schon aus der Chat-Liste
  // (Task #24), hier nur der Schreibvorgang dazu.
  async function toggleMute() {
    if (!modelId || !activeFanId) return;
    const chat = chats.find((c) => c.withUser.id === activeFanId);
    const currentlyMuted = !!chat?.isMutedNotifications;
    setChats((prev) => prev.map((c) => (c.withUser.id === activeFanId ? { ...c, isMutedNotifications: !currentlyMuted } : c)));
    try {
      await fetch("/api/crm/of-inbox/list-membership", {
        method: currentlyMuted ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, fanId: activeFanId, listId: "muted" }),
      });
    } catch {}
  }

  // Task: der Stern-Button ("Zu Favoriten und anderen Listen hinzufügen")
  // - CONFIRMED LIVE 2026-07-31: POST/DELETE /lists/{listId}/users/{fanId}
  // zum Ändern, GET /lists?related_user={fanId} zum Anzeigen (genau das
  // ruft OnlyFans' eigener Dialog auf, siehe Screenshot vom User mit
  // Häkchen pro Liste). Welches Feld genau "ist Mitglied" markiert, ist
  // NICHT live bestätigt (Testmodel-Session ist beim Testen ausgeloggt) -
  // hier über die schon bekannte users[]-Vorschau angenähert, sollte
  // nochmal live geprüft werden sobald das Testmodel wieder eingeloggt ist.
  async function openListsPanel() {
    if (listsPanelOpen) { setListsPanelOpen(false); return; }
    setListsPanelOpen(true);
    if (!modelId || !activeFanId) return;
    try {
      const res = await fetch(`/api/crm/of-inbox/lists?modelId=${encodeURIComponent(modelId)}&relatedUserId=${activeFanId}`);
      const data = await res.json();
      const list = Array.isArray(data.data) ? data.data : [];
      const relevant = list.filter((l: any) => l.type === "custom" || l.id === "friends");
      setAvailableLists(relevant);
      setAddedToList(new Set(relevant.filter((l: any) => l.users?.some((u: any) => String(u.id) === String(activeFanId))).map((l: any) => l.id)));
    } catch {
      setAvailableLists([]);
    }
  }

  async function addFanToList(listId: string) {
    if (!modelId || !activeFanId) return;
    const currentlyIn = addedToList.has(listId);
    setAddedToList((prev) => {
      const next = new Set(prev);
      if (currentlyIn) next.delete(listId); else next.add(listId);
      return next;
    });
    try {
      await fetch("/api/crm/of-inbox/list-membership", {
        method: currentlyIn ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, fanId: activeFanId, listId }),
      });
    } catch {}
  }

  // Task: der Pin-Button im Chat-Header ist nur eine Ansicht aller
  // angehefteten Nachrichten dieses Chats (CONFIRMED LIVE 2026-07-31:
  // gleicher /messages-Endpunkt, nur mit &filter=pinned) - kein Toggle.
  async function togglePinnedPanel() {
    if (pinnedPanelOpen) { setPinnedPanelOpen(false); return; }
    setPinnedPanelOpen(true);
    if (!modelId || !activeFanId) return;
    setPinnedLoading(true);
    try {
      const res = await fetch(`/api/crm/of-inbox/messages?modelId=${encodeURIComponent(modelId)}&fanId=${activeFanId}&pinned=1`);
      const data = await res.json();
      const list = Array.isArray(data.data) ? data.data : data.data?.list || [];
      setPinnedMessages(list);
    } catch {
      setPinnedMessages([]);
    } finally {
      setPinnedLoading(false);
    }
  }

  // Task #57: CONFIRMED LIVE 2026-07-31 - the real Galerie button in a
  // chat's header (all media ever sent in this specific chat).
  async function toggleGallery() {
    if (galleryOpen) { setGalleryOpen(false); return; }
    setGalleryOpen(true);
    if (!modelId || !activeFanId) return;
    setGalleryLoading(true);
    try {
      const res = await fetch(`/api/crm/of-inbox/chat-gallery?modelId=${encodeURIComponent(modelId)}&fanId=${activeFanId}`);
      const data = await res.json();
      const list = Array.isArray(data.data) ? data.data : data.data?.list || [];
      setGalleryMedia(list);
    } catch {
      setGalleryMedia([]);
    } finally {
      setGalleryLoading(false);
    }
  }

  function stripHtmlPreview(html: string): string {
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  function displayName(fanId: number): string {
    const u = userDetails[String(fanId)];
    // u.name IS the real OnlyFans display/custom name (editable via the
    // rename modal, Task #43 - PUT /subscriptions/{fanId}) - prefer it over
    // the @username (often just an auto-generated "u12345678").
    return u?.name || u?.username || `Fan #${fanId}`;
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

  // Task #44: OnlyFans' signed CDN urls are IP-locked to the VPS that
  // requested them, not the CRM user's browser - a raw <img src> 403'd
  // (most visibly for video, since a blocked byte-range request leaves
  // just the player chrome with no content). Routed through our own
  // media-proxy, which re-fetches from the VPS's IP and streams it.
  function MessageMedia({ media }: { media?: MediaItem[] }) {
    if (!media || media.length === 0) return null;
    return (
      <div className="flex flex-col gap-2 mb-2">
        {media.map((m, i) => {
          const url = m.files?.full?.url || m.files?.preview?.url;
          if (!url) return null;
          const proxied = `/api/crm/of-inbox/media-proxy?url=${encodeURIComponent(url)}`;
          if (m.type === "photo" || m.type === "gif") {
            // eslint-disable-next-line @next/next/no-img-element
            return <img key={i} src={proxied} alt="" className="max-w-full rounded-lg max-h-80 object-contain" />;
          }
          if (m.type === "video") {
            return <video key={i} src={proxied} controls className="max-w-full rounded-lg max-h-80" />;
          }
          if (m.type === "audio") {
            return <audio key={i} src={proxied} controls className="max-w-full" />;
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
        <div className="w-full flex flex-col items-center justify-center overflow-y-auto scrollbar-hide py-8">
          <NextShiftsWidget
            allShifts={allShifts}
            userEmail={userEmail}
            userId={chatterId}
            userFullName={undefined}
            isAdmin={isAdmin}
          />
        </div>
      ) : (
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Icon-Leiste, in der Reihenfolge wie bei OnlyFans selbst - nur
              Glocke und Nachrichten sind bisher an echte Endpunkte
              angebunden, der Rest ist bewusst ausgegraut statt vorgetäuscht
              funktionsfähig zu sein. */}
          <div className="w-16 flex-shrink-0 flex flex-col items-center gap-5 pt-2">
            {/* Task #53: Icons waren mit dem geteilten 22px-Default winzig
                gegen das echte OnlyFans (Vergleichsscreenshot) - hier
                explizit größer statt den globalen Default in GoldIcons.tsx
                zu ändern, da BellIcon/etc. an anderer Stelle (Notification-
                Liste) bewusst klein bleiben sollen. */}
            {/* Home zeigt nur Werbe-Feed anderer Creator - für Chatter
                komplett raus, für Admin/Content-Manager als ausgegrauter
                Platzhalter belassen. */}
            {isAdmin && (
              <button
                disabled
                title="Zeigt nur Werbe-/Entdecken-Beiträge anderer Creator - für uns nicht relevant"
                className="opacity-30 cursor-not-allowed"
              >
                <HomeIcon size={30} />
              </button>
            )}
            <div className="relative">
              <button
                onClick={toggleNotifPanel}
                className={`hover:scale-110 transition ${notifPanelOpen ? "scale-110" : ""}`}
                title="Benachrichtigungen"
              >
                <BellIcon size={30} />
              </button>
              {notifPanelOpen && (
                <div className="absolute top-full left-0 mt-2 w-96 max-h-[500px] overflow-y-auto scrollbar-hide bg-[#0A0A0A] border border-[#9C7A3D]/30 rounded-xl shadow-2xl z-30" onScroll={handleNotifScroll}>
                  <div className="p-3 border-b border-[#9C7A3D]/20 flex items-center justify-between sticky top-0 bg-[#0A0A0A]">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#C9A86A]">Benachrichtigungen</span>
                    <button onClick={() => loadNotifications()} className="text-xs text-slate-400 hover:text-[#E2C48A]">↻</button>
                  </div>
                  {notifLoading && <div className="p-3 text-xs text-slate-500 italic">Lade…</div>}
                  {notifError && <div className="p-3 text-xs text-red-400">{notifError}</div>}
                  {!notifLoading && notifications.length === 0 && !notifError && (
                    <div className="p-3 text-xs text-slate-500">Keine Benachrichtigungen</div>
                  )}
                  {NOTIF_CATEGORY_ORDER.map((cat) => {
                    const group = notifications.filter((n) => notifCategory(n.type) === cat);
                    if (group.length === 0) return null;
                    return (
                      <div key={cat}>
                        <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#9C7A3D] bg-[#C9A86A]/5 sticky top-8">
                          {cat}
                        </div>
                        <div className="divide-y divide-[#9C7A3D]/10">
                          {group.map((n) => (
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
                    );
                  })}
                  {notifLoadingMore && <div className="p-3 text-xs text-slate-500 italic text-center">Lade weitere…</div>}
                </div>
              )}
            </div>
            <button title="Nachrichten (aktiv)" className="text-[#C9A86A]"><ChatIcon size={30} /></button>
            {/* Task: chatter role only ever needs Messages/Bell (above) +
                Tresor/Listen - Kalender/Statistik/Auszahlungen bleiben
                admin/content-manager only. Die Galerie gibt's pro Chat im
                Header (Task #57, echter Endpunkt) - kein eigenes Icon hier
                mehr nötig/sinnvoll, OnlyFans hat auch keins in der
                Leiste. */}
            {(isAdmin
              ? [
                  { Icon: BookmarkIcon, key: "lists" as const, label: "Listen" },
                  { Icon: ImageIcon, key: "vault" as const, label: "Tresor" },
                  { Icon: CalendarIcon, key: "schedules" as const, label: "Kalender" },
                  { Icon: ChartIcon, key: "stats" as const, label: "Statistik" },
                  { Icon: ReceiptIcon, key: "earnings" as const, label: "Auszahlungen" },
                ]
              : [
                  { Icon: BookmarkIcon, key: "lists" as const, label: "Listen" },
                  { Icon: ImageIcon, key: "vault" as const, label: "Tresor" },
                ]
            ).map(({ Icon, key, label }) => (
                <div className="relative" key={key}>
                  <button
                    onClick={() => openPanel(key)}
                    title={label}
                    className={`hover:scale-110 transition ${activePanel === key ? "scale-110 text-[#C9A86A]" : ""}`}
                  >
                    <Icon size={30} />
                  </button>
                  {activePanel === key && (
                    <div
                      onScroll={key === "vault" ? handleVaultMediaScroll : undefined}
                      className={`absolute top-full left-0 mt-2 overflow-y-auto scrollbar-hide bg-[#0A0A0A] border border-[#9C7A3D]/30 rounded-xl shadow-2xl z-30 ${key === "vault" ? "w-[560px] max-h-[640px]" : "w-96 max-h-[500px]"}`}
                    >
                      <div className="p-3 border-b border-[#9C7A3D]/20 sticky top-0 bg-[#0A0A0A]">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#C9A86A]">{label}</span>
                      </div>
                      {panelLoading && <div className="p-3 text-xs text-slate-500 italic">Lade…</div>}
                      {panelError && <div className="p-3 text-xs text-red-400">{panelError}</div>}

                      {key === "vault" && !panelLoading && (
                        <>
                          <div className="flex gap-1.5 flex-wrap p-2 border-b border-[#9C7A3D]/10">
                            <button
                              onClick={() => selectVaultList(null)}
                              className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase ${!vaultActiveListId ? "bg-[#C9A86A] text-black" : "bg-[#C9A86A]/10 text-[#E2C48A]"}`}
                            >
                              Alle
                            </button>
                            {vaultLists.map((l) => (
                              <button
                                key={l.id}
                                onClick={() => selectVaultList(String(l.id))}
                                className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase truncate max-w-[120px] ${vaultActiveListId === String(l.id) ? "bg-[#C9A86A] text-black" : "bg-[#C9A86A]/10 text-[#E2C48A]"}`}
                              >
                                {l.name} ({(l.videosCount || 0) + (l.photosCount || 0) + (l.gifsCount || 0) + (l.audiosCount || 0)})
                              </button>
                            ))}
                          </div>
                          {/* Task #58: Typ-Filter - rein client-seitig über die schon
                              geladenen Medien, kein zusätzlicher Request nötig. */}
                          <div className="flex gap-1.5 p-2 border-b border-[#9C7A3D]/10">
                            {[
                              { id: null, label: "Alle" },
                              { id: "photo", label: "Fotos" },
                              { id: "video", label: "Videos" },
                              { id: "audio", label: "Audio" },
                              { id: "gif", label: "GIFs" },
                            ].map((f) => (
                              <button
                                key={f.label}
                                onClick={() => setVaultTypeFilter(f.id)}
                                className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase ${vaultTypeFilter === f.id ? "bg-[#C9A86A] text-black" : "bg-black/30 text-slate-400 hover:text-[#E2C48A]"}`}
                              >
                                {f.label}
                              </button>
                            ))}
                          </div>
                          <div className="grid grid-cols-4 gap-1.5 p-2">
                            {vaultMedia.filter((m) => !vaultTypeFilter || m.type === vaultTypeFilter).map((m) => {
                              // Task #58: Audios haben kein Bild-Thumbnail wie
                              // Fotos/Videos - eigene Kachel statt eines
                              // leeren/kaputten <img>. Klick öffnet jetzt bei
                              // jedem Typ eine große Vorschau.
                              if (m.type === "audio") {
                                return (
                                  <button
                                    key={m.id}
                                    onClick={() => setLightboxMedia(m)}
                                    className="w-full aspect-square rounded bg-[#C9A86A]/10 border border-[#9C7A3D]/20 flex flex-col items-center justify-center gap-1 hover:bg-[#C9A86A]/20"
                                  >
                                    <TipIcon size={22} />
                                    <span className="text-[9px] text-slate-400 uppercase">Audio</span>
                                  </button>
                                );
                              }
                              const url = m.files?.thumb?.url || m.files?.preview?.url || m.files?.full?.url;
                              if (!url) return null;
                              return (
                                <button key={m.id} onClick={() => setLightboxMedia(m)} className="relative">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={`/api/crm/of-inbox/media-proxy?url=${encodeURIComponent(url)}`} className="w-full aspect-square object-cover rounded" alt="" />
                                  {m.type === "video" && (
                                    <span className="absolute bottom-1 right-1 text-[8px] font-bold bg-black/70 text-white px-1 rounded">▶</span>
                                  )}
                                </button>
                              );
                            })}
                            {vaultMedia.length === 0 && <div className="col-span-4 p-3 text-xs text-slate-500 text-center">Keine Medien in diesem Ordner</div>}
                          </div>
                          {vaultMediaLoadingMore && <div className="p-2 text-xs text-slate-500 italic text-center">Lade weitere…</div>}
                        </>
                      )}

                      {key === "lists" && !panelLoading && (
                        <div className="divide-y divide-[#9C7A3D]/10">
                          {fanLists.map((l) => (
                            <div key={l.id} className="p-3 flex items-center justify-between">
                              <span className="text-sm font-bold text-white">{l.name}</span>
                              <span className="text-xs text-[#C9A86A] font-bold">{l.usersCount ?? l.users?.length ?? 0}</span>
                            </div>
                          ))}
                          {fanLists.length === 0 && <div className="p-3 text-xs text-slate-500">Keine Listen</div>}
                        </div>
                      )}

                      {key === "stats" && !panelLoading && stats?.overview?.massMessages && (
                        <>
                          <div className="p-3 grid grid-cols-2 gap-3">
                            <div>
                              <div className="text-[10px] text-slate-500 uppercase">Massnachrichten (30 Tage)</div>
                              <div className="text-lg font-black text-[#C9A86A]">{stats.overview.massMessages.count?.total ?? 0}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-500 uppercase">Views</div>
                              <div className="text-lg font-black text-[#C9A86A]">{stats.overview.massMessages.views?.total ?? 0}</div>
                            </div>
                            <div className="col-span-2">
                              <div className="text-[10px] text-slate-500 uppercase">Einnahmen</div>
                              <div className="text-lg font-black text-[#C9A86A]">${stats.overview.massMessages.earnings?.total ?? 0}</div>
                            </div>
                          </div>
                          {Array.isArray(stats.top?.purchases) && stats.top.purchases.length > 0 && (
                            <div className="p-3 border-t border-[#9C7A3D]/10">
                              <div className="text-[10px] text-slate-500 uppercase mb-2">Top-Nachrichten</div>
                              {stats.top.purchases.slice(0, 5).map((p: any, i: number) => (
                                <div key={i} className="text-xs text-slate-300 mb-1 truncate">{stripHtmlPreview(p.text || "")}</div>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {key === "schedules" && !panelLoading && (
                        <div className="divide-y divide-[#9C7A3D]/10">
                          {schedules.map((s: any, i: number) => (
                            <div key={s.id ?? i} className="p-3 text-xs text-slate-300">
                              {stripHtmlPreview(s.post?.text || s.text || "") || s.type || "Geplanter Beitrag"}
                            </div>
                          ))}
                          {schedules.length === 0 && <div className="p-3 text-xs text-slate-500">Heute nichts geplant</div>}
                        </div>
                      )}

                      {key === "earnings" && !panelLoading && earnings && (
                        <div className="p-3 grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-[10px] text-slate-500 uppercase">Verfügbar</div>
                            <div className="text-lg font-black text-[#C9A86A]">{earnings.payoutAvailable} {earnings.currency}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500 uppercase">Ausstehend</div>
                            <div className="text-lg font-black text-[#C9A86A]">{earnings.payoutPending} {earnings.currency}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
                  <button onClick={() => setActiveFanId(null)} title="Zurück zur Chat-Liste" className="text-slate-400 hover:text-[#E2C48A] mr-1">
                    <ArrowLeftIcon size={20} />
                  </button>
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
                    <div className="relative">
                      <button
                        onClick={openListsPanel}
                        className={listsPanelOpen ? "text-[#C9A86A]" : "hover:text-[#E2C48A]"}
                        title="Zu Favoriten und anderen Listen hinzufügen"
                      >
                        <StarIcon size={18} />
                      </button>
                      {listsPanelOpen && (
                        <div className="absolute top-full right-0 mt-2 w-56 bg-[#0A0A0A] border border-[#9C7A3D]/30 rounded-xl shadow-2xl z-30 overflow-hidden">
                          {availableLists.length === 0 && (
                            <div className="p-3 text-xs text-slate-500">Keine Listen</div>
                          )}
                          {availableLists.map((l) => (
                            <button
                              key={l.id}
                              onClick={() => addFanToList(l.id)}
                              className={`w-full text-left px-3 py-2 text-xs hover:bg-[#C9A86A]/10 flex items-center justify-between ${addedToList.has(l.id) ? "text-[#C9A86A]" : "text-slate-300"}`}
                            >
                              <span>{l.name}</span>
                              {addedToList.has(l.id) && <CheckIcon size={12} />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={toggleMute}
                      className={chats.find((c) => c.withUser.id === activeFanId)?.isMutedNotifications ? "text-[#C9A86A]" : "hover:text-[#E2C48A]"}
                      title="Benachrichtigungen stumm schalten"
                    >
                      <BellIcon size={18} />
                    </button>
                    <div className="relative">
                      <button
                        onClick={togglePinnedPanel}
                        className={pinnedPanelOpen ? "text-[#C9A86A]" : "hover:text-[#E2C48A]"}
                        title="Angeheftete Nachrichten"
                      >
                        <PinIcon size={18} />
                      </button>
                      {pinnedPanelOpen && (
                        <div className="absolute top-full right-0 mt-2 w-72 max-h-72 overflow-y-auto scrollbar-hide bg-[#0A0A0A] border border-[#9C7A3D]/30 rounded-xl shadow-2xl z-30">
                          {pinnedLoading && <div className="p-3 text-xs text-slate-500 italic">Lade…</div>}
                          {!pinnedLoading && pinnedMessages.length === 0 && (
                            <div className="p-3 text-xs text-slate-500">Keine angehefteten Nachrichten</div>
                          )}
                          <div className="divide-y divide-[#9C7A3D]/10">
                            {pinnedMessages.map((m: any, i: number) => (
                              <div key={m.id ?? i} className="p-2.5 text-xs text-slate-300">{stripHtmlPreview(m.text || "")}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={toggleGallery}
                      className={galleryOpen ? "text-[#C9A86A]" : "hover:text-[#E2C48A]"}
                      title="Galerie (bereits gesendete Medien)"
                    >
                      <ImageIcon size={18} />
                    </button>
                  </div>
                </div>
                {galleryOpen && (
                  <div className="p-3 border-b border-[#9C7A3D]/20 bg-black/20 max-h-56 overflow-y-auto scrollbar-hide">
                    {galleryLoading && <div className="text-xs text-slate-500 italic">Lade…</div>}
                    {!galleryLoading && galleryMedia.length === 0 && (
                      <div className="text-xs text-slate-500">Noch nichts in dieser Konversation gesendet</div>
                    )}
                    <div className="grid grid-cols-6 gap-1.5">
                      {galleryMedia.map((m, i) => {
                        const url = m.files?.thumb?.url || m.files?.preview?.url || m.files?.full?.url;
                        if (!url) return null;
                        const isPaid = !!(m.price && Number(m.price) > 0);
                        return (
                          <div key={m.id ?? i} className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/api/crm/of-inbox/media-proxy?url=${encodeURIComponent(url)}`} className="w-full aspect-square object-cover rounded" alt="" />
                            {isPaid && (
                              <span className="absolute bottom-0.5 right-0.5 text-[8px] font-bold bg-[#C9A86A] text-black px-1 rounded">PAID</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
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
                    const filtered = messageSearch ? (chatSearchResults ?? []) : messages;
                    let lastDateKey = "";
                    const today = new Date().toDateString();
                    const yesterday = new Date(Date.now() - 86400000).toDateString();
                    // Same left-to-right, never-search-ahead matching as
                    // VNC's overlay (app/vps-server.js applyLabelsFromLog) -
                    // walks own messages oldest-first against the log
                    // oldest-first, so unlogged old bubbles just get
                    // skipped instead of stealing a later duplicate-text
                    // entry.
                    let logIdx = 0;
                    const attribution = new Map<number, string>();
                    for (const m of messages) {
                      if (String(m.fromUser?.id) === String(activeFanId)) continue;
                      if (logIdx >= sentLog.length) break;
                      const entry = sentLog[logIdx];
                      const matched = entry.message_text && m.text && stripHtmlPreview(m.text) === entry.message_text;
                      if (!matched) continue;
                      attribution.set(m.id, entry.chatter_name);
                      logIdx++;
                    }
                    return filtered.map((m) => {
                    const isOwn = String(m.fromUser?.id) !== String(activeFanId);
                    const isRead = isOwn && Number(m.id) <= lastRead;
                    const sentBy = attribution.get(m.id);
                    const msgDate = m.createdAt ? new Date(m.createdAt) : null;
                    const dateKey = msgDate ? msgDate.toDateString() : "";
                    const showDivider = dateKey && dateKey !== lastDateKey;
                    lastDateKey = dateKey;
                    const dividerLabel = !msgDate ? "" : dateKey === today ? "Heute" : dateKey === yesterday ? "Gestern" : msgDate.toLocaleDateString("de-DE", { day: "numeric", month: "long" });
                    const time = msgDate ? msgDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "";
                    const isPinned = !!m.isPinned;
                    const isLiked = !!m.isLiked;
                    const canDelete = isOwn && msgDate && Date.now() - msgDate.getTime() < 24 * 3600 * 1000;
                    return (
                      <Fragment key={m.id}>
                        {showDivider && (
                          <div className="text-center text-[11px] text-slate-500 font-bold uppercase tracking-wider my-3">{dividerLabel}</div>
                        )}
                        <div className={`group flex items-center gap-1.5 ${isOwn ? "justify-end" : "justify-start"}`}>
                          {isOwn && (
                            <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1 text-slate-500">
                              <button onClick={() => togglePin(m.id, isPinned)} title={isPinned ? "Entpinnen" : "Anheften"} className={isPinned ? "text-[#C9A86A]" : "hover:text-[#E2C48A]"}>
                                <PinIcon size={14} />
                              </button>
                              {canDelete && (
                                <button onClick={() => deleteOwnMessage(m.id)} title="Senden rückgängig machen (24h)" className="hover:text-red-400">
                                  <CloseIcon size={14} />
                                </button>
                              )}
                            </div>
                          )}
                          <div className={`max-w-[70%] rounded-xl px-4 py-2.5 text-base ${isOwn ? "bg-[#C9A86A]/20 text-white" : "bg-black/30 text-slate-200"}`}>
                            {isPinned && <div className="flex items-center gap-1 text-[10px] text-[#C9A86A] mb-1"><PinIcon size={11} /> Angeheftet</div>}
                            {/* CONFIRMED LIVE 2026-07-31: price/canPurchase sind
                                echte Felder - eine noch nicht freigeschaltete
                                PPV zeigt statt der (eh nicht ladbaren) Medien
                                einen Preis-Hinweis, wie im echten OnlyFans. */}
                            {Number(m.price) > 0 && m.canPurchase ? (
                              <div className="flex items-center gap-2 py-2 px-1 text-[#E2C48A]">
                                <PriceTagIcon size={20} />
                                <div>
                                  <div className="text-sm font-bold">${m.price}</div>
                                  <div className="text-[10px] text-slate-400">Noch nicht freigeschaltet</div>
                                </div>
                              </div>
                            ) : (
                              <MessageMedia media={m.media} />
                            )}
                            {m.text && <div dangerouslySetInnerHTML={{ __html: m.text }} />}
                            {isOwn && (
                              <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-400">
                                {sentBy && <span className="opacity-60">gesendet von {sentBy}</span>}
                                <span>{time}</span>
                                {isRead ? <DoubleCheckIcon size={13} /> : <CheckIcon size={11} />}
                              </div>
                            )}
                            {!isOwn && time && (
                              <div className="text-[10px] text-slate-500 mt-1">{time}</div>
                            )}
                          </div>
                          {!isOwn && (
                            <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1 text-slate-500">
                              <button onClick={() => toggleLike(m.id, isLiked)} title={isLiked ? "Gefällt mir nicht mehr" : "Gefällt mir"} className={isLiked ? "text-[#C9A86A]" : "hover:text-[#E2C48A]"}>
                                <HeartIcon size={14} filled={isLiked} />
                              </button>
                              <button onClick={() => togglePin(m.id, isPinned)} title={isPinned ? "Entpinnen" : "Anheften"} className={isPinned ? "text-[#C9A86A]" : "hover:text-[#E2C48A]"}>
                                <PinIcon size={14} />
                              </button>
                            </div>
                          )}
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
            <h3 className="text-sm font-bold text-[#C9A86A] uppercase tracking-wider mb-3">Fan umbenennen</h3>
            <p className="text-xs text-slate-400 mb-3">Schreibt direkt in OnlyFans' eigenes Namensfeld - überall sichtbar, nicht nur hier.</p>
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

      {lightboxMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setLightboxMedia(null)}>
          <div className="max-w-3xl max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const url = lightboxMedia.files?.full?.url || lightboxMedia.files?.preview?.url || lightboxMedia.files?.thumb?.url;
              if (!url) return null;
              const proxied = `/api/crm/of-inbox/media-proxy?url=${encodeURIComponent(url)}`;
              if (lightboxMedia.type === "video") return <video src={proxied} controls autoPlay className="max-w-full max-h-[85vh] rounded-lg" />;
              if (lightboxMedia.type === "audio") return <audio src={proxied} controls autoPlay className="w-96" />;
              // eslint-disable-next-line @next/next/no-img-element
              return <img src={proxied} className="max-w-full max-h-[85vh] rounded-lg object-contain" alt="" />;
            })()}
          </div>
        </div>
      )}
    </main>
  );
}
