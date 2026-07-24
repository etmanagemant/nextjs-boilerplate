"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import WorkspaceSidebar from "./WorkspaceSidebar";
import { ModelCardSkeleton, ScriptLibrarySkeleton } from "./CRMSkeletonLoaders";
import ScriptLibraryManager from "./ScriptLibraryManager";
import BrowserLoginStreamComponent from "./BrowserLoginStreamComponent";

interface Model {
  id: string;
  name: string;
  platform_type: string;
}

interface CreatorSession {
  id: string;
  model_id: string;
  is_active: boolean;
  last_verified_at: string;
  created_at: string;
}

interface Script {
  id: string;
  title: string;
  script_content: string;
  category: "greeting" | "offer" | "follow_up" | "custom";
  is_global: boolean;
  assigned_to_user: string | null;
}

interface Chatter {
  user_id: string;
  full_name: string;
  role: string;
}

interface ConnectedModel {
  id: string;
  name: string;
}

interface CRMConnectClientProps {
  initialModels: Model[];
  initialChatters: Chatter[];
  connectedModels?: ConnectedModel[];
}

export default function CRMConnectClient({
  initialModels,
  initialChatters,
  connectedModels = [],
}: CRMConnectClientProps) {
  const router = useRouter();
  const [models, setModels] = useState<Model[]>(initialModels);
  const [sessions, setSessions] = useState<Map<string, CreatorSession>>(
    new Map()
  );
  const [scripts, setScripts] = useState<Script[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isLoadingScripts, setIsLoadingScripts] = useState(true);
  const [modelBeingConnected, setModelBeingConnected] = useState<Model | null>(null);

  const supabase = createClient();

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions();
    fetchScripts();
  }, []);

  const fetchSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const { data } = await supabase
        .from("crm_model_sessions")
        .select("*")
        .eq("is_active", true);

      const sessionsMap = new Map<string, CreatorSession>();
      if (data) {
        data.forEach((session) => {
          sessionsMap.set(session.model_id, session);
        });
      }
      setSessions(sessionsMap);
    } catch (err) {
      console.error("Error fetching sessions:", err);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const fetchScripts = async () => {
    setIsLoadingScripts(true);
    try {
      const { data } = await supabase
        .from("crm_script_library")
        .select("*")
        .order("created_at", { ascending: false });

      setScripts(data || []);
    } catch (err) {
      console.error("Error fetching scripts:", err);
    } finally {
      setIsLoadingScripts(false);
    }
  };

  const handleDisconnectSession = async (modelId: string) => {
    try {
      const response = await fetch("/api/crm/browser-login/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Disconnect failed");
      }

      // Refresh sessions after disconnect
      fetchSessions();
    } catch (err) {
      console.error("Disconnect error:", err);
    }
  };

  const handleOpenBrowserLogin = (model: Model) => {
    setModelBeingConnected(model);
  };

  const handleCloseBrowserLogin = () => {
    setModelBeingConnected(null);
  };

  const handleBrowserConnectionSuccess = () => {
    fetchSessions();
    handleCloseBrowserLogin();
  };

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-[#E2C48A]">
      <WorkspaceSidebar
        connectedModels={connectedModels}
        selectedModel={null}
        onSelectModel={(modelId) => router.push(`/crm-inbox?model=${modelId}`)}
        currentHub="connection"
        userRole="admin"
      />
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto min-h-screen">
      {/* Hero Section */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-6 pb-6 border-b border-[#9C7A3D]/20 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-wider flex items-center gap-2">
              <span>🔗</span> 
              <span className="bg-gradient-to-r from-[#E2C48A] to-[#C9A86A] bg-clip-text text-transparent">Creator Connection Hub</span>
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              Manage OnlyFans model sessions and configure communication
              templates
            </p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-black text-[#C9A86A]">
              {models.length}
            </div>
            <p className="text-xs text-slate-400 uppercase tracking-widest">
              Total Creators
            </p>
          </div>
        </div>
      </div>

      {/* Creator Overview Grid */}
      <section className="mb-12">
        <div className="mb-6 pb-4 border-b border-[#9C7A3D]/20">
          <h2 className="text-xl font-bold text-[#C9A86A] uppercase tracking-wider">
            👥 Creator Connection Grid
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            View connection status and manage individual creator sessions
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoadingSessions
            ? Array(3)
                .fill(0)
                .map((_, i) => <ModelCardSkeleton key={i} />)
            : models.map((model) => {
                const session = sessions.get(model.id);
                const isConnected = session && session.is_active;

                return (
                  <div
                    key={model.id}
                    className="bg-black/40 p-6 rounded-xl border border-[#9C7A3D]/10 hover:border-[#C9A86A]/30 transition hover:shadow-lg hover:shadow-[#C9A86A]/20 group"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-[#E2C48A] group-hover:text-[#C9A86A] transition">
                          {model.name}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                          {model.platform_type || "onlyfans"} •{" "}
                          {session
                            ? `Connected ${new Date(session.created_at).toLocaleDateString()}`
                            : "Never connected"}
                        </p>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="mb-4">
                      {isConnected ? (
                        <div className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 rounded-full text-xs font-bold uppercase tracking-wider">
                          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                          🟢 Connected
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2 px-3 py-2 bg-red-500/20 text-red-300 border border-red-500/50 rounded-full text-xs font-bold uppercase tracking-wider">
                          <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                          🔴 Disconnected
                        </div>
                      )}
                    </div>

                    {/* Last Verified */}
                    {isConnected && session.last_verified_at && (
                      <p className="text-xs text-slate-500 mb-4">
                        Last verified:{" "}
                        <span className="text-slate-300">
                          {new Date(session.last_verified_at).toLocaleString()}
                        </span>
                      </p>
                    )}

                    {/* Action Buttons */}
                    <div className="space-y-2">
                      {isConnected ? (
                        <button
                          onClick={() => handleDisconnectSession(model.id)}
                          className="w-full py-2 px-4 rounded-lg font-bold uppercase tracking-wider text-xs transition bg-red-600/40 text-red-300 hover:bg-red-600/60 hover:shadow-lg hover:shadow-red-600/40"
                        >
                          <span>🔴</span> Disconnect
                        </button>
                      ) : (
                        <button
                          onClick={() => handleOpenBrowserLogin(model)}
                          className="w-full py-2 px-4 rounded-lg font-bold uppercase tracking-wider text-xs transition bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] text-black hover:shadow-lg hover:shadow-[#C9A86A]/40"
                        >
                          <span>🌐</span> Model verbinden
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
        </div>
      </section>

      {/* Script Library & Chatter Config Section */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Script Library */}
        <div className="lg:col-span-2 bg-black/40 p-6 rounded-xl border border-[#9C7A3D]/10">
          {isLoadingScripts ? (
            <ScriptLibrarySkeleton />
          ) : (
            <ScriptLibraryManager
              globalScripts={scripts.filter((s) => s.is_global)}
              teamChatters={initialChatters}
              onRefresh={fetchScripts}
            />
          )}
        </div>

        {/* Chatter Configuration Quick Panel */}
        <div className="bg-black/40 p-6 rounded-xl border border-[#9C7A3D]/10">
          <h3 className="text-lg font-bold text-[#C9A86A] uppercase tracking-wider mb-4">
            👥 Team Configuration
          </h3>

          <div className="space-y-3">
            <div className="bg-black/60 p-4 rounded-lg border border-[#9C7A3D]/10">
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-2">
                Active Chatters
              </p>
              <div className="space-y-2">
                {initialChatters.filter((c) => c.role === "chatter").length >
                0 ? (
                  initialChatters
                    .filter((c) => c.role === "chatter")
                    .map((chatter) => (
                      <div
                        key={chatter.user_id}
                        className="text-sm text-[#E2C48A] flex items-center gap-2"
                      >
                        <span className="w-2 h-2 bg-[#C9A86A] rounded-full"></span>
                        {chatter.full_name}
                      </div>
                    ))
                ) : (
                  <p className="text-xs text-slate-500">No chatters assigned</p>
                )}
              </div>
            </div>

            <div className="bg-black/60 p-4 rounded-lg border border-[#9C7A3D]/10">
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-2">
                Active Moderators
              </p>
              <div className="space-y-2">
                {initialChatters.filter((c) => c.role === "moderator").length >
                0 ? (
                  initialChatters
                    .filter((c) => c.role === "moderator")
                    .map((mod) => (
                      <div
                        key={mod.user_id}
                        className="text-sm text-[#E2C48A] flex items-center gap-2"
                      >
                        <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                        {mod.full_name}
                      </div>
                    ))
                ) : (
                  <p className="text-xs text-slate-500">No moderators assigned</p>
                )}
              </div>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mt-4">
              <p className="text-xs text-blue-200">
                <span className="font-bold">💡 Tip:</span> Configure emoji
                leisten and script templates for each team member via the admin
                settings.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Live Browser Login */}
      {modelBeingConnected && (
        <BrowserLoginStreamComponent
          modelId={modelBeingConnected.id}
          modelName={modelBeingConnected.name}
          onSuccess={handleBrowserConnectionSuccess}
          onClose={handleCloseBrowserLogin}
        />
      )}
        </div>
      </main>
    </div>
  );
}
