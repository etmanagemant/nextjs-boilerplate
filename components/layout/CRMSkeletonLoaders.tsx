"use client";

// Skeleton loader for model cards
export function ModelCardSkeleton() {
  return (
    <div className="bg-black/40 p-6 rounded-xl border border-[#8A6D3F]/10 animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="h-5 bg-slate-700/30 rounded w-1/3 mb-2"></div>
          <div className="h-3 bg-slate-700/20 rounded w-1/4"></div>
        </div>
        <div className="h-7 w-28 bg-slate-700/30 rounded-full"></div>
      </div>
    </div>
  );
}

// Skeleton loader for settings panel
export function SettingsPanelSkeleton() {
  return (
    <div className="space-y-4">
      <div className="bg-black/40 p-4 rounded-lg animate-pulse">
        <div className="h-4 bg-slate-700/30 rounded w-1/4 mb-3"></div>
        <div className="space-y-2">
          <div className="h-20 bg-slate-700/20 rounded"></div>
        </div>
      </div>
      <div className="bg-black/40 p-4 rounded-lg animate-pulse">
        <div className="h-4 bg-slate-700/30 rounded w-1/3 mb-3"></div>
        <div className="h-10 bg-slate-700/20 rounded"></div>
      </div>
    </div>
  );
}

// Skeleton loader for script library
export function ScriptLibrarySkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-black/40 p-4 rounded-lg border border-[#8A6D3F]/5 animate-pulse"
        >
          <div className="h-4 bg-slate-700/30 rounded w-1/2 mb-2"></div>
          <div className="h-3 bg-slate-700/20 rounded w-2/3"></div>
        </div>
      ))}
    </div>
  );
}
