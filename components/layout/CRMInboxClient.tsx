"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import WorkspaceSidebar from "./WorkspaceSidebar";
import { OnlyFansViewer } from "@/components/OnlyFansViewer";

interface ConnectedModel {
  id: string;
  name: string;
}

interface CRMInboxClientProps {
  chatterId: string;
  initialFans: Fan[];
  initialScripts: ScriptLibrary[];
  connectedModels: ConnectedModel[];
  userRole?: string;
}

export default function CRMInboxClient({
  chatterId,
  initialFans,
  initialScripts,
  connectedModels,
  userRole = "chatter",
}: CRMInboxClientProps) {
  const searchParams = useSearchParams();
  const modelFromUrl = searchParams.get("model");

  const [selectedModel, setSelectedModel] = useState<string | null>(
    modelFromUrl || (connectedModels.length > 0 ? connectedModels[0].id : null)
  );
  const [fans, setFans] = useState<Fan[]>(initialFans);
  const [selectedFanId, setSelectedFanId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [emojis, setEmojis] = useState<string[]>([]);
  const [scripts, setScripts] = useState<ScriptLibrary[]>(initialScripts);
  const [selectedScript, setSelectedScript] = useState<ScriptLibrary | null>(null);
  const [fanMetadata, setFanMetadata] = useState<FanMetadata | null>(null);
  const [isLoadingFans, setIsLoadingFans] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // OnlyFans Viewer State - which model to display in modal
  const [selectedOnlyFansModel, setSelectedOnlyFansModel] = useState<string | null>(null);

  useEffect(() => {
    const loadEmojis = async () => {
      const emojiList = await fetchChatterEmojis(chatterId);
      setEmojis(emojiList);
    };
    loadEmojis();
  }, [chatterId]);

  useEffect(() => {
    if (!selectedModel) {
      setFans([]);
      setSelectedFanId(null);
      return;
    }

    const loadFansForModel = async () => {
      setIsLoadingFans(true);
      try {
        const fanList = await fetchActiveFans(chatterId, selectedModel);
        setFans(fanList);
        setSelectedFanId(null);
      } finally {
        setIsLoadingFans(false);
      }
    };

    loadFansForModel();
  }, [selectedModel, chatterId]);

  useEffect(() => {
    if (!selectedFanId) {
      setMessages([]);
      setFanMetadata(null);
      return;
    }

    const loadFanData = async () => {
      setIsLoadingMessages(true);
      try {
        const msgs = await fetchChatMessages(chatterId, selectedFanId);
        setMessages(msgs);

        const metadata = await fetchFanMetadata(chatterId, selectedFanId);
        setFanMetadata(metadata);

        await markMessagesAsRead(chatterId, selectedFanId);
      } finally {
        setIsLoadingMessages(false);
      }
    };

    loadFanData();
  }, [selectedFanId, chatterId]);

  useEffect(() => {
    if (selectedScript) {
      setCurrentMessage(selectedScript.script_content);
    }
  }, [selectedScript]);

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

        const msgs = await fetchChatMessages(chatterId, selectedFanId);
        setMessages(msgs);
      }
    } finally {
      setIsSending(false);
    }
  };

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

  const handleSelectFan = (fanId: string) => {
    setSelectedFanId(fanId);
  };

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-[#F3E5AB] overflow-hidden">
      {/* SIDEBAR */}
      <WorkspaceSidebar
        connectedModels={connectedModels}
        selectedModel={selectedModel}
        onSelectModel={(modelId) => {
          setSelectedModel(modelId);
          setSelectedFanId(null);
        }}
        currentHub="crm"
        userRole={userRole}
      />

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* MODEL SELECTOR HEADER */}
        {connectedModels.length > 0 && (
          <div className="border-b border-[#D4AF37]/20 bg-[#050505]/50 px-6 py-3 flex items-center gap-3 overflow-x-auto">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
              Models:
            </span>
            {connectedModels.map((model) => (
              <div key={model.id} className="relative group">
                {/* Left Click = Select Model for CRM */}
                <button
                  onClick={() => {
                    setSelectedModel(model.id);
                    setSelectedFanId(null);
                  }}
                  onContextMenu={(e) => {
                    // Right Click = Open in new browser tab
                    e.preventDefault();
                    window.open(`https://onlyfans.com/${model.id}`, "_blank");
                  }}
                  className={`px-4 py-2 rounded-lg font-bold uppercase tracking-wider text-xs whitespace-nowrap transition ${
                    selectedModel === model.id
                      ? "bg-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/40"
                      : "bg-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37]/30"
                  }`}
                >
                  {model.name}
                </button>

                {/* 3-Dots Menu - shows on hover */}
                <div className="absolute right-0 top-full mt-1 hidden group-hover:block bg-gray-800 border border-purple-600 rounded shadow-lg z-50 whitespace-nowrap">
                  <button
                    onClick={() => {
                      setSelectedOnlyFansModel(model.id);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-white hover:bg-purple-600 rounded-t transition"
                  >
                    📺 View in Canvas
                  </button>
                  <button
                    onClick={() => {
                      window.open(`https://onlyfans.com/${model.id}`, "_blank");
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-white hover:bg-blue-600 rounded-b transition"
                  >
                    ↗️ Open in New Tab
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 flex overflow-hidden">
          {!selectedFanId ? (
            // HERO BANNER MODE (no chat selected)
            <div className="w-full flex flex-col items-center justify-center bg-gradient-to-br from-[#0A0A0A] to-black">
              <div className="text-center mb-8">
                <h1 className="text-4xl font-black mb-3 uppercase tracking-wider">
                  <span>💬</span> <span className="bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent">CRM Live Inbox</span>
                </h1>
                <p className="text-slate-400">
                  {selectedModel
                    ? `Select a fan/chat for ${selectedModel} to start messaging`
                    : "Connect a model first to view chats"}
                </p>
              </div>
            </div>
          ) : (
            // 3-COLUMN MODE (fan selected)
            <>
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
            </>
          )}
        </div>
      </main>

      {/* OnlyFans Viewer Modal - floating over everything */}
      {selectedOnlyFansModel && (
        <OnlyFansViewer
          modelId={selectedOnlyFansModel}
          modelName={connectedModels.find((m) => m.id === selectedOnlyFansModel)?.name || "OnlyFans"}
          isModal={true}
          onClose={() => setSelectedOnlyFansModel(null)}
        />
      )}
    </div>
  );
}
