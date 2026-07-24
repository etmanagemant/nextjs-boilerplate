"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { ModelCardSkeleton } from "./CRMSkeletonLoaders";
import BrowserLoginStreamComponent from "./BrowserLoginStreamComponent";
import ModelsManagementClient from "./ModelsManagementClient";

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

interface Chatter {
  user_id: string;
  full_name: string;
  role: string;
}

interface ConnectedModel {
  id: string;
  name: string;
}

interface ManagedModel {
  id: string;
  name: string;
  platform_type: string;
  avatar_url: string | null;
}

interface CRMConnectClientProps {
  initialModels: Model[];
  initialChatters: Chatter[];
  connectedModels?: ConnectedModel[];
  managedModels: ManagedModel[];
  addModel: (formData: FormData) => Promise<void>;
  deleteModel: (formData: FormData) => Promise<void>;
  updateModelName: (formData: FormData) => Promise<void>;
  updateModelAvatar: (formData: FormData) => Promise<void>;
}

export default function CRMConnectClient({
  initialModels,
  managedModels,
  addModel,
  deleteModel,
  updateModelName,
  updateModelAvatar,
}: CRMConnectClientProps) {
  const [models, setModels] = useState<Model[]>(initialModels);
  const [sessions, setSessions] = useState<Map<string, CreatorSession>>(
    new Map()
  );
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [modelBeingConnected, setModelBeingConnected] = useState<Model | null>(null);

  const supabase = createClient();

  useEffect(() => {
    fetchSessions();
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

      {/* Models (Schichtplanung) - moved here from the Management page,
          alongside the model connection status it's most relevant next to. */}
      <section className="bg-black/40 p-6 rounded-xl border border-[#9C7A3D]/10 shadow-lg">
        <h2 className="text-sm font-bold mb-4 text-[#C9A86A] uppercase tracking-wider">Models (Schichtplanung)</h2>
        <form action={addModel} className="flex gap-3 mb-6">
          <input type="text" name="name" placeholder="Model Name" required className="flex-1 px-3 py-2 border border-[#9C7A3D]/30 rounded-md text-sm text-white bg-[#050505] focus:border-[#C9A86A] outline-none" />
          <button type="submit" className="bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] text-black px-4 py-2 rounded-md text-sm font-bold hover:from-[#E5C158] transition cursor-pointer">Model hinzufügen</button>
        </form>

        <ModelsManagementClient
          models={managedModels}
          onDeleteClick={deleteModel}
          onNameChange={updateModelName}
          onAvatarChange={updateModelAvatar}
        />
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
