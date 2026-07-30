"use client";

import { useEffect, useState, useCallback } from "react";

type ConnectedModel = { id: string; name: string };

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

// First-pass native inbox UI reading OnlyFans directly via our own signed
// API calls (see app/of-inbox/page.tsx's comment) - fan names/avatars
// aren't wired up yet (the chat-list endpoint only returns fan IDs, a
// separate users/list batch call is needed for that - not built yet), so
// conversations show by numeric fan ID for now. No overlay features
// (dark mode, sent-by, script-vault button, fan-spend ring, PPV detector)
// ported over yet either - those need to become native pieces of this UI,
// not a straight port of the DOM-overlay versions built for VNC.
export default function OfInboxClient({ connectedModels }: { connectedModels: ConnectedModel[] }) {
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

  const loadChats = useCallback(async () => {
    if (!modelId) return;
    setChatsLoading(true);
    setChatsError("");
    try {
      const res = await fetch(`/api/crm/of-inbox/chats?modelId=${encodeURIComponent(modelId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden");
      setChats(data.data?.list || []);
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

  function openChat(fanId: number) {
    setActiveFanId(fanId);
    setSendError("");
    loadMessages(fanId);
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
        <div className="grid grid-cols-[280px_1fr] gap-4 min-h-[500px]">
          <div className="border border-[#9C7A3D]/20 rounded-xl overflow-hidden">
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
                  className={`w-full text-left p-3 hover:bg-black/30 transition ${activeFanId === c.withUser.id ? "bg-[#C9A86A]/10" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">Fan #{c.withUser.id}</span>
                    {c.unreadMessagesCount > 0 && (
                      <span className="text-[10px] bg-[#C9A86A] text-black font-bold px-1.5 py-0.5 rounded-full">{c.unreadMessagesCount}</span>
                    )}
                  </div>
                  {c.lastMessage && (
                    <div
                      className="text-xs text-slate-400 mt-1 truncate"
                      dangerouslySetInnerHTML={{ __html: c.lastMessage.text }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="border border-[#9C7A3D]/20 rounded-xl flex flex-col">
            {!activeFanId ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500">Chat auswählen</div>
            ) : (
              <>
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
                  <div className="flex gap-2">
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
        </div>
      )}
    </main>
  );
}
