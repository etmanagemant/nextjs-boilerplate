"use client";

import { useEffect, useState } from "react";
import { fetchChatterEmojis } from "@/app/crm-inbox/actions";
import { OnlyFansViewer } from "@/components/OnlyFansViewer";

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

  useEffect(() => {
    fetchChatterEmojis(chatterId).then(setEmojis);
  }, [chatterId]);

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
