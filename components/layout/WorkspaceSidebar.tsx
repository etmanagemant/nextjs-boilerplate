"use client";

import { useState } from "react";
import Link from "next/link";

interface WorkspaceSidebarProps {
  connectedModelIds: string[];
  selectedModel?: string | null;
  onSelectModel?: (modelId: string) => void;
  currentHub?: "connection" | "scripts" | "upload" | "crm";
}

export default function WorkspaceSidebar({
  connectedModelIds,
  selectedModel,
  onSelectModel,
  currentHub = "crm",
}: WorkspaceSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const hubs = [
    { id: "connection", name: "Connection Hub", icon: "🔗", href: "/crm-connect" },
    { id: "scripts", name: "Script Vault", icon: "📜", href: "/script-vault" },
    { id: "upload", name: "Upload Vault", icon: "📤", href: "/upload-vault" },
    { id: "crm", name: "CRM Inbox", icon: "💬", href: "/crm-inbox" },
  ];

  return (
    <aside
      className={`bg-[#050505] border-r border-[#D4AF37]/20 flex flex-col transition-all duration-300 ${
        isCollapsed ? "w-20" : "w-64"
      }`}
    >
      {/* COLLAPSE BUTTON */}
      <div className="px-4 py-3 border-b border-[#D4AF37]/10 flex items-center justify-between">
        {!isCollapsed && (
          <h2 className="text-sm font-bold text-[#D4AF37] uppercase tracking-wider">
            Workspace
          </h2>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-slate-400 hover:text-[#D4AF37] transition"
          title={isCollapsed ? "Expand" : "Collapse"}
        >
          {isCollapsed ? "→" : "←"}
        </button>
      </div>

      {/* HUBS NAVIGATION */}
      <nav className="px-2 py-4 space-y-1 flex-1">
        {hubs.map((hub) => {
          const isActive = currentHub === hub.id;
          return (
            <Link
              key={hub.id}
              href={hub.href}
              className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition ${
                isActive
                  ? "bg-[#D4AF37]/20 text-[#D4AF37] border-l-2 border-[#D4AF37]"
                  : "text-slate-400 hover:text-[#F3E5AB] hover:bg-[#D4AF37]/10"
              }`}
              title={isCollapsed ? hub.name : undefined}
            >
              <span className="text-lg flex-shrink-0">{hub.icon}</span>
              {!isCollapsed && <span>{hub.name}</span>}
            </Link>
          );
        })}
      </nav>

      {/* DIVIDER */}
      <div className="px-4 my-2 border-t border-[#D4AF37]/10" />

      {/* MODELS LIST */}
      <div className="px-2 pb-4">
        {!isCollapsed && (
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest px-3 mb-2">
            Models
          </h3>
        )}

        <div className="space-y-1 max-h-64 overflow-y-auto">
          {connectedModelIds.length === 0 ? (
            <div className="text-xs text-slate-500 text-center py-4 px-3">
              {isCollapsed ? "—" : "No connected models"}
            </div>
          ) : (
            connectedModelIds.map((modelId) => (
              <button
                key={modelId}
                onClick={() => onSelectModel?.(modelId)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                  selectedModel === modelId
                    ? "bg-[#D4AF37]/20 text-[#D4AF37] border-l-2 border-[#D4AF37]"
                    : "text-slate-400 hover:text-[#F3E5AB] hover:bg-[#D4AF37]/10"
                }`}
                title={isCollapsed ? modelId : undefined}
              >
                {/* Model Avatar Placeholder */}
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#F3E5AB] flex items-center justify-center flex-shrink-0 text-black text-xs font-bold">
                  {modelId.charAt(0).toUpperCase()}
                </div>

                {!isCollapsed && (
                  <div className="flex-1 text-left truncate">
                    <div className="truncate">{modelId}</div>
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* FOOTER */}
      <div className="px-3 py-3 border-t border-[#D4AF37]/10 text-xs text-slate-500">
        {!isCollapsed && (
          <div className="text-center">
            <p>v1.0</p>
          </div>
        )}
      </div>
    </aside>
  );
}
