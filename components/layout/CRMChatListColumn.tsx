"use client";

import { Fan } from "@/app/crm-inbox/types";

interface ChatListColumnProps {
  fans: Fan[];
  selectedFanId: string | null;
  onSelectFan: (fanId: string) => void;
  isLoading: boolean;
}

export default function ChatListColumn({
  fans,
  selectedFanId,
  onSelectFan,
  isLoading,
}: ChatListColumnProps) {
  return (
    <div className="h-full bg-black/40 border-r border-[#D4AF37]/20 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-black/60 p-4 border-b border-[#D4AF37]/20 z-10">
        <h2 className="text-sm font-black text-[#D4AF37] uppercase tracking-wider">
          👥 Active Fans
        </h2>
        <p className="text-xs text-slate-500 mt-1">{fans.length} chats</p>
      </div>

      {/* Fan List */}
      <div className="space-y-2 p-3">
        {isLoading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 bg-slate-700/20 rounded-lg animate-pulse"
              />
            ))}
          </>
        ) : fans.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-xs text-slate-500">No active chats</p>
          </div>
        ) : (
          fans.map((fan) => (
            <button
              key={fan.id}
              onClick={() => onSelectFan(fan.id)}
              className={`w-full p-3 rounded-lg transition border ${
                selectedFanId === fan.id
                  ? "bg-[#D4AF37]/20 border-[#D4AF37]/50"
                  : "bg-black/40 border-[#AA7C11]/20 hover:border-[#D4AF37]/30"
              }`}
            >
              {/* Avatar & Info */}
              <div className="flex items-start gap-3">
                {/* Avatar Placeholder */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#AA7C11] flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-[#0A0A0A]">
                    {fan.username[0].toUpperCase()}
                  </span>
                </div>

                {/* Username & Metadata */}
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2 justify-between">
                    <p className="text-sm font-bold text-[#F3E5AB]">
                      {fan.username}
                    </p>
                    {fan.is_vip && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                        👑 VIP
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    ${fan.total_revenue.toLocaleString()}
                  </p>
                  {fan.unread_count > 0 && (
                    <div className="mt-1 inline-flex items-center gap-1 bg-red-500/20 text-red-300 px-2 py-0.5 rounded text-xs font-bold">
                      🔔 {fan.unread_count} new
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
