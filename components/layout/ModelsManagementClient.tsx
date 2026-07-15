"use client";

import { useState } from "react";
import ModelPlatformSelect from "./ModelPlatformSelect";

interface Model {
  id: string;
  name: string;
  platform_type?: string;
}

interface ModelsManagementClientProps {
  models: Model[];
  onDeleteClick: (formData: FormData) => Promise<void>;
  onNameChange: (formData: FormData) => Promise<void>;
}

export default function ModelsManagementClient({
  models,
  onDeleteClick,
  onNameChange,
}: ModelsManagementClientProps) {
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleEditStart = (modelId: string, modelName: string) => {
    setEditingId(modelId);
    setEditingName(modelName);
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditingName("");
  };

  const handleNameSubmit = async (modelId: string) => {
    const originalName = models.find((m) => m.id === modelId)?.name;
    if (editingName.trim() && editingName !== originalName) {
      const formData = new FormData();
      formData.append("id", modelId);
      formData.append("name", editingName.trim());
      
      try {
        await onNameChange(formData);
        setEditingId(null);
        setEditingName("");
      } catch (err) {
        console.error("Error updating model name:", err);
      }
    } else {
      handleEditCancel();
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    
    setIsDeleting(true);
    try {
      const formData = new FormData();
      formData.append("id", deleteConfirm.id);
      await onDeleteClick(formData);
      setDeleteConfirm(null);
    } catch (err) {
      console.error("Error deleting model:", err);
      setIsDeleting(false);
    }
  };

  return (
    <>
      {/* Models Grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {models.map((model) => (
          <div
            key={model.id}
            className="flex justify-between items-center p-3 border border-[#AA7C11]/20 rounded-md bg-[#050505]/40 hover:border-[#D4AF37]/50 transition"
          >
            <div className="flex items-center gap-3 flex-1">
              {editingId === model.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleNameSubmit(model.id);
                  }}
                  className="flex gap-2 flex-1"
                >
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    autoFocus
                    className="flex-1 px-2 py-1 border border-[#AA7C11]/30 rounded-md text-sm text-white bg-[#050505] focus:border-[#D4AF37] outline-none"
                  />
                  <button
                    type="submit"
                    className="text-[11px] bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] text-black px-2 py-1 rounded font-bold hover:from-[#E5C158] transition cursor-pointer"
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    onClick={handleEditCancel}
                    className="text-[11px] bg-slate-600 text-white px-2 py-1 rounded font-bold hover:bg-slate-700 transition cursor-pointer"
                  >
                    ✕
                  </button>
                </form>
              ) : (
                <>
                  <span className="font-semibold text-white tracking-wide">{model.name}</span>
                  <button
                    onClick={() => handleEditStart(model.id, model.name)}
                    className="text-[11px] bg-blue-600/60 text-white px-2 py-1 rounded font-bold hover:bg-blue-700 transition cursor-pointer"
                  >
                    ✏️ Bearbeiten
                  </button>
                </>
              )}
              <ModelPlatformSelect
                modelId={model.id}
                defaultPlatform={model.platform_type || "onlyfans"}
              />
            </div>
            {editingId !== model.id && (
              <button
                onClick={() => setDeleteConfirm({ id: model.id, name: model.name })}
                className="text-red-400 hover:text-red-300 text-sm font-bold transition cursor-pointer ml-2"
              >
                🗑️ Löschen
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#AA7C11]/30 rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="text-center">
              <div className="text-4xl mb-3">⚠️</div>
              <h3 className="text-lg font-bold text-[#D4AF37] mb-3">ACHTUNG</h3>
              <p className="text-sm text-white/80 mb-6 leading-relaxed">
                Bist du dir absolut sicher, dass du dieses Model{" "}
                <span className="font-semibold text-[#D4AF37]">{deleteConfirm.name}</span> löschen willst? Dadurch können
                wichtige Verknüpfungen getrennt werden!
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded-md text-sm transition cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 text-white font-bold rounded-md text-sm transition cursor-pointer"
                >
                  {isDeleting ? "Lösching..." : "Ja, unwiderruflich löschen"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
