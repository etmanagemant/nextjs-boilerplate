"use client";

import { useEffect, useState } from "react";
import { fetchChatterEmojis } from "@/app/crm-inbox/actions";
import { OnlyFansViewer } from "@/components/OnlyFansViewer";
import { ownerFlagKey, openOwnershipChannel, type OwnershipMessage } from "./liveSlotOwnership";

interface LiveModelClientProps {
  modelId: string;
  modelName: string;
  chatterId: string;
  userRole: string;
  permissions: Record<string, boolean>;
}

export default function LiveModelClient({
  modelId,
  modelName,
  chatterId,
  userRole,
  permissions,
}: LiveModelClientProps) {
  const [emojis, setEmojis] = useState<string[]>([]);
  const [reclaimedElsewhere, setReclaimedElsewhere] = useState(false);

  useEffect(() => {
    fetchChatterEmojis(chatterId).then(setEmojis);
  }, [chatterId]);

  // Claims ownership of this model's live connection the moment this tab
  // loads, so the main crm-inbox tab (if open) knows to release its own
  // connection instead of both streaming the same VNC slot at once. If the
  // main tab's "Zurückholen" button asks for it back, close this tab -
  // window.close() works here since it was opened via window.open() from
  // that same origin/script (see ModelTabsBar's openInNewTab).
  useEffect(() => {
    const channel = openOwnershipChannel(chatterId);
    if (!channel) return;

    localStorage.setItem(ownerFlagKey(chatterId, modelId), "1");
    channel.postMessage({ type: "claim", modelId } satisfies OwnershipMessage);

    channel.onmessage = (e: MessageEvent<OwnershipMessage>) => {
      if (e.data.type === "request-release" && e.data.modelId === modelId) {
        window.close();
        // Fallback in case this browser blocks the close() call - at least
        // stop showing the live view and free up the VNC connection.
        setReclaimedElsewhere(true);
      }
    };

    const releaseNow = () => {
      localStorage.removeItem(ownerFlagKey(chatterId, modelId));
      channel.postMessage({ type: "release", modelId } satisfies OwnershipMessage);
    };
    window.addEventListener("pagehide", releaseNow);
    return () => {
      releaseNow();
      window.removeEventListener("pagehide", releaseNow);
      channel.close();
    };
  }, [chatterId, modelId]);

  if (reclaimedElsewhere) {
    return (
      <div className="w-screen h-screen bg-black flex items-center justify-center text-center p-8">
        <p className="text-[#C9A86A] font-bold uppercase tracking-wider text-sm">
          Diese Ansicht wurde in die Webapp zurückgeholt.
          <br />
          <span className="text-slate-500 font-normal normal-case">Dieser Tab kann geschlossen werden.</span>
        </p>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-black overflow-hidden">
      <OnlyFansViewer
        modelId={modelId}
        modelName={modelName}
        isEmbedded={true}
        isModal={false}
        onClose={() => {}}
        emojis={emojis}
        onEmojisChange={setEmojis}
        chatterId={chatterId}
        userRole={userRole}
        permissions={permissions}
      />
    </div>
  );
}
