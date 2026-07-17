"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

interface ConnectedModel {
  id: string;
  name: string;
}

interface WorkspaceSidebarProps {
  connectedModels?: ConnectedModel[];
  selectedModel?: string | null;
  onSelectModel?: (modelId: string) => void;
  onOpenOnlyFans?: (modelId: string) => void;
  currentHub?: "connection" | "scripts" | "upload" | "crm";
  userRole?: string;
}

export default function WorkspaceSidebar({
  connectedModels = [],
  selectedModel,
  onSelectModel,
  onOpenOnlyFans,
  currentHub = "crm",
  userRole = "chatter",
}: WorkspaceSidebarProps) {
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [autoFetchedModels, setAutoFetchedModels] = useState<ConnectedModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ modelId: string; x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Auto-fetch connected models (only is_active = true)
  useEffect(() => {
    const fetchConnectedModels = async () => {
      setIsLoadingModels(true);
      try {
        const supabase = createClient();

        // Fetch only CONNECTED models (is_active = true)
        const { data: sessions } = await supabase
          .from("crm_model_sessions")
          .select("model_id")
          .eq("is_active", true)
          .order("model_id", { ascending: true });

        if (sessions && sessions.length > 0) {
          const modelIds = sessions.map((s: any) => s.model_id);

          // Lookup names from models table
          const { data: modelDetails } = await supabase
            .from("models")
            .select("id, name")
            .in("id", modelIds);

          const nameMap = new Map(modelDetails?.map((m: any) => [m.id, m.name]) || []);

          const models = sessions.map((s: any) => ({
            id: s.model_id,
            name: nameMap.get(s.model_id) || s.model_id,
          }));

          setAutoFetchedModels(models);
        }
      } catch (err) {
        console.error("Error fetching connected models:", err);
      } finally {
        setIsLoadingModels(false);
      }
    };

    fetchConnectedModels();
  }, []);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [contextMenu]);

  // Use auto-fetched models as fallback if not provided
  const modelsToDisplay = connectedModels.length > 0 ? connectedModels : autoFetchedModels;

  const workspaceTools = [
    { id: "connection", name: "Connection Hub", icon: "🔗", href: "/management/crm-connect", adminOnly: true },
    { id: "scripts", name: "Script Vault", icon: "📜", href: "/script-vault" },
    { id: "upload", name: "Upload Vault", icon: "📤", href: "/upload-vault" },
  ];

  // Filter workspace tools based on role
  const tools = workspaceTools.filter(
    (tool) => !tool.adminOnly || ["admin"].includes(userRole)
  );

  const handleSelectModel = (modelId: string, modelName: string) => {
    if (onSelectModel) onSelectModel(modelId);
    router.push(`/crm-inbox?model=${modelId}`);
  };

  const handleOpenContextMenu = (modelId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ modelId, x: event.clientX, y: event.clientY });
  };

  const handleOpenNewTab = async (modelId: string) => {
    // Try to open OnlyFans in a new browser tab with the model's profile
    // First, try to get the model's OnlyFans handle from the session
    try {
      const response = await fetch(`/api/crm/model-profile?modelId=${encodeURIComponent(modelId)}`);
      const data = response.ok ? await response.json() : {};
      
      // Default to opening a new incognito/private window with OnlyFans
      const onlyFansUrl = data.onlyFansHandle 
        ? `https://onlyfans.com/${data.onlyFansHandle}`
        : "https://onlyfans.com";
      
      // Open in new tab/window
      window.open(onlyFansUrl, "_blank", "width=1200,height=800,noopener,noreferrer");
      
      console.log("[SIDEBAR] Opened OnlyFans in new tab:", onlyFansUrl);
    } catch (err) {
      console.error("[SIDEBAR] Error opening new tab:", err);
      // Fallback: just open OnlyFans.com
      window.open("https://onlyfans.com", "_blank", "width=1200,height=800,noopener,noreferrer");
    }
    setContextMenu(null);
  };

  const handleRefreshSession = async (modelId: string) => {
    // Reload onlyfans.com in the Browserless session
    try {
      const response = await fetch("/api/crm/interact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          action: "reload",
          target: "https://onlyfans.com",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("[SIDEBAR] ❌ Failed to refresh session:", errorData);
        alert("Fehler beim Neuladen der Session. Bitte versuchen Sie es später erneut.");
      } else {
        console.log("[SIDEBAR] ✅ Session refreshed");
        // Also open OnlyFans in the embedded viewer
        if (onOpenOnlyFans) {
          onOpenOnlyFans(modelId);
        }
      }
    } catch (err) {
      console.error("[SIDEBAR] Error refreshing session:", err);
      alert("Fehler beim Neuladen der Session");
    }
    setContextMenu(null);
  };

  return (
    <aside
      className={`bg-[#050505] border-r border-[#D4AF37]/20 flex flex-col transition-all duration-300 ${
        isCollapsed ? "w-20" : "w-64"
      }`}
    >
      {/* COLLAPSE BUTTON */}
      <div className="px-4 py-3 border-b border-[#D4AF37]/10 flex items-center justify-between">
        {!isCollapsed && (
          <h2 className="text-xs font-bold text-[#D4AF37] uppercase tracking-widest">
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

      {/* WORKSPACE TOOLS */}
      <nav className="px-2 py-4 space-y-1 flex-1 overflow-y-auto">
        {/* Workspace Section */}
        <div>
          {!isCollapsed && (
            <p className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
              Tools
            </p>
          )}
          {tools.map((tool) => {
            const isActive = currentHub === tool.id;
            return (
              <Link
                key={tool.id}
                href={tool.href}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition ${
                  isActive
                    ? "bg-[#D4AF37]/20 text-[#D4AF37] border-l-2 border-[#D4AF37]"
                    : "text-slate-400 hover:text-[#F3E5AB] hover:bg-[#D4AF37]/10"
                }`}
                title={isCollapsed ? tool.name : undefined}
              >
                <span className="text-lg flex-shrink-0">{tool.icon}</span>
                {!isCollapsed && <span>{tool.name}</span>}
              </Link>
            );
          })}
        </div>

        {/* Connected Models Section */}
        {modelsToDisplay.length > 0 && (
          <div className="pt-4 border-t border-[#D4AF37]/10">
            {!isCollapsed && (
              <p className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
                🟢 Models ({modelsToDisplay.length})
              </p>
            )}
            {modelsToDisplay.map((model) => {
              const isActive = selectedModel === model.id;
              return (
                <div key={model.id} className="relative">
                  <button
                    onClick={(e) => handleOpenContextMenu(model.id, e)}
                    onContextMenu={(e) => handleOpenContextMenu(model.id, e)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition group ${
                      isActive
                        ? "bg-[#D4AF37]/20 text-[#D4AF37] border-l-2 border-[#D4AF37]"
                        : "text-slate-400 hover:text-[#F3E5AB] hover:bg-[#D4AF37]/10"
                    }`}
                    title={`${model.name} - Click or right-click for options`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg flex-shrink-0">👤</span>
                      {!isCollapsed && <span className="truncate">{model.name}</span>}
                    </div>
                    {!isCollapsed && (
                      <span className="text-xs opacity-100 opacity-100 transition flex-shrink-0 cursor-pointer hover:text-[#F3E5AB]">⋮</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {isLoadingModels && (
          <div className="pt-4 border-t border-[#D4AF37]/10 px-3 py-2">
            {!isCollapsed && <p className="text-xs text-slate-500">Lade Models...</p>}
          </div>
        )}
      </nav>

      {/* FOOTER */}
      <div className="px-3 py-3 border-t border-[#D4AF37]/10 text-xs text-slate-500">
        {!isCollapsed && (
          <div className="text-center">
            <p>v1.0</p>
          </div>
        )}
      </div>

      {/* CONTEXT MENU */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-[#1A1A1A] border border-[#D4AF37]/30 rounded-lg shadow-2xl z-50 py-1"
          style={{
            left: `${Math.max(16, contextMenu.x - 120)}px`,
            top: `${Math.max(16, contextMenu.y)}px`,
            minWidth: "200px",
          }}
        >
          <button
            onClick={() => handleOpenNewTab(contextMenu.modelId)}
            className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-[#D4AF37]/20 hover:text-[#F3E5AB] transition"
          >
            🌐 Open new tab
          </button>
          <button
            onClick={() => handleRefreshSession(contextMenu.modelId)}
            className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-[#D4AF37]/20 hover:text-[#F3E5AB] transition"
          >
            🔄 Refresh session
          </button>
        </div>
      )}
    </aside>
  );
}
