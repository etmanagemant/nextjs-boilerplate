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
  owner_user_id: string | null;
}

interface ModelLoginUser {
  user_id: string;
  full_name: string | null;
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
  modelLoginUsers: ModelLoginUser[];
  addModel: (formData: FormData) => Promise<void>;
  deleteModel: (formData: FormData) => Promise<void>;
  updateModelName: (formData: FormData) => Promise<void>;
  updateModelAvatar: (formData: FormData) => Promise<void>;
}

export default function CRMConnectClient({
  initialModels,
  managedModels,
  modelLoginUsers,
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
  const [savingOwnerFor, setSavingOwnerFor] = useState<string | null>(null);

  // Vault-Preis: previously a live-editable field on the Upload Vault page
  // itself, right next to the file queue - explicitly moved here per the
  // user's request, so the day-to-day upload flow has no price field to
  // touch at all. Set once per model, applied automatically to every
  // upload from here on (Upload Vault and the model role's own upload).
  const [vaultPrices, setVaultPrices] = useState<Map<string, number | null>>(new Map());
  const [priceDrafts, setPriceDrafts] = useState<Map<string, string>>(new Map());
  const [savingPriceFor, setSavingPriceFor] = useState<string | null>(null);

  const supabase = createClient();

  const handleSetOwner = async (modelId: string, ownerUserId: string) => {
    setSavingOwnerFor(modelId);
    try {
      const { error } = await supabase
        .from("models")
        .update({ owner_user_id: ownerUserId || null })
        .eq("id", modelId);
      if (error) throw error;
      setModels(models.map((m) => (m.id === modelId ? { ...m, owner_user_id: ownerUserId || null } : m)));
    } catch (err) {
      console.error("Error assigning model login:", err);
      alert("Fehler beim Zuordnen des Model-Logins");
    } finally {
      setSavingOwnerFor(null);
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchVaultPrices();
  }, []);

  const fetchVaultPrices = async () => {
    try {
      const { data } = await supabase.from("crm_vault_fan_mapping").select("model_id, vault_fan_price");
      const priceMap = new Map<string, number | null>();
      const draftMap = new Map<string, string>();
      (data || []).forEach((row: any) => {
        priceMap.set(row.model_id, row.vault_fan_price);
        draftMap.set(row.model_id, row.vault_fan_price != null ? String(row.vault_fan_price) : "");
      });
      setVaultPrices(priceMap);
      setPriceDrafts(draftMap);
    } catch (err) {
      console.error("Error fetching vault prices:", err);
    }
  };

  const handleSetVaultPrice = async (modelId: string) => {
    const draft = priceDrafts.get(modelId) || "";
    if (!draft.trim()) return;
    setSavingPriceFor(modelId);
    try {
      const value = Number(draft) || 0;
      const { error } = await supabase
        .from("crm_vault_fan_mapping")
        .upsert({ model_id: modelId, vault_fan_price: value, updated_at: new Date().toISOString() });
      if (error) throw error;
      setVaultPrices(new Map(vaultPrices).set(modelId, value));
    } catch (err) {
      console.error("Error saving vault price:", err);
      alert("Fehler beim Speichern des Preises");
    } finally {
      setSavingPriceFor(null);
    }
  };

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

                    {/* Model-Login-Zuordnung: welcher role="model"-Account
                        (Selbstregistrierung) darf für dieses Model Reddit-
                        Bilder + OnlyFans-Dateien hochladen. */}
                    <div className="mb-4">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        🔑 Model-Login
                      </label>
                      <select
                        value={model.owner_user_id || ""}
                        disabled={savingOwnerFor === model.id}
                        onChange={(e) => handleSetOwner(model.id, e.target.value)}
                        className="w-full bg-[#050505] border border-[#9C7A3D]/20 rounded px-2 py-1.5 text-white text-xs outline-none focus:border-[#C9A86A] disabled:opacity-50"
                      >
                        <option value="">-- kein Login zugeordnet --</option>
                        {modelLoginUsers
                          .filter((u) => u.user_id === model.owner_user_id || !models.some((m) => m.id !== model.id && m.owner_user_id === u.user_id))
                          .map((u) => (
                            <option key={u.user_id} value={u.user_id}>
                              {u.full_name || u.user_id}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Vault-Preis: der einzige Ort, an dem dieser Preis
                        eingestellt wird - Upload Vault und die Model-Rolle
                        zeigen kein Preisfeld mehr, sondern wenden diesen
                        Wert automatisch auf jeden Upload an. */}
                    <div className="mb-4">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        💰 Vault-Preis (automatisch für jeden Upload)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={priceDrafts.get(model.id) ?? ""}
                          onChange={(e) => setPriceDrafts(new Map(priceDrafts).set(model.id, e.target.value))}
                          placeholder="z.B. 5.00"
                          className="flex-1 bg-[#050505] border border-[#9C7A3D]/20 rounded px-2 py-1.5 text-white text-xs outline-none focus:border-[#C9A86A]"
                        />
                        <button
                          onClick={() => handleSetVaultPrice(model.id)}
                          disabled={savingPriceFor === model.id || !(priceDrafts.get(model.id) || "").trim()}
                          className="px-3 py-1.5 bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] text-black font-bold rounded text-[10px] uppercase disabled:opacity-40"
                        >
                          {savingPriceFor === model.id ? "..." : "✓"}
                        </button>
                      </div>
                      {vaultPrices.get(model.id) != null && (
                        <p className="text-[10px] text-slate-500 mt-1">Aktuell: ${vaultPrices.get(model.id)}</p>
                      )}
                    </div>

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
        <h2 className="text-sm font-bold mb-1 text-[#C9A86A] uppercase tracking-wider">Models (Schichtplanung)</h2>
        <p className="text-[11px] text-slate-500 mb-4">
          Alle Models der Agentur, plattformübergreifend - sobald eins OnlyFans-verbunden ist, erscheint es zusätzlich oben im Connection Grid.
        </p>
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
