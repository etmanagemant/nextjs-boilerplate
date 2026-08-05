"use client";

import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { useSearchParams } from "next/navigation";
import { FanCrmPanel } from "@/components/FanCrmPanel";
import EmojiBar from "@/components/layout/EmojiBar";
import NextShiftsWidget from "@/components/layout/NextShiftsWidget";
import { usePublishModelTabs } from "@/components/layout/ModelTabsContext";
import {
  HomeIcon, BellIcon, ChatIcon, ImageIcon, CalendarIcon, ChartIcon, ReceiptIcon,
  NewBadgeIcon, PriceTagIcon, TipIcon, CartIcon, SearchIcon, StarIcon, PinIcon, CheckIcon, DoubleCheckIcon, MuteIcon, CloseIcon, HeartIcon, BookmarkIcon, ArrowLeftIcon, ScriptIcon,
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
  const [activePanel, setActivePanel] = useState<null | "stats" | "schedules" | "earnings">(null);
  // Task: Tresor bekommt ein echtes Popup (zwei Spalten wie im echten
  // OnlyFans-Screenshot) statt der kleinen Dropdown-Leiste, gleiches
  // Popup egal ob über das Sidebar-Icon oder den Anhängen-Button in der
  // Compose-Leiste geöffnet. "view" = nur ansehen (Lightbox bei Klick),
  // "attach" = Mehrfachauswahl für eine Nachricht.
  const [vaultModalMode, setVaultModalMode] = useState<null | "view" | "attach">(null);
  // Task: Tresor-Popup wird sowohl vom Chat-Tippfeld als auch vom
  // Massmessage-Compose zum Anhängen genutzt (gleiches Popup, wie im
  // echten OnlyFans) - dieser Flag entscheidet, in welchen State ein
  // Klick auf ein Medium landet.
  const [vaultAttachTarget, setVaultAttachTarget] = useState<"chat" | "massmessage">("chat");
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState("");
  const [vaultLists, setVaultLists] = useState<any[]>([]);
  const [vaultMedia, setVaultMedia] = useState<any[]>([]);
  const [vaultActiveListId, setVaultActiveListId] = useState<string | null>(null);
  const [vaultTypeFilter, setVaultTypeFilter] = useState<string | null>(null);
  const [vaultMediaHasMore, setVaultMediaHasMore] = useState(true);
  const [vaultMediaLoadingMore, setVaultMediaLoadingMore] = useState(false);
  const vaultMediaOffsetRef = useRef(0);
  // Ref statt State: openVaultModal setzt vaultModalMode/vaultAttachTarget
  // und ruft im selben Tick loadVaultMedia auf - React-State ist da noch
  // nicht aktualisiert (klassischer Stale-Closure-Bug), weshalb der
  // PAID-Check beim ersten Laden nie griff. Ein Ref ist sofort aktuell,
  // Pagination/Ordnerwechsel lesen einfach den zuletzt gesetzten Wert.
  const vaultPurchaseCheckFanIdRef = useRef<number | null>(null);
  const [lightboxMedia, setLightboxMedia] = useState<any | null>(null);
  const [pinnedPanelOpen, setPinnedPanelOpen] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const [pinnedLoading, setPinnedLoading] = useState(false);
  const [fanLists, setFanLists] = useState<any[]>([]);
  const [listsModalOpen, setListsModalOpen] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [listMembersLoading, setListMembersLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [earnings, setEarnings] = useState<any>(null);

  // Task: Massmessage genau wie im echten OnlyFans (CONFIRMED LIVE
  // 2026-08-05 via echten Netzwerk-Mitschnitt + echtem Testversand).
  const [fanSearchOpen, setFanSearchOpen] = useState(false);
  const [fanSearchQuery, setFanSearchQuery] = useState("");
  const [fanSearchResults, setFanSearchResults] = useState<any[]>([]);
  const [fanSearchLoading, setFanSearchLoading] = useState(false);

  const [massmessageList, setMassmessageList] = useState<any[]>([]);
  const [mmDeletingId, setMmDeletingId] = useState<number | null>(null);

  const [mmOpen, setMmOpen] = useState(false);
  const [mmLists, setMmLists] = useState<any[]>([]);
  const [mmExcluded, setMmExcluded] = useState<Set<string>>(new Set());
  const [mmRecipientCount, setMmRecipientCount] = useState<number | null>(null);
  const [mmText, setMmText] = useState("");
  const [mmPrice, setMmPrice] = useState("");
  const [mmMedia, setMmMedia] = useState<any[]>([]);
  const [mmSending, setMmSending] = useState(false);
  const [mmError, setMmError] = useState("");
  const [mmSentInfo, setMmSentInfo] = useState<string | null>(null);

  const VAULT_PAGE_SIZE = 40;

  async function loadVaultMedia(listId: string | null, opts: { more?: boolean; purchaseCheckFanId?: number | null } = {}) {
    if (!modelId) return;
    const offset = opts.more ? vaultMediaOffsetRef.current : 0;
    // purchaseCheckFanId wird nur bei einem frischen Öffnen (nicht
    // more/Ordnerwechsel) explizit übergeben - dann im Ref gemerkt, damit
    // Pagination/Ordnerwechsel denselben Kontext behalten.
    if (opts.purchaseCheckFanId !== undefined) vaultPurchaseCheckFanIdRef.current = opts.purchaseCheckFanId;
    const purchaseCheck = vaultPurchaseCheckFanIdRef.current ? `&userPurchaseCheck=${vaultPurchaseCheckFanIdRef.current}` : "";
    const res = await fetch(`/api/crm/of-inbox/vault-media?modelId=${encodeURIComponent(modelId)}&offset=${offset}${listId ? `&listId=${encodeURIComponent(listId)}` : ""}${purchaseCheck}`);
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

  async function openVaultModal(mode: "view" | "attach", target: "chat" | "massmessage" = "chat") {
    if (vaultModalMode === mode) { setVaultModalMode(null); return; }
    setVaultModalMode(mode);
    setVaultAttachTarget(target);
    setScriptPanelOpen(false);
    if (!modelId) return;
    setPanelLoading(true);
    setPanelError("");
    try {
      setVaultActiveListId(null);
      setVaultTypeFilter(null);
      vaultMediaOffsetRef.current = 0;
      setVaultMediaHasMore(true);
      // target/activeFanId hier lesen (nicht in loadVaultMedia) - das
      // sind Werte aus dem AKTUELLEN Aufruf, nicht die gerade erst per
      // setState angestoßenen (die wären in diesem Tick noch alt).
      const purchaseCheckFanId = mode === "attach" && target === "chat" ? activeFanId : null;
      // Task #58: die zwei Requests liefen vorher nacheinander, jetzt
      // parallel - spürbar schnelleres erstes Laden.
      const [listsRes] = await Promise.all([
        fetch(`/api/crm/of-inbox/vault-lists?modelId=${encodeURIComponent(modelId)}`).then((r) => r.json()),
        loadVaultMedia(null, { purchaseCheckFanId }),
      ]);
      if (listsRes.error) throw new Error(listsRes.error);
      setVaultLists(listsRes.data?.list || []);
    } catch (e: any) {
      setPanelError(e.message || "Fehler beim Laden");
    } finally {
      setPanelLoading(false);
    }
  }

  async function openPanel(panel: NonNullable<typeof activePanel>) {
    if (activePanel === panel) { setActivePanel(null); return; }
    setActivePanel(panel);
    if (!modelId) return;
    setPanelLoading(true);
    setPanelError("");
    try {
      if (panel === "stats") {
        const [res, mmRes] = await Promise.all([
          fetch(`/api/crm/of-inbox/stats?modelId=${encodeURIComponent(modelId)}`),
          fetch(`/api/crm/of-inbox/massmessage-list?modelId=${encodeURIComponent(modelId)}`),
        ]);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Fehler beim Laden");
        setStats(data.data || null);
        const mmData = await mmRes.json();
        setMassmessageList(mmRes.ok ? mmData.data?.items || [] : []);
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

  // CONFIRMED LIVE 2026-08-05: /chats/users?query= - der echte 🔍 im
  // OnlyFans-Nachrichten-Header, sucht Fan-Namen über ALLE Chats (nicht
  // nur die aktuell geladene Seite der Chatliste).
  function toggleFanSearch() {
    setFanSearchOpen((v) => {
      if (v) { setFanSearchQuery(""); setFanSearchResults([]); }
      return !v;
    });
  }

  useEffect(() => {
    if (!fanSearchOpen || !modelId || fanSearchQuery.trim().length < 2) {
      setFanSearchResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setFanSearchLoading(true);
      try {
        const res = await fetch(`/api/crm/of-inbox/fan-search?modelId=${encodeURIComponent(modelId)}&query=${encodeURIComponent(fanSearchQuery.trim())}`);
        const data = await res.json();
        setFanSearchResults(res.ok ? data.data?.list || [] : []);
      } catch {
        setFanSearchResults([]);
      } finally {
        setFanSearchLoading(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [fanSearchOpen, fanSearchQuery, modelId]);

  function selectFanSearchResult(fanId: number) {
    setFanSearchOpen(false);
    setFanSearchQuery("");
    setFanSearchResults([]);
    openChat(fanId);
  }

  // "Senden rückgängig machen" - CONFIRMED LIVE 2026-08-05.
  async function deleteMassmessage(queueId: number) {
    if (!modelId) return;
    if (!window.confirm("Diese Massennachricht wirklich zurückziehen?")) return;
    setMmDeletingId(queueId);
    try {
      await fetch("/api/crm/of-inbox/massmessage-delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, queueId }),
      });
      setMassmessageList((prev) => prev.map((m) => (m.id === queueId ? { ...m, isCanceled: true, canUnsend: false } : m)));
    } catch {
    } finally {
      setMmDeletingId(null);
    }
  }

  // Massmessage-Compose - CONFIRMED LIVE 2026-08-05 gegen echtes Testmodel
  // (echter Versand an 3 Empfänger, bestätigt angekommen). Basis-Zielgruppe
  // ist immer "Fans" (= alle aktiven Abonnenten, wie im echten OnlyFans-
  // Standardverhalten), einzelne Listen können davon ausgeschlossen werden -
  // exakt die "SENDEN AN"/"AUSSCHLIESSEN"-Mechanik aus dem Mitschnitt.
  async function openMassmessageCompose() {
    setMmOpen(true);
    setMmError("");
    setMmSentInfo(null);
    setMmText("");
    setMmPrice("");
    setMmMedia([]);
    setMmExcluded(new Set());
    setMmRecipientCount(null);
    if (!modelId) return;
    try {
      const res = await fetch(`/api/crm/of-inbox/lists?modelId=${encodeURIComponent(modelId)}`);
      const data = await res.json();
      const list = Array.isArray(data.data) ? data.data : data.data?.list || [];
      setMmLists(list.filter((l: any) => l.id !== "fans"));
    } catch {
      setMmLists([]);
    }
    loadMmRecipientCount(new Set());
  }

  async function loadMmRecipientCount(excluded: Set<string>) {
    if (!modelId) return;
    try {
      const qs = new URLSearchParams({ modelId, listId: "fans" });
      if (excluded.size > 0) qs.set("excludedLists", Array.from(excluded).join(","));
      const res = await fetch(`/api/crm/of-inbox/massmessage-recipient-count?${qs.toString()}`);
      const data = await res.json();
      setMmRecipientCount(res.ok ? data.data?.total ?? 0 : null);
    } catch {
      setMmRecipientCount(null);
    }
  }

  function toggleMmExcluded(listId: string) {
    setMmExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(listId)) next.delete(listId); else next.add(listId);
      loadMmRecipientCount(next);
      return next;
    });
  }

  async function sendMassmessage() {
    if (!modelId) return;
    const hasText = !!mmText.trim();
    const hasMedia = mmMedia.length > 0;
    if (!hasText && !hasMedia) return;
    setMmSending(true);
    setMmError("");
    try {
      const res = await fetch("/api/crm/of-inbox/massmessage-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          text: mmText.trim(),
          mediaFiles: hasMedia ? mmMedia.map((m) => m.id) : [],
          price: hasMedia && mmPrice ? Number(mmPrice) : undefined,
          userLists: ["fans"],
          excludedLists: Array.from(mmExcluded),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Senden fehlgeschlagen");
      setMmSentInfo(`Gesendet an ${mmRecipientCount ?? "?"} Empfänger`);
      setMmText("");
      setMmPrice("");
      setMmMedia([]);
    } catch (e: any) {
      setMmError(e.message || "Senden fehlgeschlagen");
    } finally {
      setMmSending(false);
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
  // Task: Script Vault + Tresor direkt in der Compose-Leiste, API-
  // getrieben statt wie bei VNC über sichtbare Klicks mit Verzögerung.
  const [scriptPanelOpen, setScriptPanelOpen] = useState(false);
  const [scripts, setScripts] = useState<any[]>([]);
  const [scriptsLoading, setScriptsLoading] = useState(false);
  const [scriptsError, setScriptsError] = useState("");
  const [attachedMedia, setAttachedMedia] = useState<any[]>([]);
  const [attachPrice, setAttachPrice] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [userDetails, setUserDetails] = useState<Record<string, UserDetail>>({});
  const [spendDisplay, setSpendDisplay] = useState<Record<string, string>>({});
  const [fanMetadata, setFanMetadata] = useState<any | null>(null);
  const [fanMetaLastEditedBy, setFanMetaLastEditedBy] = useState<string | null>(null);
  // Task #32: echte Lifetime-Ausgaben pro Fan (CONFIRMED LIVE 2026-08-01
  // via /users/u{fanId} -> subscribedOnData.totalSumm etc.), ersetzt die
  // vorherige "keine Quelle gefunden"-Lücke.
  const [fanSpend, setFanSpend] = useState<{ totalSumm: number; tipsSumm: number; subscribesSumm: number; messagesSumm: number; postsSumm: number } | null>(null);
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
  const [notifCategoryFilter, setNotifCategoryFilter] = useState<string | null>(null);
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
  // Task: "schneller für Chatter" - ein bereits in dieser Session
  // besuchter Model-Tab zeigt beim Zurückwechseln SOFORT die zuletzt
  // geladenen Daten (kein leerer "Lade…"-Zustand), während im Hintergrund
  // trotzdem neu geladen wird. Bewusst NUR für schon besuchte Models, kein
  // Eager-Prefetch aller verbundenen Models beim Start - die Puppeteer-
  // Session pro Model auf der VPS ist teuer (2 vCPU/4GB, max 3 gleich-
  // zeitig), unnötig viele Sessions parallel wachzuhalten wäre riskant.
  const chatsCacheRef = useRef<Record<string, { chats: ChatListItem[]; userDetails: Record<string, UserDetail>; hasMore: boolean; nextOffset: number }>>({});

  const loadChats = useCallback(async (opts: { more?: boolean } = {}) => {
    if (!modelId) return;
    const offset = opts.more ? chatOffsetRef.current : 0;
    const cached = !opts.more ? chatsCacheRef.current[modelId] : undefined;
    if (cached) {
      // Sofort anzeigen, Ladeanzeige nur noch dezent (kein Full-Reset).
      setChats(cached.chats);
      setUserDetails((prev) => ({ ...prev, ...cached.userDetails }));
      setChatsHasMore(cached.hasMore);
      chatOffsetRef.current = cached.nextOffset;
      setChatsLoading(false);
    } else if (opts.more) {
      setChatsLoadingMore(true);
    } else {
      setChatsLoading(true);
      chatOffsetRef.current = 0;
      setChatsHasMore(true);
    }
    setChatsError("");
    try {
      const res = await fetch(`/api/crm/of-inbox/chats?modelId=${encodeURIComponent(modelId)}&offset=${offset}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden");
      const list: ChatListItem[] = data.data?.list || [];
      const hasMore = !!data.data?.hasMore;
      const nextOffset = typeof data.data?.nextOffset === "number" ? data.data.nextOffset : offset + list.length;
      setChatsHasMore(hasMore);
      chatOffsetRef.current = nextOffset;
      setChats((prev) => (opts.more ? [...prev, ...list] : list));

      const fanIds = list.map((c) => String(c.withUser.id));
      let userDetailsMap: Record<string, UserDetail> = {};
      if (fanIds.length > 0) {
        // Names/Avatare kommen jetzt direkt in der /chats-Antwort mit
        // (data.userDetails, server-seitig im selben VPS-Request geholt) -
        // spart eine komplette Browser->Vercel->VPS->OnlyFans-Runde, die
        // vorher das sichtbare "Ringe/Namen laden verzögert nach" verursacht
        // hat. Gleiche Response-Form wie vorher (Objekt-Map nach Fan-ID).
        const raw = data.userDetails;
        const arr: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.list) ? raw.list : Object.values(raw || {});
        arr.forEach((u: any) => {
          if (u && u.id != null) userDetailsMap[String(u.id)] = { name: u.name || u.displayName, username: u.username, avatar: u.avatar || null, subscribedByData: u.subscribedByData || undefined };
        });
        setUserDetails((prev) => ({ ...prev, ...userDetailsMap }));

        fetch("/api/crm/fan-spend-overlay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelId, fanIds, newFanIds: [] }),
        })
          .then((r) => r.json())
          .then((d) => setSpendDisplay((prev) => ({ ...prev, ...(d.display || {}) })))
          .catch(() => {});
      }

      const prevCache = chatsCacheRef.current[modelId];
      chatsCacheRef.current[modelId] = {
        chats: opts.more ? [...(prevCache?.chats || []), ...list] : list,
        userDetails: { ...(prevCache?.userDetails || {}), ...userDetailsMap },
        hasMore,
        nextOffset,
      };
    } catch (e: any) {
      if (!cached) setChatsError(e.message || "Fehler beim Laden der Chats");
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
    setScriptPanelOpen(false);
    setVaultModalMode(null);
    setAttachedMedia([]);
    setAttachPrice("");
    setFanSpend(null);
    loadMessages(fanId);
    loadFanMetadata(fanId);
    loadFanSpend(fanId);
  }

  async function loadFanSpend(fanId: number) {
    if (!modelId) return;
    try {
      const res = await fetch(`/api/crm/of-inbox/fan-detail?modelId=${encodeURIComponent(modelId)}&fanId=${fanId}`);
      const data = await res.json();
      const s = data.data?.subscribedOnData;
      if (s) {
        setFanSpend({ totalSumm: s.totalSumm || 0, tipsSumm: s.tipsSumm || 0, subscribesSumm: s.subscribesSumm || 0, messagesSumm: s.messagesSumm || 0, postsSumm: s.postsSumm || 0 });
        // Ring-Badge (spendDisplay) UND "Gesamtausgaben" (FanCrmPanel liest
        // fanMetadata.lifetime_value) hingen bisher am alten VNC-Scrape-
        // Cache, der Lücken hatte - der Server schreibt den echten Wert
        // schon zurück in crm_fan_metadata (siehe fan-detail route), hier
        // zusätzlich sofort im UI übernehmen statt auf den nächsten Sync
        // zu warten.
        setSpendDisplay((prev) => ({ ...prev, [String(fanId)]: String(Math.round(s.totalSumm || 0)) }));
        loadFanMetadata(fanId);
      }
    } catch {}
  }

  async function handleSend() {
    const hasText = !!draft.trim();
    const hasMedia = attachedMedia.length > 0;
    if ((!hasText && !hasMedia) || !activeFanId || !modelId) return;
    setSending(true);
    setSendError("");
    try {
      const res = await fetch("/api/crm/of-inbox/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          fanId: activeFanId,
          text: draft.trim(),
          mediaFiles: hasMedia ? attachedMedia.map((m) => m.id) : undefined,
          price: hasMedia && attachPrice ? Number(attachPrice) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Senden fehlgeschlagen");
      setDraft("");
      setAttachedMedia([]);
      setAttachPrice("");
      await loadMessages(activeFanId);
      await loadChats();
    } catch (e: any) {
      setSendError(e.message || "Senden fehlgeschlagen");
    } finally {
      setSending(false);
    }
  }

  // Script Vault: nur der Text der Schritte wird eingefügt. Die in einem
  // Script gespeicherten Medien (media_refs) sind aus der VNC-Ära nach
  // sichtbarem Namen/Label gematcht, nicht nach der echten Tresor-ID, die
  // unser neuer API-Weg braucht - kein sauberer Weg, das automatisch mit
  // zu übernehmen. Medien werden separat über den Tresor-Button ausgewählt.
  async function loadScripts() {
    if (!modelId) return;
    setScriptsLoading(true);
    setScriptsError("");
    try {
      const res = await fetch(`/api/crm/of-inbox/scripts?modelId=${encodeURIComponent(modelId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
      setScripts(data.scripts || []);
    } catch (e: any) {
      setScripts([]);
      setScriptsError(e.message || "Fehler beim Laden");
    } finally {
      setScriptsLoading(false);
    }
  }

  function toggleScriptPanel() {
    if (scriptPanelOpen) { setScriptPanelOpen(false); return; }
    setScriptPanelOpen(true);
    setVaultModalMode(null);
    // Fix: lud vorher nur beim allerersten Öffnen (scripts.length>0-Check),
    // ein danach gespeicherter neuer Schritt tauchte deshalb nie auf ohne
    // Seiten-Neuladen. Jetzt bei jedem Öffnen frisch.
    loadScripts();
  }

  // Fix: media_refs eines Scripts trägt doch eine echte Tresor-Medien-ID
  // (media_refs[].id, gefüllt von VaultGalleryPicker im Script Vault -
  // dasselbe echte OnlyFans-Vault, nur über einen älteren Sniff-Weg statt
  // unserer neuen signierten Route) - vorher fälschlich angenommen, das
  // wäre nur ein VNC-Label ohne echte ID. Jetzt an den Tresor angebunden:
  // Medien werden mit übernommen, Preis vom ersten PPV-Schritt auch.
  function insertScript(script: any) {
    const text = (script.steps || [])
      .filter((s: any) => s.message_text)
      .map((s: any) => s.message_text)
      .join("\n\n");
    if (text) setDraft((d) => (d ? `${d}\n${text}` : text));

    const mediaWithId = (script.steps || [])
      .flatMap((s: any) => s.media_refs || [])
      .filter((m: any) => m.id != null && !Number.isNaN(Number(m.id)));
    if (mediaWithId.length > 0) {
      setAttachedMedia((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const toAdd = mediaWithId
          .map((m: any) => ({ id: Number(m.id), type: m.thumbnailUrl ? "photo" : "audio", files: { thumb: { url: m.thumbnailUrl } } }))
          .filter((m: any) => !existingIds.has(m.id));
        return [...prev, ...toAdd];
      });
    }
    const priceStep = (script.steps || []).find((s: any) => s.price);
    if (priceStep?.price) setAttachPrice(String(priceStep.price));

    setScriptPanelOpen(false);
  }

  function toggleAttachMedia(m: any) {
    if (vaultAttachTarget === "massmessage") {
      setMmMedia((prev) => (prev.some((x) => x.id === m.id) ? prev.filter((x) => x.id !== m.id) : [...prev, m]));
      return;
    }
    setAttachedMedia((prev) => (prev.some((x) => x.id === m.id) ? prev.filter((x) => x.id !== m.id) : [...prev, m]));
  }

  function openVaultForMassmessage() {
    openVaultModal("attach", "massmessage");
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
  // CONFIRMED LIVE 2026-08-01: POST/DELETE /lists/{listId}/users/{fanId}
  // zum Ändern, GET /users/u{fanId} -> listsStates[].hasUser zum genauen
  // Mitglied-Status (System- UND Custom-Listen) - live verifiziert durch
  // echtes Hinzufügen/Entfernen eines Testfans aus einer echten Liste.
  // Ersetzt die vorherige Näherung über die abgeschnittene users[]-Vorschau.
  async function openListsPanel() {
    if (listsPanelOpen) { setListsPanelOpen(false); return; }
    setListsPanelOpen(true);
    if (!modelId || !activeFanId) return;
    try {
      const [listsRes, detailRes] = await Promise.all([
        fetch(`/api/crm/of-inbox/lists?modelId=${encodeURIComponent(modelId)}`),
        fetch(`/api/crm/of-inbox/fan-detail?modelId=${encodeURIComponent(modelId)}&fanId=${activeFanId}`),
      ]);
      const listsData = await listsRes.json();
      const list = Array.isArray(listsData.data) ? listsData.data : listsData.data?.list || [];
      const relevant = list.filter((l: any) => l.type === "custom" || l.id === "friends");
      setAvailableLists(relevant);

      const detailData = await detailRes.json();
      const states: any[] = detailData.data?.listsStates || [];
      const hasUserIds = new Set(states.filter((s: any) => s.hasUser).map((s: any) => String(s.id)));
      setAddedToList(new Set(relevant.filter((l: any) => hasUserIds.has(String(l.id))).map((l: any) => l.id)));
    } catch {
      setAvailableLists([]);
    }
  }

  // CONFIRMED LIVE 2026-08-05: POST /lists body {name} - erstellt eine
  // neue Custom-Liste, gegen eine Testliste geprüft und wieder gelöscht.
  async function createList() {
    if (!modelId) return;
    const name = window.prompt("Name der neuen Liste:");
    if (!name || !name.trim()) return;
    try {
      const res = await fetch("/api/crm/of-inbox/list-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Erstellen");
      setFanLists((prev) => [...prev, data.data]);
      selectList(data.data.id, [...fanLists, data.data]);
    } catch {}
  }

  // Task #69: CONFIRMED LIVE 2026-07-31 gegen eine leere Testliste.
  async function deleteList(listId: string) {
    if (!modelId) return;
    if (!window.confirm("Diese Liste wirklich unwiderruflich löschen?")) return;
    setFanLists((prev) => prev.filter((l) => l.id !== listId));
    if (selectedListId === listId) setSelectedListId(null);
    try {
      await fetch("/api/crm/of-inbox/list-delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, listId }),
      });
    } catch {}
  }

  // Task #69: "Liste leeren" - CONFIRMED LIVE 2026-08-01 via echten
  // Netzwerk-Mitschnitt (DELETE /lists/{listId}/users ohne fanId).
  async function clearList(listId: string) {
    if (!modelId) return;
    if (!window.confirm("Alle Mitglieder aus dieser Liste entfernen? Die Liste selbst bleibt bestehen.")) return;
    setFanLists((prev) => prev.map((l) => (l.id === listId ? { ...l, usersCount: 0, users: [] } : l)));
    try {
      await fetch("/api/crm/of-inbox/list-clear", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, listId }),
      });
    } catch {}
  }

  // Task #69: "Liste umbenennen" - CONFIRMED LIVE 2026-08-01 via echten
  // Netzwerk-Mitschnitt (PATCH /lists/{listId} body {name}).
  async function renameList(listId: string, currentName: string) {
    if (!modelId) return;
    const name = window.prompt("Neuer Name für diese Liste:", currentName);
    if (!name || name === currentName) return;
    setFanLists((prev) => prev.map((l) => (l.id === listId ? { ...l, name } : l)));
    try {
      await fetch("/api/crm/of-inbox/list-rename", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, listId, name }),
      });
    } catch {}
  }

  // Task: Listen-Icon bekommt ein echtes Popup (zwei Spalten, wie das
  // OnlyFans-eigene SAMMLUNGEN-Fenster) statt der kleinen Dropdown-Leiste.
  async function openListsModal() {
    if (listsModalOpen) { setListsModalOpen(false); return; }
    setListsModalOpen(true);
    if (!modelId) return;
    setPanelLoading(true);
    try {
      const res = await fetch(`/api/crm/of-inbox/lists?modelId=${encodeURIComponent(modelId)}`);
      const data = await res.json();
      const list = Array.isArray(data.data) ? data.data : data.data?.list || [];
      setFanLists(list);
      if (list.length > 0) selectList(list[0].id, list);
    } catch {
      setFanLists([]);
    } finally {
      setPanelLoading(false);
    }
  }

  // Mitglieder-Vorschau kommt schon mit der Liste (l.users, auf ein paar
  // Einträge begrenzt) - hier nur Name/Avatar für die IDs nachladen, die
  // wir noch nicht kennen.
  async function selectList(listId: string, listsOverride?: any[]) {
    setSelectedListId(listId);
    const list = (listsOverride || fanLists).find((l) => l.id === listId);
    const ids = (list?.users || []).map((u: any) => String(u.id)).filter((id: string) => !userDetails[id]);
    if (ids.length === 0 || !modelId) return;
    setListMembersLoading(true);
    try {
      const res = await fetch(`/api/crm/of-inbox/user-details?modelId=${encodeURIComponent(modelId)}&ids=${ids.join(",")}`);
      const data = await res.json();
      const raw = data.data;
      const arr: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.list) ? raw.list : Object.values(raw || {});
      const map: Record<string, UserDetail> = {};
      arr.forEach((u: any) => {
        if (u && u.id != null) map[String(u.id)] = { name: u.name || u.displayName, username: u.username, avatar: u.avatar || null };
      });
      setUserDetails((prev) => ({ ...prev, ...map }));
    } catch {
    } finally {
      setListMembersLoading(false);
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
      // Bug (2026-07-31): der Endpunkt liefert ganze NACHRICHTEN zurück
      // (responseType:"message", jede mit einem eigenen media[]-Array),
      // keine flache Medien-Liste - die Galerie zeigte deshalb nichts an
      // (m.files war immer undefined). Hier auf einzelne Medien
      // aufgefaltet, Preis der Nachricht wird pro Medium mitgegeben.
      const messages = Array.isArray(data.data) ? data.data : data.data?.list || [];
      const flat = messages.flatMap((msg: any) => (msg.media || []).map((med: any) => ({ ...med, price: msg.price })));
      setGalleryMedia(flat);
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
                  {/* Task: Kategorien nebeneinander als Tabs statt
                      gestapelt untereinander (wie Alle/Priorität/
                      Ungelesen an anderer Stelle in dieser App). */}
                  <div className="flex gap-1.5 p-2 border-b border-[#9C7A3D]/10 flex-wrap sticky top-8 bg-[#0A0A0A]">
                    <button
                      onClick={() => setNotifCategoryFilter(null)}
                      className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase ${!notifCategoryFilter ? "bg-[#C9A86A] text-black" : "bg-black/30 text-slate-400 hover:text-[#E2C48A]"}`}
                    >
                      Alle
                    </button>
                    {NOTIF_CATEGORY_ORDER.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setNotifCategoryFilter(cat)}
                        className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase ${notifCategoryFilter === cat ? "bg-[#C9A86A] text-black" : "bg-black/30 text-slate-400 hover:text-[#E2C48A]"}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  {notifLoading && <div className="p-3 text-xs text-slate-500 italic">Lade…</div>}
                  {notifError && <div className="p-3 text-xs text-red-400">{notifError}</div>}
                  {!notifLoading && notifications.length === 0 && !notifError && (
                    <div className="p-3 text-xs text-slate-500">Keine Benachrichtigungen</div>
                  )}
                  {(() => {
                    const filtered = notifCategoryFilter
                      ? notifications.filter((n) => notifCategory(n.type) === notifCategoryFilter)
                      : notifications;
                    return (
                      <div className="divide-y divide-[#9C7A3D]/10">
                          {filtered.map((n) => (
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
                    );
                  })()}
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
            <div className="relative">
              <button
                onClick={openListsModal}
                title="Listen"
                className={`hover:scale-110 transition ${listsModalOpen ? "scale-110 text-[#C9A86A]" : ""}`}
              >
                <BookmarkIcon size={30} />
              </button>
            </div>
            <div className="relative">
              <button
                onClick={() => openVaultModal("view")}
                title="Tresor"
                className={`hover:scale-110 transition ${vaultModalMode === "view" ? "scale-110 text-[#C9A86A]" : ""}`}
              >
                <ImageIcon size={30} />
              </button>
            </div>
            <div className="relative">
              <button
                onClick={toggleFanSearch}
                title="Fan suchen"
                className={`hover:scale-110 transition ${fanSearchOpen ? "scale-110 text-[#C9A86A]" : ""}`}
              >
                <SearchIcon size={26} />
              </button>
              {fanSearchOpen && (
                <div className="absolute top-full left-0 mt-2 w-72 bg-[#0A0A0A] border border-[#9C7A3D]/30 rounded-xl shadow-2xl z-30 overflow-hidden">
                  <div className="p-2 border-b border-[#9C7A3D]/20">
                    <input
                      autoFocus
                      value={fanSearchQuery}
                      onChange={(e) => setFanSearchQuery(e.target.value)}
                      placeholder="Fan-Namen suchen…"
                      className="w-full bg-[#050505] border border-[#9C7A3D]/30 rounded px-3 py-1.5 text-sm text-white outline-none focus:border-[#C9A86A]"
                    />
                  </div>
                  <div className="max-h-72 overflow-y-auto scrollbar-hide">
                    {fanSearchLoading && <div className="p-3 text-xs text-slate-500 italic">Lade…</div>}
                    {!fanSearchLoading && fanSearchQuery.trim().length >= 2 && fanSearchResults.length === 0 && (
                      <div className="p-3 text-xs text-slate-500">Keine Treffer</div>
                    )}
                    {fanSearchResults.map((u: any) => (
                      <button
                        key={u.id}
                        onClick={() => selectFanSearchResult(u.id)}
                        className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-[#C9A86A]/10"
                      >
                        <Avatar fanId={u.id} size={28} />
                        <span className="text-sm text-white truncate">{displayName(u.id)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {(isAdmin
              ? [
                  { Icon: CalendarIcon, key: "schedules" as const, label: "Kalender" },
                  { Icon: ReceiptIcon, key: "earnings" as const, label: "Auszahlungen" },
                ]
              : []
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
                    <div className="absolute top-full left-0 mt-2 overflow-y-auto scrollbar-hide bg-[#0A0A0A] border border-[#9C7A3D]/30 rounded-xl shadow-2xl z-30 w-96 max-h-[500px]">
                      <div className="p-3 border-b border-[#9C7A3D]/20 sticky top-0 bg-[#0A0A0A]">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#C9A86A]">{label}</span>
                      </div>
                      {panelLoading && <div className="p-3 text-xs text-slate-500 italic">Lade…</div>}
                      {panelError && <div className="p-3 text-xs text-red-400">{panelError}</div>}

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
              <div className="flex items-center gap-3">
                {isAdmin && (
                  <div className="relative">
                    <button onClick={() => openPanel("stats")} title="Massmessage-Statistik" className={activePanel === "stats" ? "text-[#C9A86A]" : "text-slate-400 hover:text-[#E2C48A]"}>
                      <ChartIcon size={16} />
                    </button>
                    {activePanel === "stats" && (
                      <div className="absolute top-full right-0 mt-2 overflow-y-auto scrollbar-hide bg-[#0A0A0A] border border-[#9C7A3D]/30 rounded-xl shadow-2xl z-30 w-96 max-h-[500px]">
                        <div className="p-3 border-b border-[#9C7A3D]/20 sticky top-0 bg-[#0A0A0A]">
                          <span className="text-xs font-bold uppercase tracking-wider text-[#C9A86A]">Statistik</span>
                        </div>
                        {panelLoading && <div className="p-3 text-xs text-slate-500 italic">Lade…</div>}
                        {panelError && <div className="p-3 text-xs text-red-400">{panelError}</div>}
                        {!panelLoading && stats?.overview?.massMessages && (
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
                            {/* CONFIRMED LIVE 2026-08-05: gleiche Tabelle wie
                                echtes OnlyFans Statistiken->Verlobung->
                                Massen-Nachrichten, inkl. "Rückgängig machen"
                                (DELETE /messages/queue/{id}, live getestet). */}
                            <div className="border-t border-[#9C7A3D]/10">
                              <div className="p-3 text-[10px] text-slate-500 uppercase">Letzte Massennachrichten</div>
                              {massmessageList.length === 0 && (
                                <div className="px-3 pb-3 text-xs text-slate-500">Keine Massennachrichten (30 Tage)</div>
                              )}
                              <div className="divide-y divide-[#9C7A3D]/10">
                                {massmessageList.map((m: any) => (
                                  <div key={m.id} className="px-3 py-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs text-slate-300 truncate">{stripHtmlPreview(m.text || "") || "(Medien)"}</span>
                                      <span className="text-[10px] text-slate-500 flex-shrink-0">{m.date ? new Date(m.date).toLocaleDateString("de-DE") : ""}</span>
                                    </div>
                                    <div className="flex items-center justify-between mt-1">
                                      <span className="text-[10px] text-slate-500">
                                        Gesendet: {m.sentCount ?? 0} · Betrachtet: {m.viewedCount ?? 0}
                                        {typeof m.price === "number" && m.price > 0 && <> · ${m.price}</>}
                                      </span>
                                      {m.isCanceled ? (
                                        <span className="text-[10px] text-red-400">Zurückgezogen</span>
                                      ) : m.canUnsend ? (
                                        <button
                                          onClick={() => deleteMassmessage(m.id)}
                                          disabled={mmDeletingId === m.id}
                                          className="text-[10px] font-bold uppercase text-slate-400 hover:text-red-400"
                                        >
                                          {mmDeletingId === m.id ? "…" : "Rückgängig"}
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {isAdmin && (
                  <button onClick={openMassmessageCompose} title="Massmessage erstellen" className="text-slate-400 hover:text-[#E2C48A] text-base leading-none font-bold">+</button>
                )}
                <button onClick={() => loadChats()} className="text-xs text-slate-400 hover:text-[#E2C48A]">↻</button>
              </div>
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
                  {fanSpend && (
                    <span
                      className="text-xs font-bold text-[#C9A86A] bg-[#C9A86A]/10 border border-[#9C7A3D]/30 rounded-full px-2.5 py-1 ml-1"
                      title={`Abos: $${fanSpend.subscribesSumm} · Nachrichten: $${fanSpend.messagesSumm} · Trinkgelder: $${fanSpend.tipsSumm} · Beiträge: $${fanSpend.postsSumm}`}
                    >
                      Lifetime: ${fanSpend.totalSumm}
                    </span>
                  )}
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
                        const isPaid = !!(m.price && Number(m.price) > 0);
                        const url = m.files?.thumb?.url || m.files?.preview?.url || m.files?.full?.url;
                        return (
                          <button key={m.id ?? i} onClick={() => setLightboxMedia(m)} className="relative">
                            {m.type === "audio" || !url ? (
                              <div className="w-full aspect-square rounded bg-[#C9A86A]/10 border border-[#9C7A3D]/20 flex items-center justify-center"><TipIcon size={16} /></div>
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={`/api/crm/of-inbox/media-proxy?url=${encodeURIComponent(url)}`} className="w-full aspect-square object-cover rounded" alt="" />
                            )}
                            {m.type === "video" && <span className="absolute bottom-0.5 left-0.5 text-[8px] font-bold bg-black/70 text-white px-1 rounded">▶</span>}
                            {isPaid && (
                              <span className="absolute inset-0 flex items-center justify-center">
                                <span className="text-xs font-black bg-[#C9A86A] text-black px-2.5 py-1 rounded shadow-lg">PAID</span>
                              </span>
                            )}
                          </button>
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
                                einen Preis-Hinweis, wie im echten OnlyFans.
                                CONFIRMED LIVE (zweiter Test, eigene gesendete
                                PPV): canPurchase spiegelt den Fan-Status, ist
                                bei einer PPV die WIR verschickt haben auch
                                true (der Fan hat ja noch nicht bezahlt) -
                                nur bei !isOwn sperren, sonst würde der
                                Chatter seine eigene verschickte PPV auch nie
                                zu sehen bekommen. */}
                            {!isOwn && Number(m.price) > 0 && m.canPurchase ? (
                              <div className="flex items-center gap-2 py-2 px-1 text-[#E2C48A]">
                                <PriceTagIcon size={20} />
                                <div>
                                  <div className="text-sm font-bold">${m.price}</div>
                                  <div className="text-[10px] text-slate-400">Noch nicht freigeschaltet</div>
                                </div>
                              </div>
                            ) : (
                              <>
                                {isOwn && Number(m.price) > 0 && (
                                  <div className="flex items-center gap-1 text-[10px] text-[#C9A86A] mb-1"><PriceTagIcon size={12} /> PPV ${m.price}</div>
                                )}
                                <MessageMedia media={m.media} />
                              </>
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
                  {attachedMedia.length > 0 && (
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {attachedMedia.map((m) => {
                        const url = m.files?.thumb?.url || m.files?.preview?.url;
                        return (
                          <div key={m.id} className="relative">
                            {m.type === "audio" ? (
                              <div className="w-12 h-12 rounded bg-[#C9A86A]/10 border border-[#9C7A3D]/20 flex items-center justify-center"><TipIcon size={16} /></div>
                            ) : url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={`/api/crm/of-inbox/media-proxy?url=${encodeURIComponent(url)}`} className="w-12 h-12 object-cover rounded" alt="" />
                            ) : (
                              <div className="w-12 h-12 rounded bg-black/40" />
                            )}
                            <button onClick={() => toggleAttachMedia(m)} className="absolute -top-1.5 -right-1.5 bg-black rounded-full text-red-400"><CloseIcon size={14} /></button>
                          </div>
                        );
                      })}
                      <input
                        value={attachPrice}
                        onChange={(e) => setAttachPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder="Preis $"
                        className="w-20 bg-[#050505] border border-[#9C7A3D]/30 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-[#C9A86A]"
                      />
                    </div>
                  )}
                  <EmojiBar onPick={(e) => setDraft((d) => d + e)} />
                  <div className="flex gap-2 items-center">
                    <div className="relative">
                      <button onClick={toggleScriptPanel} title="Script Vault" className={scriptPanelOpen ? "text-[#C9A86A]" : "text-slate-400 hover:text-[#E2C48A]"}>
                        <ScriptIcon size={20} />
                      </button>
                      {scriptPanelOpen && (
                        <div className="absolute bottom-full left-0 mb-2 w-72 max-h-72 overflow-y-auto scrollbar-hide bg-[#0A0A0A] border border-[#9C7A3D]/30 rounded-xl shadow-2xl z-30">
                          <div className="p-2.5 border-b border-[#9C7A3D]/20 flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-[#C9A86A]">Script Vault</span>
                            <button onClick={loadScripts} className="text-xs text-slate-400 hover:text-[#E2C48A]">↻</button>
                          </div>
                          {scriptsLoading && <div className="p-3 text-xs text-slate-500 italic">Lade…</div>}
                          {scriptsError && <div className="p-3 text-xs text-red-400">{scriptsError}</div>}
                          {!scriptsLoading && !scriptsError && scripts.length === 0 && (
                            <div className="p-3 text-xs text-slate-500">
                              Keine Scripts für dieses Model
                              <div className="text-[9px] text-slate-600 mt-1 select-all">modelId: {modelId}</div>
                            </div>
                          )}
                          <div className="divide-y divide-[#9C7A3D]/10">
                            {scripts.map((s) => {
                              const mediaCount = (s.steps || []).flatMap((st: any) => st.media_refs || []).length;
                              const price = (s.steps || []).find((st: any) => st.price)?.price;
                              return (
                                <button key={s.id} onClick={() => insertScript(s)} className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-[#C9A86A]/10 flex items-center justify-between">
                                  <span>{s.title}</span>
                                  <span className="text-[10px] text-slate-500 flex-shrink-0 ml-2 flex items-center gap-1.5">
                                    {mediaCount > 0 && (
                                      <span className="flex items-center gap-0.5"><ImageIcon size={10} />{mediaCount}</span>
                                    )}
                                    {price ? <span className="text-[#C9A86A] font-bold">${price}</span> : null}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    <button onClick={() => openVaultModal("attach", "chat")} title="Aus dem Tresor anhängen" className={vaultModalMode === "attach" ? "text-[#C9A86A]" : "text-slate-400 hover:text-[#E2C48A]"}>
                      <ImageIcon size={20} />
                    </button>
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
                      placeholder="Nachricht schreiben…"
                      className="flex-1 bg-[#050505] border border-[#9C7A3D]/30 rounded px-4 py-2.5 text-base text-white outline-none focus:border-[#C9A86A]"
                    />
                    <button
                      onClick={handleSend}
                      disabled={sending || (!draft.trim() && attachedMedia.length === 0)}
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

      {vaultModalMode && (
        // z-[60]: kann als "Anhängen"-Picker aus einem anderen Overlay
        // heraus geöffnet werden (Massmessage-Compose) - muss darüber
        // liegen, sonst geht der Tresor sichtbar dahinter auf (genau der
        // gemeldete Bug).
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => setVaultModalMode(null)}>
          <div className="w-full max-w-4xl h-[80vh] bg-[#0A0A0A] border border-[#9C7A3D]/30 rounded-xl shadow-2xl flex overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Linke Spalte: Ordner, wie im echten OnlyFans-Popup. */}
            <div className="w-56 flex-shrink-0 border-r border-[#9C7A3D]/20 flex flex-col overflow-hidden">
              <div className="p-3 border-b border-[#9C7A3D]/20 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#C9A86A]">Tresor</span>
                <SearchIcon size={14} />
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                <button
                  onClick={() => selectVaultList(null)}
                  className={`w-full text-left px-3 py-2.5 text-xs font-bold ${!vaultActiveListId ? "bg-[#C9A86A]/15 text-[#C9A86A]" : "text-slate-300 hover:bg-[#C9A86A]/10"}`}
                >
                  Alle Medien
                </button>
                {vaultLists.length > 0 && (
                  <div className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Custom</div>
                )}
                {vaultLists.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => selectVaultList(String(l.id))}
                    className={`w-full text-left px-3 py-2.5 text-xs ${vaultActiveListId === String(l.id) ? "bg-[#C9A86A]/15 text-[#C9A86A] font-bold" : "text-slate-300 hover:bg-[#C9A86A]/10"}`}
                  >
                    <div className="truncate">{l.name}</div>
                    <div className="text-[10px] text-slate-500">
                      {((l.videosCount || 0) + (l.photosCount || 0) + (l.gifsCount || 0) + (l.audiosCount || 0)) || "leer"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {/* Rechte Spalte: Medien, nach Typ gefiltert + nach Datum gruppiert. */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-3 border-b border-[#9C7A3D]/20 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#C9A86A]">Alle Medien</span>
                <button onClick={() => setVaultModalMode(null)} className="text-slate-400 hover:text-[#E2C48A]"><CloseIcon size={16} /></button>
              </div>
              <div className="flex gap-1.5 p-3 border-b border-[#9C7A3D]/10">
                {[
                  { id: null, label: "Alle" },
                  { id: "photo", label: "Fotos" },
                  { id: "gif", label: "GIFs" },
                  { id: "video", label: "Videos" },
                  { id: "audio", label: "Audio" },
                ].map((f) => (
                  <button
                    key={f.label}
                    onClick={() => setVaultTypeFilter(f.id)}
                    className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase ${vaultTypeFilter === f.id ? "bg-[#C9A86A] text-black" : "bg-black/30 text-slate-400 hover:text-[#E2C48A]"}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide p-3" onScroll={handleVaultMediaScroll}>
                {panelLoading && <div className="text-xs text-slate-500 italic">Lade…</div>}
                {panelError && <div className="text-xs text-red-400">{panelError}</div>}
                {!panelLoading && (() => {
                  const filtered = vaultMedia.filter((m) => !vaultTypeFilter || m.type === vaultTypeFilter);
                  if (filtered.length === 0) return <div className="text-xs text-slate-500 text-center py-6">Keine Medien</div>;
                  const today = new Date().toDateString();
                  const yesterday = new Date(Date.now() - 86400000).toDateString();
                  let lastDateKey = "";
                  return filtered.map((m) => {
                    const d = m.createdAt ? new Date(m.createdAt) : null;
                    const dateKey = d ? d.toDateString() : "";
                    const showHeader = dateKey && dateKey !== lastDateKey;
                    lastDateKey = dateKey;
                    const label = !d ? "" : dateKey === today ? "Heute" : dateKey === yesterday ? "Gestern" : d.toLocaleDateString("de-DE", { day: "numeric", month: "long" });
                    const selected = (vaultAttachTarget === "massmessage" ? mmMedia : attachedMedia).some((x) => x.id === m.id);
                    const url = m.files?.thumb?.url || m.files?.preview?.url || m.files?.full?.url;
                    return (
                      <Fragment key={m.id}>
                        {showHeader && <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-3 mb-1.5 first:mt-0">{label}</div>}
                        <div className="inline-block mr-1.5 mb-1.5 align-top">
                          <button
                            onClick={() => (vaultModalMode === "attach" ? toggleAttachMedia(m) : setLightboxMedia(m))}
                            className={`relative w-24 h-24 rounded ${selected ? "ring-2 ring-[#C9A86A]" : ""}`}
                          >
                            {m.type === "audio" || !url ? (
                              <div className="w-full h-full rounded bg-[#C9A86A]/10 border border-[#9C7A3D]/20 flex items-center justify-center"><TipIcon size={20} /></div>
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={`/api/crm/of-inbox/media-proxy?url=${encodeURIComponent(url)}`} className="w-full h-full object-cover rounded" alt="" />
                            )}
                            {m.type === "video" && <span className="absolute bottom-1 right-1 text-[8px] font-bold bg-black/70 text-white px-1 rounded">▶</span>}
                            {m.isPurchased && (
                              <span className="absolute inset-0 flex items-center justify-center">
                                <span className="text-[10px] font-black bg-[#C9A86A] text-black px-2 py-0.5 rounded shadow-lg">PAID</span>
                              </span>
                            )}
                            {selected && <span className="absolute top-1 right-1 bg-[#C9A86A] rounded-full p-0.5"><CheckIcon size={10} /></span>}
                          </button>
                        </div>
                      </Fragment>
                    );
                  });
                })()}
                {vaultMediaLoadingMore && <div className="text-xs text-slate-500 italic text-center mt-2">Lade weitere…</div>}
              </div>
              <div className="p-3 border-t border-[#9C7A3D]/20 flex justify-end">
                <button onClick={() => setVaultModalMode(null)} className="px-4 py-1.5 rounded text-xs font-bold uppercase bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] text-black hover:from-[#E5C158]">
                  Schließen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {listsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setListsModalOpen(false)}>
          <div className="w-full max-w-4xl h-[80vh] bg-[#0A0A0A] border border-[#9C7A3D]/30 rounded-xl shadow-2xl flex overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="w-56 flex-shrink-0 border-r border-[#9C7A3D]/20 flex flex-col overflow-hidden">
              <div className="p-3 border-b border-[#9C7A3D]/20 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#C9A86A]">Listen</span>
                <div className="flex items-center gap-2.5">
                  <button onClick={createList} title="Neue Liste erstellen" className="text-slate-400 hover:text-[#E2C48A] font-bold text-sm leading-none">+</button>
                  <SearchIcon size={14} />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                {panelLoading && <div className="p-3 text-xs text-slate-500 italic">Lade…</div>}
                {!panelLoading && fanLists.length === 0 && <div className="p-3 text-xs text-slate-500">Keine Listen</div>}
                {fanLists.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => selectList(l.id)}
                    className={`w-full text-left px-3 py-2.5 flex items-center justify-between ${selectedListId === l.id ? "bg-[#C9A86A]/15 text-[#C9A86A]" : "text-slate-300 hover:bg-[#C9A86A]/10"}`}
                  >
                    <span className="min-w-0">
                      <div className="text-xs font-bold truncate">{l.name}</div>
                      <div className="text-[10px] text-slate-500">{l.usersCount ?? l.users?.length ?? 0} Fans</div>
                    </span>
                    {l.canDelete && (
                      <span onClick={(e) => { e.stopPropagation(); deleteList(l.id); }} title="Liste löschen" className="text-slate-500 hover:text-red-400 flex-shrink-0 ml-1">
                        <CloseIcon size={12} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              {(() => {
                const list = fanLists.find((l) => l.id === selectedListId);
                return (
                  <div className="p-3 border-b border-[#9C7A3D]/20 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#C9A86A] truncate">{list?.name || "Fans"}</span>
                      {list && list.type === "custom" && (
                        <>
                          <button onClick={() => renameList(list.id, list.name)} title="Liste umbenennen" className="text-slate-400 hover:text-[#E2C48A] flex-shrink-0">✏️</button>
                          <button onClick={() => clearList(list.id)} title="Liste leeren (alle Mitglieder entfernen)" className="text-[10px] font-bold uppercase text-slate-400 hover:text-red-400 flex-shrink-0">leeren</button>
                        </>
                      )}
                    </div>
                    <button onClick={() => setListsModalOpen(false)} className="text-slate-400 hover:text-[#E2C48A] flex-shrink-0"><CloseIcon size={16} /></button>
                  </div>
                );
              })()}
              <div className="flex-1 overflow-y-auto scrollbar-hide p-3">
                {listMembersLoading && <div className="text-xs text-slate-500 italic">Lade…</div>}
                {(() => {
                  const list = fanLists.find((l) => l.id === selectedListId);
                  const members = list?.users || [];
                  if (members.length === 0) return <div className="text-xs text-slate-500 text-center py-6">Keine Mitglieder (oder nur eine Vorschau ohne Details verfügbar)</div>;
                  return (
                    <div className="space-y-2">
                      {members.map((u: any) => (
                        <div key={u.id} className="flex items-center gap-2.5 p-2 rounded hover:bg-[#C9A86A]/5">
                          <Avatar fanId={u.id} size={36} />
                          <span className="text-sm text-white">{displayName(u.id)}</span>
                        </div>
                      ))}
                      {(list?.usersCount || 0) > members.length && (
                        <div className="text-[10px] text-slate-500 px-2">+{(list?.usersCount || 0) - members.length} weitere (nur Vorschau, volle Mitgliederliste noch nicht angebunden)</div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {mmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setMmOpen(false)}>
          <div className="w-full max-w-4xl h-[80vh] bg-[#0A0A0A] border border-[#9C7A3D]/30 rounded-xl shadow-2xl flex overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="w-64 flex-shrink-0 border-r border-[#9C7A3D]/20 flex flex-col overflow-hidden">
              <div className="p-3 border-b border-[#9C7A3D]/20">
                <span className="text-xs font-bold uppercase tracking-wider text-[#C9A86A]">Ausschließen</span>
                <div className="text-[10px] text-slate-500 mt-0.5">Basis: alle Fans. Ausgewählte Listen werden ausgeschlossen.</div>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                {mmLists.length === 0 && <div className="p-3 text-xs text-slate-500">Keine Listen</div>}
                {mmLists.map((l: any) => (
                  <button
                    key={l.id}
                    onClick={() => toggleMmExcluded(l.id)}
                    className={`w-full text-left px-3 py-2.5 flex items-center justify-between ${mmExcluded.has(l.id) ? "bg-red-500/10 text-red-300" : "text-slate-300 hover:bg-[#C9A86A]/10"}`}
                  >
                    <span className="min-w-0">
                      <div className="text-xs font-bold truncate">{l.name}</div>
                      <div className="text-[10px] text-slate-500">{l.usersCount ?? 0} Fans</div>
                    </span>
                    {mmExcluded.has(l.id) && <CloseIcon size={12} />}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-3 border-b border-[#9C7A3D]/20 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#C9A86A]">
                  Massmessage {mmRecipientCount !== null ? `· ${mmRecipientCount} Empfänger` : ""}
                </span>
                <button onClick={() => setMmOpen(false)} className="text-slate-400 hover:text-[#E2C48A]"><CloseIcon size={16} /></button>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide p-3">
                {mmSentInfo && <div className="text-sm text-[#C9A86A] font-bold mb-3">{mmSentInfo}</div>}
                {mmError && <div className="text-sm text-red-400 mb-3">{mmError}</div>}
                {mmMedia.length > 0 && (
                  <div className="grid grid-cols-4 gap-1.5 mb-3">
                    {mmMedia.map((m: any) => (
                      <div key={m.id} className="relative">
                        {m.type === "audio" || !(m.files?.thumb?.url) ? (
                          <div className="w-full aspect-square rounded bg-[#C9A86A]/10 border border-[#9C7A3D]/20 flex items-center justify-center"><TipIcon size={16} /></div>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/crm/of-inbox/media-proxy?url=${encodeURIComponent(m.files.thumb.url)}`} className="w-full aspect-square object-cover rounded" alt="" />
                        )}
                        <button onClick={() => setMmMedia((prev) => prev.filter((x) => x.id !== m.id))} className="absolute -top-1 -right-1 bg-black/80 rounded-full text-white">
                          <CloseIcon size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  value={mmText}
                  onChange={(e) => setMmText(e.target.value)}
                  placeholder="Nachricht an alle Fans…"
                  rows={6}
                  className="w-full bg-[#050505] border border-[#9C7A3D]/30 rounded px-3 py-2 text-sm text-white outline-none focus:border-[#C9A86A] resize-none"
                />
                {mmMedia.length > 0 && (
                  <input
                    value={mmPrice}
                    onChange={(e) => setMmPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="Preis (optional, $)"
                    className="mt-2 w-40 bg-[#050505] border border-[#9C7A3D]/30 rounded px-3 py-1.5 text-sm text-white outline-none focus:border-[#C9A86A]"
                  />
                )}
              </div>
              <div className="p-3 border-t border-[#9C7A3D]/20 flex items-center justify-between">
                <button onClick={openVaultForMassmessage} className="text-slate-400 hover:text-[#E2C48A]" title="Aus dem Tresor anhängen">
                  <ImageIcon size={20} />
                </button>
                <button
                  onClick={sendMassmessage}
                  disabled={mmSending || (!mmText.trim() && mmMedia.length === 0)}
                  className="px-5 py-2 rounded-lg text-sm font-bold uppercase tracking-wider bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] text-black hover:from-[#E5C158] disabled:opacity-50"
                >
                  {mmSending ? "Sende…" : "Senden"}
                </button>
              </div>
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
