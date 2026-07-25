"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { VaultLivePicker } from "@/components/layout/VaultLivePicker";

interface MediaRef {
  label: string;
  thumbnailUrl?: string;
}

interface ScriptStep {
  id: string;
  script_id: string;
  order_index: number;
  step_type: string;
  message_text: string;
  media_refs: MediaRef[];
  price: number | null;
}

interface Script {
  id: string;
  model_id: string;
  title: string;
  created_by: string;
  created_at: string;
}

interface ConnectedModel {
  id: string;
  name: string;
}

interface ScriptVaultClientProps {
  initialScripts: Script[];
  initialSteps: ScriptStep[];
  userId: string;
  userRole: string;
  connectedModels: ConnectedModel[];
}

type DraftStep = {
  message_text: string;
  media: MediaRef[];
  price: string;
};

const EMPTY_STEP: DraftStep = { message_text: "", media: [], price: "" };

/**
 * A Script belongs to exactly one model (not one chatter) - creating one
 * means picking which model it's for, and every chatter working that
 * model sees the same steps. Every step is text and/or media and/or
 * price - any combination is valid, nothing is forced (a pure media-only
 * step, e.g. a Freebie image with no caption, must be just as valid as a
 * text-only one).
 */
export default function ScriptVaultClient({
  initialScripts,
  initialSteps,
  userId,
  userRole,
  connectedModels,
}: ScriptVaultClientProps) {
  const [scripts, setScripts] = useState<Script[]>(initialScripts);
  const [steps, setSteps] = useState<ScriptStep[]>(initialSteps);
  const [activeModelId, setActiveModelId] = useState<string>(connectedModels[0]?.id || "");
  const [showForm, setShowForm] = useState(false);
  const [editingScriptId, setEditingScriptId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [formModelId, setFormModelId] = useState(connectedModels[0]?.id || "");
  const [draftSteps, setDraftSteps] = useState<DraftStep[]>([{ ...EMPTY_STEP }]);
  const [expandedScriptId, setExpandedScriptId] = useState<string | null>(null);
  const [pickerForStep, setPickerForStep] = useState<number | null>(null);

  const supabase = createClient();

  const modelScripts = scripts.filter((s) => s.model_id === activeModelId);

  const addDraftStep = () => setDraftSteps([...draftSteps, { ...EMPTY_STEP }]);
  const removeDraftStep = (index: number) => setDraftSteps(draftSteps.filter((_, i) => i !== index));
  const updateDraftStep = (index: number, patch: Partial<DraftStep>) =>
    setDraftSteps(draftSteps.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const handleReset = () => {
    setTitle("");
    setFormModelId(activeModelId);
    setDraftSteps([{ ...EMPTY_STEP }]);
    setEditingScriptId(null);
    setFormError(null);
    setShowForm(false);
  };

  const startEditingScript = (script: Script) => {
    const scriptSteps = steps
      .filter((s) => s.script_id === script.id)
      .sort((a, b) => a.order_index - b.order_index);
    setEditingScriptId(script.id);
    setTitle(script.title);
    setFormModelId(script.model_id);
    setDraftSteps(
      scriptSteps.length > 0
        ? scriptSteps.map((s) => ({
            message_text: s.message_text || "",
            media: s.media_refs || [],
            price: s.price != null ? String(s.price) : "",
          }))
        : [{ ...EMPTY_STEP }]
    );
    setFormError(null);
    setShowForm(true);
    setExpandedScriptId(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError("Bitte einen Script-Titel eingeben.");
      return;
    }
    if (!formModelId) {
      setFormError("Bitte ein Model auswählen.");
      return;
    }
    const invalidStep = draftSteps.findIndex((s) => !s.message_text.trim() && s.media.length === 0);
    if (invalidStep !== -1) {
      setFormError(`Schritt ${invalidStep + 1} braucht mindestens Text oder Medien.`);
      return;
    }

    setIsLoading(true);
    try {
      const stepRowsBase = draftSteps.map((s, i) => ({
        order_index: i,
        step_type: s.price ? "ppv" : s.media.length > 0 ? "image" : "text",
        message_text: s.message_text,
        media_refs: s.media,
        price: s.price ? Number(s.price) || 0 : null,
      }));

      if (editingScriptId) {
        const { error: titleError } = await supabase
          .from("crm_scripts")
          .update({ title })
          .eq("id", editingScriptId);
        if (titleError) throw titleError;

        const { error: deleteError } = await supabase
          .from("crm_script_steps")
          .delete()
          .eq("script_id", editingScriptId);
        if (deleteError) throw deleteError;

        const { data: newSteps, error: stepsError } = await supabase
          .from("crm_script_steps")
          .insert(stepRowsBase.map((s) => ({ ...s, script_id: editingScriptId })))
          .select();
        if (stepsError) throw stepsError;

        setScripts(scripts.map((s) => (s.id === editingScriptId ? { ...s, title } : s)));
        setSteps([...steps.filter((s) => s.script_id !== editingScriptId), ...(newSteps || [])]);
      } else {
        const { data: script, error: scriptError } = await supabase
          .from("crm_scripts")
          .insert({ model_id: formModelId, title, created_by: userId })
          .select()
          .single();
        if (scriptError) throw scriptError;

        const { data: newSteps, error: stepsError } = await supabase
          .from("crm_script_steps")
          .insert(stepRowsBase.map((s) => ({ ...s, script_id: script.id })))
          .select();
        if (stepsError) throw stepsError;

        setScripts([script, ...scripts]);
        setSteps([...(newSteps || []), ...steps]);
      }

      handleReset();
    } catch (err) {
      console.error("Error saving script:", err);
      setFormError("Fehler beim Speichern des Scripts.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (scriptId: string) => {
    if (!confirm("Möchtest du dieses Script wirklich löschen?")) return;
    try {
      const { error } = await supabase.from("crm_scripts").delete().eq("id", scriptId);
      if (error) throw error;
      setScripts(scripts.filter((s) => s.id !== scriptId));
      setSteps(steps.filter((s) => s.script_id !== scriptId));
    } catch (err) {
      console.error("Error deleting script:", err);
      alert("Fehler beim Löschen des Scripts");
    }
  };

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-[#E2C48A]">
      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          <div className="mb-6">
            <h1 className="text-3xl font-black uppercase tracking-wider mb-2">
              <span>📜</span>{" "}
              <span className="bg-gradient-to-r from-[#E2C48A] to-[#C9A86A] bg-clip-text text-transparent">
                Script Vault
              </span>
            </h1>
            <p className="text-slate-400 text-sm">
              Jedes Script gehört zu genau einem Model - die Chat-Library zeigt nur die Scripts des gerade offenen Models.
            </p>
          </div>

          {connectedModels.length > 0 && (
            <div className="flex gap-2 mb-6 flex-wrap">
              {connectedModels.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setActiveModelId(m.id);
                    setFormModelId(m.id);
                  }}
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                    activeModelId === m.id
                      ? "bg-[#C9A86A]/20 text-[#C9A86A] border border-[#C9A86A]/50"
                      : "bg-white/5 text-slate-400 hover:text-[#E2C48A] border border-transparent"
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}

          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              disabled={!activeModelId}
              className="mb-6 px-6 py-3 bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] text-black font-bold rounded-lg uppercase tracking-wider transition shadow-lg disabled:opacity-40"
            >
              ➕ Neues Script erstellen
            </button>
          )}

          {showForm && (
            <section className="mb-8 bg-black/40 p-6 rounded-xl border border-[#9C7A3D]/20 shadow-lg space-y-4">
              <h2 className="text-lg font-bold text-[#C9A86A] uppercase">
                {editingScriptId ? "✏️ Script bearbeiten" : "✨ Neues Script"}
              </h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">Model</label>
                  <select
                    value={formModelId}
                    onChange={(e) => setFormModelId(e.target.value)}
                    disabled={!!editingScriptId}
                    className="w-full bg-[#050505] border border-[#9C7A3D]/20 rounded px-3 py-2 text-white text-sm outline-none focus:border-[#C9A86A] disabled:opacity-50"
                  >
                    {connectedModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">Script-Titel</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="z.B. Sommer-Bundle"
                    className="w-full bg-[#050505] border border-[#9C7A3D]/20 rounded px-3 py-2 text-white text-sm outline-none focus:border-[#C9A86A]"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-400 uppercase">
                  Schritte (in Reihenfolge - z.B. Freebie, dann 1-3 Textnachrichten, dann PPV)
                </label>
                {draftSteps.map((step, i) => (
                  <div key={i} className="bg-[#050505]/60 border border-[#9C7A3D]/10 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Schritt {i + 1}</span>
                      {draftSteps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeDraftStep(i)}
                          className="text-red-400 hover:text-red-300 text-xs font-bold"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <textarea
                      value={step.message_text}
                      onChange={(e) => updateDraftStep(i, { message_text: e.target.value })}
                      placeholder="Nachrichtentext... (optional, wenn Medien vorhanden)"
                      rows={2}
                      className="w-full bg-[#0A0A0A] border border-[#9C7A3D]/20 rounded px-3 py-2 text-white text-sm outline-none focus:border-[#C9A86A]"
                    />
                    <div className="flex items-center gap-2 flex-wrap relative">
                      <button
                        type="button"
                        onClick={() => setPickerForStep(i)}
                        disabled={!formModelId}
                        className="px-3 py-2 bg-white/5 hover:bg-[#C9A86A]/15 border border-dashed border-[#9C7A3D]/60 text-[#C9A86A] rounded text-xs font-bold uppercase disabled:opacity-40"
                      >
                        📁 Medien hinzufügen
                      </button>
                      {step.media.map((m, mi) => (
                        <span
                          key={mi}
                          className="flex items-center gap-1 bg-[#9C7A3D]/20 text-[#E2C48A] text-[10px] px-2 py-1 rounded"
                        >
                          {m.label}
                          <button
                            type="button"
                            onClick={() =>
                              updateDraftStep(i, { media: step.media.filter((_, idx) => idx !== mi) })
                            }
                            className="text-red-400 hover:text-red-300 ml-1"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                      <input
                        type="number"
                        step="0.01"
                        value={step.price}
                        onChange={(e) => updateDraftStep(i, { price: e.target.value })}
                        placeholder="Preis $ (optional)"
                        className="w-32 bg-[#0A0A0A] border border-[#9C7A3D]/20 rounded px-3 py-2 text-white text-xs outline-none focus:border-[#C9A86A]"
                      />

                      {pickerForStep === i && formModelId && (
                        <VaultLivePicker
                          modelId={formModelId}
                          onSelect={(items) => updateDraftStep(i, { media: [...step.media, ...items] })}
                          onClose={() => setPickerForStep(null)}
                        />
                      )}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addDraftStep}
                  className="text-xs font-bold text-[#C9A86A] hover:text-[#E5C158] uppercase"
                >
                  ➕ Schritt hinzufügen
                </button>
              </div>

              {formError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  {formError}
                </p>
              )}

              <div className="flex gap-3 pt-4 border-t border-[#9C7A3D]/10">
                <button
                  onClick={handleSave}
                  disabled={isLoading}
                  className="flex-1 bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] px-4 py-2 text-black font-bold rounded uppercase disabled:opacity-50 transition"
                >
                  {isLoading ? "Speichern..." : editingScriptId ? "✓ Änderungen speichern" : "✓ Script erstellen"}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex-1 bg-slate-600/30 text-slate-300 py-2 px-4 rounded-lg font-bold uppercase text-sm hover:bg-slate-600/50 transition"
                >
                  ✕ Abbrechen
                </button>
              </div>
            </section>
          )}

          <div className="space-y-3">
            {modelScripts.length === 0 ? (
              <div className="bg-black/40 p-8 rounded-xl border border-[#9C7A3D]/10 text-center text-slate-400 text-sm">
                {connectedModels.length === 0 ? "Kein Model verbunden." : "Noch keine Scripts für dieses Model."}
              </div>
            ) : (
              modelScripts.map((script) => {
                const scriptSteps = steps.filter((s) => s.script_id === script.id);
                const isExpanded = expandedScriptId === script.id;
                return (
                  <div key={script.id} className="bg-black/40 rounded-lg border border-[#9C7A3D]/10 overflow-hidden">
                    <div
                      className="flex justify-between items-center p-4 cursor-pointer hover:bg-white/5 transition"
                      onClick={() => setExpandedScriptId(isExpanded ? null : script.id)}
                    >
                      <div>
                        <h3 className="font-bold text-[#C9A86A]">{script.title}</h3>
                        <p className="text-[10px] text-slate-500 mt-0.5">{scriptSteps.length} Schritte</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditingScript(script);
                          }}
                          className="text-[#C9A86A] hover:text-[#E5C158] font-bold text-xs uppercase"
                        >
                          ✏️ Bearbeiten
                        </button>
                        {userRole === "admin" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(script.id);
                            }}
                            className="text-red-400 hover:text-red-300 font-bold text-sm"
                          >
                            ❌
                          </button>
                        )}
                        <span className="text-slate-500 text-xs">{isExpanded ? "▾" : "▸"}</span>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-[#9C7A3D]/10 p-4 space-y-2">
                        {scriptSteps.map((step) => (
                          <div key={step.id} className="bg-[#050505]/50 p-3 rounded text-xs">
                            <div className="flex items-center gap-2 mb-1">
                              {step.price != null && (
                                <span className="text-[9px] bg-emerald-500/20 px-2 py-0.5 rounded uppercase font-bold text-emerald-400">
                                  ${step.price}
                                </span>
                              )}
                              {(step.media_refs || []).length > 0 && (
                                <span className="text-[9px] bg-[#9C7A3D]/20 px-2 py-0.5 rounded uppercase font-bold text-[#C9A86A]">
                                  📁 {step.media_refs.length} Datei(en)
                                </span>
                              )}
                            </div>
                            <p className="text-slate-300 whitespace-pre-wrap">{step.message_text}</p>
                            {(step.media_refs || []).map((m, mi) => (
                              <p key={mi} className="text-slate-500 mt-1">
                                📁 {m.label}
                              </p>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
