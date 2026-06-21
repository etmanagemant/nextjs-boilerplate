"use client";

import { useState } from "react";

function ChattersAdmin() {
  return (
    <div className="rounded border border-white/10 p-4">
      <h2 className="text-lg font-semibold">Chatter Management</h2>
      <p className="text-sm text-white/70">
        Manage chatter settings and access here.
      </p>
    </div>
  );
}

function ModelsAdmin() {
  return (
    <div className="rounded border border-white/10 p-4">
      <h2 className="text-lg font-semibold">Models Management</h2>
      <p className="text-sm text-white/70">
        Manage model settings and configurations here.
      </p>
    </div>
  );
}

export default function ManagementClient() {
  const [tab, setTab] = useState<"chatters" | "models">("chatters");

  return (
    <div className="p-6 text-white space-y-4">
      <div className="flex gap-2">
        <button
          className="px-3 py-2 rounded bg-white/10"
          onClick={() => setTab("chatters")}
        >
          Chatter Management
        </button>
        <button
          className="px-3 py-2 rounded bg-white/10"
          onClick={() => setTab("models")}
        >
          Models Management
        </button>
      </div>

      {tab === "chatters" ? <ChattersAdmin /> : <ModelsAdmin />}
    </div>
  );
}