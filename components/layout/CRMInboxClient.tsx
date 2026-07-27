"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchChatterEmojis } from "@/app/crm-inbox/actions";
import { OnlyFansViewer } from "@/components/OnlyFansViewer";
import NextShiftsWidget from "./NextShiftsWidget";
import { usePublishModelTabs } from "./ModelTabsContext";
import { isAdminTierRole } from "@/lib/roles";
import { ownerFlagKey, openOwnershipChannel, type OwnershipMessage } from "./liveSlotOwnership";

interface ConnectedModel {
  id: string;
  name: string;
  avatar_url?: string | null;
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
  // This role's explicit feature_key -> enabled rows from the Management
  // page's Rechte-Kontrollzentrum - currently only used for the OnlyFans-
  // mask-level "Model-Notizen bearbeiten" toggle, see OnlyFansViewer.
  permissions?: Record<string, boolean>;
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
  permissions = {},
}: CRMInboxClientProps) {
  const searchParams = useSearchParams();
  const modelFromUrl = searchParams.get("model");

  // CONFIRMED LIVE: falling back to the first connected model when no
  // ?model= is in the URL meant the plain "OnlyFans" sidebar link (which
  // intentionally links to /crm-inbox with no model - it should show the
  // shift-reminder landing) auto-selected a model anyway, immediately
  // opening a live VNC session nobody asked for. Only the model-specific
  // sidebar link actually carries ?model= - respect that distinction.
  const [selectedModel, setSelectedModel] = useState<string | null>(modelFromUrl);
  const [emojis, setEmojis] = useState<string[]>([]);
  // Which connected models currently have their live connection "popped
  // out" into a separate /live/<modelId> tab (see ModelTabsBar's "In neuem
  // Tab öffnen") - only one connection stays active at a time per model,
  // never both here and in the popout simultaneously.
  const [poppedOut, setPoppedOut] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const loadEmojis = async () => {
      const emojiList = await fetchChatterEmojis(chatterId);
      setEmojis(emojiList);
    };
    loadEmojis();
  }, [chatterId]);

  // Always follow the URL, including back to null - navigating from a
  // model's VNC view to the plain "OnlyFans" link (no ?model=) via
  // client-side routing must return to the landing page, not leave the
  // previous model's session showing.
  useEffect(() => {
    setSelectedModel(modelFromUrl);
  }, [modelFromUrl]);

  // Model tabs now render inside GlobalTopBar (see ModelTabsContext) instead
  // of as their own row here - this just publishes the data up.
  usePublishModelTabs(connectedModels, selectedModel, chatterId);

  // Initializes from localStorage whenever the connected-models list
  // changes (e.g. this tab was reloaded while a popout was already active
  // elsewhere for one of them - the flag from that earlier claim is still
  // there, a fresh page load would otherwise never learn about it).
  useEffect(() => {
    const initial: Record<string, boolean> = {};
    connectedModels.forEach((m) => {
      initial[m.id] = localStorage.getItem(ownerFlagKey(chatterId, m.id)) === "1";
    });
    setPoppedOut(initial);
  }, [connectedModels, chatterId]);

  // Live updates from whichever tab currently owns a given model's
  // connection - a popout claiming it switches this view to the
  // placeholder, a release (popout closed) switches it back.
  useEffect(() => {
    const channel = openOwnershipChannel(chatterId);
    if (!channel) return;
    channel.onmessage = (e: MessageEvent<OwnershipMessage>) => {
      if (e.data.type === "claim") {
        setPoppedOut((p) => ({ ...p, [e.data.modelId]: true }));
      } else if (e.data.type === "release") {
        setPoppedOut((p) => ({ ...p, [e.data.modelId]: false }));
      }
    };
    return () => channel.close();
  }, [chatterId]);

  // "Zurückholen" - reclaims immediately regardless of whether the popout
  // tab is still around to acknowledge it, so this never leaves the
  // chatter stuck looking at the placeholder.
  const reclaimModel = (modelId: string) => {
    localStorage.removeItem(ownerFlagKey(chatterId, modelId));
    setPoppedOut((p) => ({ ...p, [modelId]: false }));
    const channel = openOwnershipChannel(chatterId);
    if (channel) {
      channel.postMessage({ type: "request-release", modelId } satisfies OwnershipMessage);
      channel.close();
    }
  };

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
                isAdmin={isAdminTierRole(userRole)}
              />
            </div>
          ) : poppedOut[selectedModel] ? (
            <div className="w-full flex flex-col items-center justify-center bg-black p-8 text-center">
              <p className="text-[#C9A86A] font-black uppercase tracking-wider text-sm mb-1">
                Model ist im neuen Tab geöffnet
              </p>
              <p className="text-slate-500 text-xs mb-6">
                Die Live-Ansicht läuft gerade in einem separaten Browser-Tab.
              </p>
              <button
                onClick={() => reclaimModel(selectedModel)}
                className="px-4 py-2.5 bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] hover:to-[#BB8C21] text-black font-bold rounded-lg text-sm transition shadow-lg"
              >
                ← Zurückholen
              </button>
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
                permissions={permissions}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
