"use client";

import { useEffect, useState, useCallback } from "react";
import { FanCrmPanel } from "@/components/FanCrmPanel";

type ConnectedModel = { id: string; name: string };

const EMOJI_BAR = ["😊", "😂", "🔥", "❤️", "😍", "👏", "🎉", "😉", "😘", "🙈", "💦", "🍑", "😏", "🥵", "😈"];

type ChatListItem = {
  withUser: { id: number };
  unreadMessagesCount: number;
  lastMessage?: { text: string; createdAt: string; fromUser?: { id: number } };
};

type Message = {
  id: number;
  text: string;
  createdAt: string;
  fromUser?: { id: number };
};

type UserDetail = { name?: string; username?: string; avatar?: string | null };

// First-pass native inbox UI reading OnlyFans directly via our own signed
// API calls (see app/of-inbox/page.tsx's comment). Fan names/avatars (via
// /of-user-details), custom CRM-only nicknames (crm_fan_nicknames, purely
// local, never touches OnlyFans), and the gold spend-ring (reusing the
// same /api/crm/fan-spend-overlay + crm_fan_metadata the VNC overlay
// script already used) are wired in. NOT yet ported: dark mode toggle,
// sent-by overlay, script-vault button, PPV purchase detector, multi-
// model tab bar, new-tab/refresh chrome - still VNC-only for now.
export default function OfInboxClient({ connectedModels, isAdmin }: { connectedModels: ConnectedModel[]; isAdmin: boolean }) {
  const [modelId, setModelId] = useState(connectedModels[0]?.id || "");
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
  const [showEmoji, setShowEmoji] = useState(false);

  const loadChats = useCallback(async () => {
    if (!modelId) return;
    setChatsLoading(true);
    setChatsError("");
    try {
      const res = await fetch(`/api/crm/of-inbox/chats?modelId=${encodeURIComponent(modelId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden");
      const list: ChatListItem[] = data.data?.list || [];
      setChats(list);

      const fanIds = list.map((c) => String(c.withUser.id));
      if (fanIds.length > 0) {
        fetch(`/api/crm/of-inbox/user-details?modelId=${encodeURIComponent(modelId)}&ids=${fanIds.join(",")}`)
          .then((r) => r.json())
          .then((d) => {
            const raw = d.data;
            const arr: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.list) ? raw.list : Object.values(raw || {});
            const map: Record<string, UserDetail> = {};
            arr.forEach((u: any) => {
              if (u && u.id != null) map[String(u.id)] = { name: u.name || u.displayName, username: u.username, avatar: u.avatar || null };
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

      fetch(`/api/crm/of-inbox/nickname?modelId=${encodeURIComponent(modelId)}`)
        .then((r) => r.json())
        .then((d) => setNicknames(d.nicknames || {}))
        .catch(() => {});
    } catch (e: any) {
      setChatsError(e.message || "Fehler beim Laden der Chats");
    } finally {
      setChatsLoading(false);
    }
  }, [modelId]);

  useEffect(() => {
    setChats([]);
    setActiveFanId(null);
    setMessages([]);
    loadChats();
  }, [loadChats]);

  const loadMessages = useCallback(async (fanId: number) => {
    if (!modelId) return;
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/crm/of-inbox/messages?modelId=${encodeURIComponent(modelId)}&fanId=${fanId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden");
      const list = Array.isArray(data.data) ? data.data : data.data?.list || [];
      setMessages(list.slice().reverse());
    } catch (e: any) {
      setSendError(e.message || "Fehler beim Laden der Nachrichten");
    } finally {
      setMessagesLoading(false);
    }
  }, [modelId]);

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
    setShowEmoji(false);
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

  async function editNickname(fanId: number) {
    const current = nicknames[String(fanId)] || "";
    const next = window.prompt("Eigener Name für diesen Fan (nur im CRM sichtbar, OnlyFans bleibt unverändert):", current);
    if (next === null) return;
    setNicknames((prev) => ({ ...prev, [String(fanId)]: next.trim() }));
    try {
      await fetch("/api/crm/of-inbox/nickname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, fanId, nickname: next.trim() }),
      });
    } catch {}
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

  return (
    <main className="p-6 max-w-6xl mx-auto min-h-screen bg-[#0A0A0A] text-[#E2C48A] rounded-xl my-6 border border-[#9C7A3D]/20 shadow-2xl">
      <div className="flex items-center justify-between border-b border-[#9C7A3D]/20 pb-4 mb-6">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wider">📡 OnlyFans Inbox (API, Beta)</h1>
          <p className="text-xs text-slate-400 mt-0.5">Direkt über die OnlyFans-API, kein VNC - experimentell</p>
        </div>
        {connectedModels.length > 1 && (
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="bg-[#050505] border border-[#9C7A3D]/30 rounded px-3 py-2 text-sm text-white"
          >
            {connectedModels.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}
      </div>

      {!modelId ? (
        <div className="text-sm text-slate-400">Kein verbundenes Model gefunden.</div>
      ) : (
        <div className="flex gap-4 min-h-[500px]">
          <div className="w-[320px] flex-shrink-0 border border-[#9C7A3D]/20 rounded-xl overflow-hidden self-start">
            <div className="p-3 border-b border-[#9C7A3D]/20 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#C9A86A]">Chats</span>
              <button onClick={loadChats} className="text-xs text-slate-400 hover:text-[#E2C48A]">↻</button>
            </div>
            {chatsLoading && <div className="p-3 text-xs text-slate-500 italic">Lade…</div>}
            {chatsError && <div className="p-3 text-xs text-red-400">{chatsError}</div>}
            <div className="divide-y divide-[#9C7A3D]/10 max-h-[480px] overflow-y-auto">
              {chats.map((c) => (
                <button
                  key={c.withUser.id}
                  onClick={() => openChat(c.withUser.id)}
                  className={`w-full text-left p-3 hover:bg-black/30 transition flex items-center gap-3 ${activeFanId === c.withUser.id ? "bg-[#C9A86A]/10" : ""}`}
                >
                  <Avatar fanId={c.withUser.id} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white truncate">{displayName(c.withUser.id)}</span>
                      {c.unreadMessagesCount > 0 && (
                        <span className="text-[10px] bg-[#C9A86A] text-black font-bold px-1.5 py-0.5 rounded-full ml-1 flex-shrink-0">{c.unreadMessagesCount}</span>
                      )}
                    </div>
                    {c.lastMessage && (
                      <div
                        className="text-xs text-slate-400 mt-0.5 truncate"
                        dangerouslySetInnerHTML={{ __html: c.lastMessage.text }}
                      />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-w-0 border border-[#9C7A3D]/20 rounded-xl flex flex-col">
            {!activeFanId ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500">Chat auswählen</div>
            ) : (
              <>
                <div className="p-3 border-b border-[#9C7A3D]/20 flex items-center gap-3">
                  <Avatar fanId={activeFanId} size={32} />
                  <span className="text-sm font-bold text-white">{displayName(activeFanId)}</span>
                  <button
                    onClick={() => editNickname(activeFanId)}
                    className="text-xs text-slate-400 hover:text-[#E2C48A] ml-1"
                    title="Eigenen Namen vergeben"
                  >
                    ✏️
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {messagesLoading && <div className="text-xs text-slate-500 italic">Lade…</div>}
                  {messages.map((m) => {
                    const isOwn = String(m.fromUser?.id) !== String(activeFanId);
                    return (
                      <div key={m.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[70%] rounded-xl px-3 py-2 text-sm ${isOwn ? "bg-[#C9A86A]/20 text-white" : "bg-black/30 text-slate-200"}`}
                          dangerouslySetInnerHTML={{ __html: m.text }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="p-3 border-t border-[#9C7A3D]/20">
                  {sendError && <div className="text-xs text-red-400 mb-2">{sendError}</div>}
                  {showEmoji && (
                    <div className="flex flex-wrap gap-1 mb-2 bg-black/40 border border-[#9C7A3D]/20 rounded-lg p-2">
                      {EMOJI_BAR.map((e) => (
                        <button
                          key={e}
                          onClick={() => setDraft((d) => d + e)}
                          className="text-lg hover:scale-125 transition"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowEmoji((v) => !v)}
                      className="text-lg px-2 rounded border border-[#9C7A3D]/30 hover:bg-black/30"
                      title="Emojis"
                    >
                      😊
                    </button>
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
                      placeholder="Nachricht schreiben…"
                      className="flex-1 bg-[#050505] border border-[#9C7A3D]/30 rounded px-3 py-2 text-sm text-white outline-none focus:border-[#C9A86A]"
                    />
                    <button
                      onClick={handleSend}
                      disabled={sending || !draft.trim()}
                      className="bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] text-black font-bold px-4 py-2 rounded text-sm disabled:opacity-50"
                    >
                      {sending ? "…" : "Senden"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {activeFanId && fanMetadata && (
            <div className="w-80 flex-shrink-0 border border-[#9C7A3D]/20 rounded-xl overflow-hidden self-start max-h-[500px]">
              <FanCrmPanel
                modelId={modelId}
                fanId={String(activeFanId)}
                metadata={fanMetadata}
                lastEditedBy={fanMetaLastEditedBy}
                onSaved={() => loadFanMetadata(activeFanId)}
                isAdmin={isAdmin}
              />
            </div>
          )}
        </div>
      )}
    </main>
  );
}
