"use client";

import { useState } from "react";
import { OnlyFansViewer } from "@/components/OnlyFansViewer";

interface ModelTab {
  modelId: string;
  modelName: string;
}

interface ModelTabsProps {
  availableModels: { id: string; name: string }[];
}

export function ModelTabs({ availableModels }: ModelTabsProps) {
  const [openTabs, setOpenTabs] = useState<ModelTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const openModel = (modelId: string) => {
    const model = availableModels.find((m) => m.id === modelId);
    if (!model) return;

    // Check if already open
    if (openTabs.find((t) => t.modelId === modelId)) {
      setActiveTab(modelId);
      return;
    }

    // Add new tab
    const newTab: ModelTab = { modelId, modelName: model.name };
    setOpenTabs([...openTabs, newTab]);
    setActiveTab(modelId);
  };

  const closeTab = (modelId: string) => {
    const remaining = openTabs.filter((t) => t.modelId !== modelId);
    setOpenTabs(remaining);

    if (activeTab === modelId) {
      setActiveTab(remaining.length > 0 ? remaining[0].modelId : null);
    }
  };

  const openInNewTab = (modelId: string) => {
    // This will open OnlyFans in a new browser tab
    // We'll implement a special route for this
    window.open(`/crm-live?model=${modelId}&newTab=true`, "_blank");
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Tab Bar */}
      <div className="flex gap-2 bg-gray-950 border-b border-purple-600 p-2 overflow-x-auto">
        {openTabs.map((tab) => (
          <div
            key={tab.modelId}
            className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition ${
              activeTab === tab.modelId
                ? "bg-purple-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            <span onClick={() => setActiveTab(tab.modelId)} className="flex-1">
              {tab.modelName}
            </span>
            <button
              onClick={() => closeTab(tab.modelId)}
              className="text-gray-400 hover:text-red-500 font-bold"
            >
              ✕
            </button>
          </div>
        ))}

        {openTabs.length < 3 && (
          <button
            onClick={() => {
              // Show model selector
              const modelId = availableModels[0]?.id;
              if (modelId) openModel(modelId);
            }}
            className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm"
          >
            + Add Model
          </button>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {activeTab && openTabs.find((t) => t.modelId === activeTab) && (
          <OnlyFansViewer
            modelId={activeTab}
            onClose={() => closeTab(activeTab)}
          />
        )}

        {openTabs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <p className="text-lg mb-4">No models open</p>
            <button
              onClick={() => openModel(availableModels[0]?.id || "")}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-white"
            >
              Open a Model
            </button>
          </div>
        )}
      </div>

      {/* Model Quick-Select Menu */}
      <div className="bg-gray-950 border-t border-purple-600 p-3 max-h-32 overflow-y-auto">
        <p className="text-gray-400 text-sm mb-2">Available Models:</p>
        <div className="grid grid-cols-3 gap-2">
          {availableModels.map((model) => {
            const isOpen = openTabs.find((t) => t.modelId === model.id);
            return (
              <div key={model.id} className="flex gap-1">
                <button
                  onClick={() => openModel(model.id)}
                  className={`flex-1 px-2 py-1 rounded text-xs transition ${
                    isOpen
                      ? "bg-green-600 text-white"
                      : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                  }`}
                >
                  {model.name}
                </button>
                <button
                  onClick={() => openInNewTab(model.id)}
                  className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white text-xs"
                  title="Open in new tab"
                >
                  ↗
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
