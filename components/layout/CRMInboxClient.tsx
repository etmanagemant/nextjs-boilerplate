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
import NextShiftsWidget from "./NextShiftsWidget";

interface ConnectedModel {
  id: string;
  name: string;
}

interface Shift {
  id: number;
  shift_date: string;
  notes: string;
}

interface CRMInboxClientProps {
  chatterId: string;
  initialFans: Fan[];
  initialScripts: ScriptLibrary[];
  connectedModels: ConnectedModel[];
  userRole?: string;
  allShifts?: Shift[];
  userEmail?: string;
  userId?: string;
}

export default function CRMInboxClient({
  chatterId,
  initialFans,
  initialScripts,
  connectedModels,
  userRole = "chatter",
  allShifts = [],
  userEmail = "",
  userId = "",
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

  // OnlyFans Viewer - integrated as 4th column
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
        onOpenOnlyFans={(modelId) => {
          setSelectedOnlyFansModel(modelId);
        }}
      />

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* MAIN CONTENT AREA - Flex Layout */}
        <div className="flex-1 flex overflow-hidden">
          {!selectedModel ? (
            // NO MODEL SELECTED - Show placeholder
            <div className="w-full flex flex-col items-center justify-center bg-gradient-to-br from-[#0A0A0A] to-black">
              <div className="text-center mb-8">
                <h1 className="text-4xl font-black mb-3 uppercase tracking-wider">
                  <span>💬</span> <span className="bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent">CRM Live Inbox</span>
                </h1>
                <p className="text-slate-400">Wähle ein Model aus der Sidebar aus</p>
              </div>
            </div>
          ) : !selectedFanId && !selectedOnlyFansModel ? (
            // DEFAULT LANDING - Show NextShiftsWidget with reminder + instructions
            <div className="w-full flex flex-col items-center justify-center bg-gradient-to-br from-[#0A0A0A] to-black p-8">
              <NextShiftsWidget 
                allShifts={allShifts}
                userEmail={userEmail}
                userId={userId}
                userFullName={undefined}
              />
            </div>
          ) : (
            // CHAT MODE - chat list / thread / sales cockpit stay visible at all
            // times (smiley bar, script library, etc.) - OnlyFans live view is
            // an additional column, never a replacement for them. Use the
            // viewer's own "Vollbild" button for a fully immersive OF view.
            <>
              {/* Column 1: Chat List */}
              <div className={`${selectedOnlyFansModel ? 'w-1/5' : 'w-1/4'} border-r border-[#D4AF37]/20 transition-all duration-200`}>
                <ChatListColumn
                  fans={fans}
                  selectedFanId={selectedFanId}
                  onSelectFan={handleSelectFan}
                  isLoading={isLoadingFans}
                />
              </div>

              {/* Column 2: Chat Thread (or a hint while no fan is selected yet) */}
              <div className={`${selectedOnlyFansModel ? 'w-2/5' : 'w-1/2'} transition-all duration-200`}>
                {selectedFanId ? (
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
                ) : (
                  <div className="h-full flex flex-col items-center justify-center bg-[#0A0A0A] border-r border-[#D4AF37]/20 p-6 text-center">
                    <p className="text-slate-400 text-sm">Wähle links einen Fan aus, um den Chat zu öffnen.</p>
                  </div>
                )}
              </div>

              {/* Column 3: Sales Cockpit */}
              <div className={`${selectedOnlyFansModel ? 'w-1/5' : 'w-1/4'} border-l border-[#D4AF37]/20 transition-all duration-200`}>
                <SalesCockpitColumn
                  fanMetadata={fanMetadata}
                  scripts={scripts}
                  selectedScript={selectedScript}
                  onSelectScript={setSelectedScript}
                  onNotesChange={handleUpdateNotes}
                  isSavingNotes={isSavingNotes}
                />
              </div>

              {/* Column 4: OnlyFans (only when selected) */}
              {selectedOnlyFansModel && (
                <div className="w-1/5 border-l border-[#D4AF37]/20 overflow-hidden bg-black transition-all duration-200">
                  <OnlyFansViewer
                    modelId={selectedOnlyFansModel}
                    modelName={connectedModels.find((m) => m.id === selectedOnlyFansModel)?.name || "OnlyFans"}
                    isEmbedded={true}
                    isModal={false}
                    onClose={() => setSelectedOnlyFansModel(null)}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
