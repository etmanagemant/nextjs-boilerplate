"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { ModelCardSkeleton } from "./CRMSkeletonLoaders";
import BrowserLoginStreamComponent from "./BrowserLoginStreamComponent";
import RoleSelect from "./RoleSelect";

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

interface StaffProfile {
  user_id: string;
  role: string;
  email: string | null;
  full_name: string | null;
  provision_rate: number | null;
  hourly_rate: number | null;
}

interface CRMConnectClientProps {
  initialModels: Model[];
  initialChatters: Chatter[];
  connectedModels?: ConnectedModel[];
  staffProfiles: StaffProfile[];
  updateMitarbeiterRolle: (formData: FormData) => Promise<void>;
  updateMitarbeiterName: (formData: FormData) => Promise<void>;
  updateMitarbeiterCompensation: (formData: FormData) => Promise<void>;
  deleteMitarbeiter: (formData: FormData) => Promise<void>;
}

export default function CRMConnectClient({
  initialModels,
  staffProfiles,
  updateMitarbeiterRolle,
  updateMitarbeiterName,
  updateMitarbeiterCompensation,
  deleteMitarbeiter,
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

      {/* Mitarbeiter & Rollen modifizieren - moved here from the Management
          page so staff/role changes live alongside the model connections
          they affect. */}
      <section className="bg-black/40 p-6 rounded-xl border border-[#9C7A3D]/10 shadow-lg">
        <h2 className="text-sm font-bold mb-4 text-[#C9A86A] uppercase tracking-wider">Mitarbeiter & Rollen modifizieren</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#9C7A3D]/10 bg-[#050505] text-[#C9A86A] font-semibold text-xs uppercase tracking-wider">
                <th className="p-3">Name</th>
                <th className="p-3">E-Mail</th>
                <th className="p-3 w-[140px]">Provision %</th>
                <th className="p-3 w-[150px]">Rolle ändern</th>
                <th className="p-3 w-[80px] text-center">Löschen</th>
              </tr>
            </thead>
            <tbody>
              {staffProfiles.map((p) => (
                <tr key={p.user_id} className="border-b border-[#9C7A3D]/5 hover:bg-black/20 transition">
                  <td className="p-3">
                    <form action={updateMitarbeiterName} className="flex gap-2">
                      <input type="hidden" name="user_id" value={p.user_id} />
                      <input type="text" name="full_name" defaultValue={p.full_name || ""} required className="bg-[#050505] border border-[#9C7A3D]/30 rounded px-2 py-1 text-sm text-white focus:border-[#C9A86A] outline-none w-full max-w-[140px]" />
                      <button type="submit" className="text-[11px] bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] text-black px-2 py-1 rounded font-bold hover:from-[#E5C158] transition cursor-pointer">OK</button>
                    </form>
                  </td>
                  <td className="p-3 text-slate-400 font-mono text-xs">{p.email || "keine E-Mail"}</td>

                  <td className="p-3">
                    {p.email !== "etmanagement@gmail.com" && p.email !== "etmanagemant@gmail.com" && p.user_id !== "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ? (
                      <form action={updateMitarbeiterCompensation} className="flex gap-1.5 items-center flex-wrap">
                        <input type="hidden" name="user_id" value={p.user_id} />
                        <input type="hidden" name="role" value={p.role} />
                        {p.role === "moderator" ? (
                          <>
                            <input type="number" step="0.01" name="hourly_rate" defaultValue={p.hourly_rate || 0} placeholder="EUR/h" className="w-20 bg-[#050505] border border-[#9C7A3D]/30 text-white rounded p-1 text-xs text-center outline-none focus:border-[#C9A86A]" />
                            <span className="text-[10px] text-slate-500">EUR/h</span>
                          </>
                        ) : (
                          <>
                            <input type="number" step="0.1" name="provision_rate" defaultValue={p.provision_rate || 20} placeholder="20" className="w-14 bg-[#050505] border border-[#9C7A3D]/30 text-white rounded p-1 text-xs text-center outline-none focus:border-[#C9A86A]" />
                            <span className="text-[10px] text-slate-500">%</span>
                          </>
                        )}
                        <button type="submit" className="text-[10px] bg-emerald-600 text-white font-bold px-1.5 py-1 rounded hover:bg-emerald-700 transition cursor-pointer">✓</button>
                      </form>
                    ) : (
                      <span className="text-xs text-slate-500 font-mono">Admin</span>
                    )}
                  </td>

                  <td className="p-3">
                    <RoleSelect userId={p.user_id} defaultRole={p.role} onUpdateAction={updateMitarbeiterRolle} />
                  </td>
                  <td className="p-3 text-center">
                    {p.email !== "etmanagement@gmail.com" && p.email !== "etmanagemant@gmail.com" && p.user_id !== "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ? (
                      <form action={deleteMitarbeiter}>
                        <input type="hidden" name="user_id" value={p.user_id} />
                        <button type="submit" className="text-red-400 hover:text-red-300 text-sm font-bold transition cursor-pointer">Löschen</button>
                      </form>
                    ) : (
                      <span className="text-xs text-slate-500">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
