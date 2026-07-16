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
import WorkspaceSidebar from "./WorkspaceSidebar";

interface CRMInboxClientProps {
  chatterId: string;
  initialFans: Fan[];
  initialScripts: ScriptLibrary[];
  connectedModelIds: string[];
}

export default function CRMInboxClient({
  chatterId,
  initialFans,
  initialScripts,
  connectedModelIds,
}: CRMInboxClientProps) {
  // Tab Management
  const [activeTab, setActiveTab] = useState<"crm" | "onlyfans" | "scripts" | "analytics">("crm");

  // State Management
  const [selectedModel, setSelectedModel] = useState<string | null>(
    connectedModelIds.length > 0 ? connectedModelIds[0] : null
  );
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

  // When selectedModel changes: load fans for this model
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
        setSelectedFanId(null); // Reset selected fan when model changes
      } finally {
        setIsLoadingFans(false);
      }
    };

    loadFansForModel();
  }, [selectedModel, chatterId]);

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
    <div className="flex h-screen bg-[#0A0A0A] text-[#F3E5AB] overflow-hidden">
      {/* SIDEBAR */}
      <WorkspaceSidebar
        connectedModelIds={connectedModelIds}
        selectedModel={selectedModel}
        onSelectModel={(modelId) => {
          setSelectedModel(modelId);
          setSelectedFanId(null);
        }}
        currentHub="crm"
      />

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col overflow-hidden">
      {/* MODEL SELECTOR HEADER */}
      {connectedModelIds.length > 0 && (
        <div className="border-b border-[#D4AF37]/20 bg-[#050505]/50 px-6 py-3 flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
            Models:
          </span>
          {connectedModelIds.map((modelId) => (
            <button
              key={modelId}
              onClick={() => {
                setSelectedModel(modelId);
                setSelectedFanId(null);
              }}
              className={`px-4 py-2 rounded-lg font-bold uppercase tracking-wider text-xs whitespace-nowrap transition ${
                selectedModel === modelId
                  ? "bg-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/40"
                  : "bg-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37]/30"
              }`}
            >
              {modelId}
            </button>
          ))}
        </div>
      )}

      {/* TAB NAVIGATION HEADER */}
      <div className="border-b border-[#D4AF37]/10 bg-[#0A0A0A] px-4 flex items-center gap-1">
        <button
          onClick={() => setActiveTab("crm")}
          className={`px-4 py-3 text-sm font-bold uppercase tracking-wider border-b-2 transition ${
            activeTab === "crm"
              ? "border-[#D4AF37] text-[#D4AF37]"
              : "border-transparent text-slate-400 hover:text-[#F3E5AB]"
          }`}
        >
          💬 CRM
        </button>
        <button
          onClick={() => setActiveTab("onlyfans")}
          className={`px-4 py-3 text-sm font-bold uppercase tracking-wider border-b-2 transition ${
            activeTab === "onlyfans"
              ? "border-[#D4AF37] text-[#D4AF37]"
              : "border-transparent text-slate-400 hover:text-[#F3E5AB]"
          }`}
        >
          👑 OnlyFans
        </button>
        <button
          onClick={() => setActiveTab("scripts")}
          className={`px-4 py-3 text-sm font-bold uppercase tracking-wider border-b-2 transition ${
            activeTab === "scripts"
              ? "border-[#D4AF37] text-[#D4AF37]"
              : "border-transparent text-slate-400 hover:text-[#F3E5AB]"
          }`}
        >
          📜 Scripts
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          className={`px-4 py-3 text-sm font-bold uppercase tracking-wider border-b-2 transition ${
            activeTab === "analytics"
              ? "border-[#D4AF37] text-[#D4AF37]"
              : "border-transparent text-slate-400 hover:text-[#F3E5AB]"
          }`}
        >
          📊 Analytics
        </button>
      </div>

      {/* TAB CONTENT */}
      <div className="flex-1 flex overflow-hidden">
        {/* TAB 1: CRM */}
        {activeTab === "crm" && (
          <>
            {!selectedFanId ? (
              // HERO BANNER MODE
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
                
                {/* Chat List on Hero Screen */}
                {selectedModel && (
                  <div className="w-1/4 border-r border-[#D4AF37]/20 h-full overflow-hidden">
                    <ChatListColumn
                      fans={fans}
                      selectedFanId={selectedFanId}
                      onSelectFan={handleSelectFan}
                      isLoading={isLoadingFans}
                    />
                  </div>
                )}
              </div>
            ) : (
              // THREE COLUMN MODE
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
          </>
        )}

        {/* TAB 2: ONLYFANS */}
        {activeTab === "onlyfans" && (
          <div className="w-full flex flex-col items-center justify-center bg-gradient-to-br from-[#0A0A0A] to-black">
            <div className="text-center">
              <div className="text-6xl mb-4">👑</div>
              <h2 className="text-2xl font-bold mb-2 text-[#D4AF37]">OnlyFans Dashboard</h2>
              <p className="text-slate-400 mb-6">
                {selectedModel
                  ? `Dashboard for ${selectedModel} - Coming Soon`
                  : "Connect a model to access OnlyFans Dashboard"}
              </p>
              {selectedModel && (
                <div className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                  <p>🔐 Your OnlyFans account data will be displayed here</p>
                  <p className="mt-2">• Subscriber management</p>
                  <p>• Message stats & analytics</p>
                  <p>• Content calendar</p>
                  <p>• Earnings tracking</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: SCRIPTS VAULT */}
        {activeTab === "scripts" && (
          <div className="w-full flex flex-col items-center justify-center bg-gradient-to-br from-[#0A0A0A] to-black">
            <div className="text-center">
              <div className="text-6xl mb-4">📜</div>
              <h2 className="text-2xl font-bold mb-2 text-[#D4AF37]">Scripts Vault</h2>
              <p className="text-slate-400 mb-6">
                {selectedModel
                  ? `Script Library for ${selectedModel}`
                  : "Connect a model to access Scripts"}
              </p>
              {selectedModel && (
                <div className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                  <p>✏️ Your saved response templates</p>
                  <p className="mt-2">• Quick message responses</p>
                  <p>• Promotional templates</p>
                  <p>• Auto-reply scripts</p>
                  <p>• Custom shortcuts</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: ANALYTICS */}
        {activeTab === "analytics" && (
          <div className="w-full flex flex-col items-center justify-center bg-gradient-to-br from-[#0A0A0A] to-black">
            <div className="text-center">
              <div className="text-6xl mb-4">📊</div>
              <h2 className="text-2xl font-bold mb-2 text-[#D4AF37]">Analytics Hub</h2>
              <p className="text-slate-400 mb-6">
                {selectedModel
                  ? `Performance metrics for ${selectedModel}`
                  : "Connect a model to view Analytics"}
              </p>
              {selectedModel && (
                <div className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                  <p>📈 Real-time performance tracking</p>
                  <p className="mt-2">• Revenue breakdown</p>
                  <p>• Engagement metrics</p>
                  <p>• Top fans & spenders</p>
                  <p>• Growth trends</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
    </div>
  );
}
