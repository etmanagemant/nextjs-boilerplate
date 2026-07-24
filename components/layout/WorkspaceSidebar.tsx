"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

interface ConnectedModel {
  id: string;
  name: string;
  avatar_url?: string | null;
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

          // Lookup names + avatars from models table
          const { data: modelDetails } = await supabase
            .from("models")
            .select("id, name, avatar_url")
            .in("id", modelIds);

          const nameMap = new Map(modelDetails?.map((m: any) => [m.id, m.name]) || []);
          const avatarMap = new Map(modelDetails?.map((m: any) => [m.id, m.avatar_url]) || []);

          const models = sessions.map((s: any) => ({
            id: s.model_id,
            name: nameMap.get(s.model_id) || s.model_id,
            avatar_url: avatarMap.get(s.model_id) || null,
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
    { id: "scripts", name: "Script Vault", icon: "📜", href: "/script-vault", adminOnly: true },
    { id: "upload", name: "Upload Vault", icon: "📤", href: "/upload-vault", adminOnly: true },
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
      className={`bg-[#050505] border-r border-[#C9A86A]/20 flex flex-col transition-all duration-300 ${
        isCollapsed ? "w-20" : "w-64"
      }`}
    >
      {/* COLLAPSE BUTTON */}
      <div className="px-4 py-3 border-b border-[#C9A86A]/10 flex items-center justify-between">
        {!isCollapsed && (
          <h2 className="text-xs font-bold text-[#C9A86A] uppercase tracking-widest">
            Workspace
          </h2>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-slate-400 hover:text-[#C9A86A] transition"
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
                    ? "bg-[#C9A86A]/20 text-[#C9A86A] border-l-2 border-[#C9A86A]"
                    : "text-slate-400 hover:text-[#E2C48A] hover:bg-[#C9A86A]/10"
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
          <div className="pt-4 border-t border-[#C9A86A]/10">
            {!isCollapsed && (
              <p className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
                🟢 Models ({modelsToDisplay.length})
              </p>
            )}
            {modelsToDisplay.map((model) => {
              const isActive = selectedModel === model.id;
              return (
                <div key={model.id} className="relative group">
                  <button
                    onClick={(e) => {
                      // LEFT-CLICK: Select model based on context
                      e.preventDefault();
                      e.stopPropagation();
                      
                      // On CRM-Inbox: Open OnlyFans viewer
                      if (onOpenOnlyFans) {
                        onOpenOnlyFans(model.id);
                        console.log(`[SIDEBAR] Left-click: Opening OnlyFans for ${model.id}`);
                      }
                      // On other pages (Script Vault, Upload Vault, CRM-Connect): Select model
                      else if (onSelectModel) {
                        onSelectModel(model.id);
                        console.log(`[SIDEBAR] Left-click: Selecting model ${model.id}`);
                      }
                    }}
                    onContextMenu={(e) => {
                      // RIGHT-CLICK: Context Menu (Open new tab | Refresh session)
                      handleOpenContextMenu(model.id, e);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition cursor-pointer ${
                      isActive
                        ? "bg-[#C9A86A]/20 text-[#C9A86A] border-l-2 border-[#C9A86A]"
                        : "text-slate-400 hover:text-[#E2C48A] hover:bg-[#C9A86A]/10"
                    }`}
                    title={`${model.name} - Left-click: Select / Open | Right-click: Menu`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {model.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={model.avatar_url}
                          alt={model.name}
                          className="w-6 h-6 rounded-full object-cover border border-[#C9A86A]/40 flex-shrink-0"
                        />
                      ) : (
                        <span className="text-lg flex-shrink-0">👤</span>
                      )}
                      {!isCollapsed && <span className="truncate">{model.name}</span>}
                    </div>
                  </button>
                  
                  {/* 3-DOTS BUTTON - SEPARATE */}
                  {!isCollapsed && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleOpenContextMenu(model.id, e);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs opacity-0 group-hover:opacity-100 transition flex-shrink-0 cursor-pointer hover:text-[#E2C48A] text-slate-400 p-1"
                      title="Menu options"
                    >
                      ⋮
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {isLoadingModels && (
          <div className="pt-4 border-t border-[#C9A86A]/10 px-3 py-2">
            {!isCollapsed && <p className="text-xs text-slate-500">Lade Models...</p>}
          </div>
        )}
      </nav>

      {/* FOOTER */}
      <div className="px-3 py-3 border-t border-[#C9A86A]/10 text-xs text-slate-500">
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
          className="fixed bg-[#1A1A1A] border border-[#C9A86A]/30 rounded-lg shadow-2xl z-50 py-1"
          style={{
            left: `${Math.max(16, contextMenu.x - 120)}px`,
            top: `${Math.max(16, contextMenu.y)}px`,
            minWidth: "200px",
          }}
        >
          <button
            onClick={() => handleOpenNewTab(contextMenu.modelId)}
            className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-[#C9A86A]/20 hover:text-[#E2C48A] transition"
          >
            🌐 Open new tab
          </button>
          <button
            onClick={() => handleRefreshSession(contextMenu.modelId)}
            className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-[#C9A86A]/20 hover:text-[#E2C48A] transition"
          >
            🔄 Refresh session
          </button>
        </div>
      )}
    </aside>
  );
}
