"use client";

import { useEffect, useState } from "react";
import {
  fetchActiveFans,
  fetchChatMessages,
  fetchChatterEmojis,
  fetchScriptLibrary,
  fetchFanMetadata,
  sendMessage,
  updateFanNotes,
  markMessagesAsRead,
} from "@/app/crm-inbox/actions";
import {
  Fan,
  ChatMessage,
  ScriptLibrary,
  FanMetadata,
} from "@/app/crm-inbox/types";
import ChatListColumn from "./CRMChatListColumn";
import ChatThreadColumn from "./CRMChatThreadColumn";
import SalesCockpitColumn from "./CRMSalesCockpitColumn";

interface CRMInboxClientProps {
  chatterId: string;
  initialFans: Fan[];
  initialScripts: ScriptLibrary[];
}

export default function CRMInboxClient({
  chatterId,
  initialFans,
  initialScripts,
}: CRMInboxClientProps) {
  // State Management
  const [fans, setFans] = useState<Fan[]>(initialFans);
  const [selectedFanId, setSelectedFanId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [emojis, setEmojis] = useState<string[]>([]);
  const [scripts, setScripts] = useState<ScriptLibrary[]>(initialScripts);
  const [selectedScript, setSelectedScript] = useState<ScriptLibrary | null>(
    null
  );
  const [fanMetadata, setFanMetadata] = useState<FanMetadata | null>(null);

  // UI State
  const [isLoadingFans, setIsLoadingFans] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Fetch chatter's emojis on mount
  useEffect(() => {
    const loadEmojis = async () => {
      const emojiList = await fetchChatterEmojis(chatterId);
      setEmojis(emojiList);
    };
    loadEmojis();
  }, [chatterId]);

  // When fan is selected: load messages and metadata
  useEffect(() => {
    if (!selectedFanId) {
      setMessages([]);
      setFanMetadata(null);
      return;
    }

    const loadFanData = async () => {
      setIsLoadingMessages(true);
      try {
        // Fetch messages
        const msgs = await fetchChatMessages(chatterId, selectedFanId);
        setMessages(msgs);

        // Fetch metadata
        const metadata = await fetchFanMetadata(chatterId, selectedFanId);
        setFanMetadata(metadata);

        // Mark as read
        await markMessagesAsRead(chatterId, selectedFanId);
      } finally {
        setIsLoadingMessages(false);
      }
    };

    loadFanData();
  }, [selectedFanId, chatterId]);

  // When script is selected: inject into textarea
  useEffect(() => {
    if (selectedScript) {
      setCurrentMessage(selectedScript.script_content);
    }
  }, [selectedScript]);

  // Send message handler
  const handleSendMessage = async () => {
    if (!selectedFanId || !currentMessage.trim()) return;

    setIsSending(true);
    try {
      const result = await sendMessage(
        chatterId,
        selectedFanId,
        currentMessage,
        selectedScript?.attached_media_id
      );

      if (result.success) {
        setCurrentMessage("");
        setSelectedScript(null);

        // Reload messages
        const msgs = await fetchChatMessages(chatterId, selectedFanId);
        setMessages(msgs);
      }
    } finally {
      setIsSending(false);
    }
  };

  // Update fan notes handler
  const handleUpdateNotes = async (notes: string) => {
    if (!selectedFanId) return;

    setIsSavingNotes(true);
    try {
      await updateFanNotes(chatterId, selectedFanId, notes);
      setFanMetadata((prev) => (prev ? { ...prev, notes } : null));
    } finally {
      setIsSavingNotes(false);
    }
  };

  // Select fan handler
  const handleSelectFan = (fanId: string) => {
    setSelectedFanId(fanId);
  };

  return (
    <main className="h-screen flex bg-[#0A0A0A] text-[#F3E5AB] overflow-hidden">
      {/* Hero Banner (Full Width at Top) - Always rendered, hidden via CSS */}
      <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#0A0A0A] to-black ${
        selectedFanId ? "hidden" : "z-0"
      }`}>
        <div className="text-center">
          <h1 className="text-4xl font-black bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent mb-3 uppercase tracking-wider">
            💬 CRM Live Inbox
          </h1>
          <p className="text-slate-400">
            Select a fan to start chatting and injecting sales scripts
          </p>
        </div>
      </div>

      {/* Three Column Layout */}
      <div className={`flex w-full h-screen ${selectedFanId ? "visible" : "hidden"}`}>
        {/* Column 1: Chat List (25%) */}
        <div className="w-1/4 border-r border-[#D4AF37]/20">
          <ChatListColumn
            fans={fans}
            selectedFanId={selectedFanId}
            onSelectFan={handleSelectFan}
            isLoading={isLoadingFans}
          />
        </div>

        {/* Column 2: Chat Thread (50%) */}
        <div className="w-1/2">
          <ChatThreadColumn
            messages={messages}
            currentMessage={currentMessage}
            onMessageChange={setCurrentMessage}
            onSendMessage={handleSendMessage}
            emojis={emojis}
            selectedEmoji={selectedScript ? "✓" : undefined}
            isLoading={isLoadingMessages}
            isSending={isSending}
          />
        </div>

        {/* Column 3: Sales Cockpit (25%) */}
        <div className="w-1/4 border-l border-[#D4AF37]/20">
          <SalesCockpitColumn
            fanMetadata={fanMetadata}
            scripts={scripts}
            selectedScript={selectedScript}
            onSelectScript={setSelectedScript}
            onNotesChange={handleUpdateNotes}
            isSavingNotes={isSavingNotes}
          />
        </div>
      </div>

      {/* Fallback: Show chat list even when no fan selected - Always rendered, hidden via CSS */}
      <div className={`w-1/4 border-r border-[#D4AF37]/20 relative ${
        selectedFanId ? "hidden" : "z-10"
      }`}>
        <ChatListColumn
          fans={fans}
          selectedFanId={selectedFanId}
          onSelectFan={handleSelectFan}
          isLoading={isLoadingFans}
        />
      </div>
    </main>
  );
}
