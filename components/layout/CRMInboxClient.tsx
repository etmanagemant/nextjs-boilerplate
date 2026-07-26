"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchChatterEmojis } from "@/app/crm-inbox/actions";
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
  connectedModels: ConnectedModel[];
  userRole?: string;
  allShifts?: Shift[];
  userEmail?: string;
  userId?: string;
}

// Live-Ansicht (VNC-Spiegelung des echten OnlyFans-Fensters) ist der einzige
// Modus - die eigene, aus synchronisierten Daten gebaute Chat-Oberfläche
// (Native Chat Mode) wurde entfernt, nachdem sich der dafür nötige
// automatische Daten-Sync live als Ursache für wiederholte Session-Abstürze
// bestätigt hat (die Session starb reproduzierbar sobald der Sync seine
// echten OnlyFans-API-Anfragen ausführte, unabhängig vom Timing seit Login).
// Die Live-Ansicht selbst braucht diesen Sync nicht und lief in denselben
// Tests über 8 Minuten am Stück stabil.
export default function CRMInboxClient({
  chatterId,
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
  const [emojis, setEmojis] = useState<string[]>([]);

  useEffect(() => {
    const loadEmojis = async () => {
      const emojiList = await fetchChatterEmojis(chatterId);
      setEmojis(emojiList);
    };
    loadEmojis();
  }, [chatterId]);

  useEffect(() => {
    if (modelFromUrl) {
      setSelectedModel(modelFromUrl);
    }
  }, [modelFromUrl]);

  return (
    // Not h-screen (100vh) - this renders inside <main>'s pt-32 (the top
    // bar's reserved space), so 100vh here would be 8rem taller than
    // what's actually left in the viewport, forcing the whole page to
    // scroll just to reach the bottom of the OnlyFans view.
    <div className="flex h-[calc(100vh-8rem)] bg-[#0A0A0A] text-[#E2C48A] overflow-hidden">
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          {!selectedModel ? (
            <div className="w-full flex flex-col items-center justify-center bg-gradient-to-br from-[#0A0A0A] to-black p-8">
              <div className="text-center mb-8">
                <h1 className="text-4xl font-black mb-3 uppercase tracking-wider">
                  <span>💬</span> <span className="bg-gradient-to-r from-[#E2C48A] to-[#C9A86A] bg-clip-text text-transparent">CRM Live Inbox</span>
                </h1>
                <p className="text-slate-400">Wähle ein Model aus der Sidebar aus</p>
              </div>
              <NextShiftsWidget
                allShifts={allShifts}
                userEmail={userEmail}
                userId={userId}
                userFullName={undefined}
                isAdmin={userRole === "admin"}
              />
            </div>
          ) : (
            <div className="flex-1 min-w-0 overflow-hidden bg-black">
              <OnlyFansViewer
                modelId={selectedModel}
                modelName={connectedModels.find((m) => m.id === selectedModel)?.name || "OnlyFans"}
                isEmbedded={true}
                isModal={false}
                onClose={() => setSelectedModel(null)}
                emojis={emojis}
                onEmojisChange={setEmojis}
                chatterId={chatterId}
                userRole={userRole}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
