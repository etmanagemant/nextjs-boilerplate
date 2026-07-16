"use client";

import { useState } from "react";
import Link from "next/link";

interface WorkspaceSidebarProps {
  connectedModelIds: string[];
  selectedModel?: string | null;
  onSelectModel?: (modelId: string) => void;
  currentHub?: "connection" | "scripts" | "upload" | "crm";
  userRole?: string;
}

export default function WorkspaceSidebar({
  connectedModelIds,
  selectedModel,
  onSelectModel,
  currentHub = "crm",
  userRole = "chatter",
}: WorkspaceSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const allHubs = [
    { id: "connection", name: "Connection Hub", icon: "🔗", href: "/management/crm-connect", adminOnly: true },
    { id: "scripts", name: "Script Vault", icon: "📜", href: "/script-vault" },
    { id: "upload", name: "Upload Vault", icon: "📤", href: "/upload-vault" },
    { id: "crm", name: "CRM Inbox", icon: "💬", href: "/crm-inbox" },
  ];

  // Filter hubs based on role
  const hubs = allHubs.filter(
    (hub) => !hub.adminOnly || ["admin"].includes(userRole)
  );

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
