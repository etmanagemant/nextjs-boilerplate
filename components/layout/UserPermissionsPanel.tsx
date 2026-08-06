"use client";

import { useState } from "react";
import UserPermissionSelect from "./UserPermissionSelect";

type Feature = { key: string; label: string };
type UserRow = { user_id: string; full_name: string | null; email: string | null; role: string | null };

/**
 * Per-user overrides on top of the role grid above it - pick one person,
 * see/override just their rows. Kept as a separate picker+grid instead of
 * one giant user x feature matrix (would be unreadable with more than a
 * few people).
 */
export default function UserPermissionsPanel({
  users,
  features,
  userOverrides,
  roleDefaults,
  onUpdateAction,
}: {
  users: UserRow[];
  features: Feature[];
  userOverrides: Record<string, Record<string, boolean>>;
  roleDefaults: Record<string, Record<string, boolean>>;
  onUpdateAction: (formData: FormData) => Promise<void>;
}) {
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.user_id || "");
  const selectedUser = users.find((u) => u.user_id === selectedUserId);
  const overrides = userOverrides[selectedUserId] || {};
  const roleDefault = selectedUser?.role ? roleDefaults[selectedUser.role] || {} : {};

  if (users.length === 0) {
    return <p className="text-xs text-slate-500">Keine Nutzer vorhanden.</p>;
  }

  return (
    <div>
      <select
        value={selectedUserId}
        onChange={(e) => setSelectedUserId(e.target.value)}
        className="bg-[#050505] border border-[#9C7A3D]/30 rounded px-3 py-2 text-sm text-white outline-none focus:border-[#C9A86A] mb-4"
      >
        {users.map((u) => (
          <option key={u.user_id} value={u.user_id}>
            {u.full_name || u.email || u.user_id} ({u.role || "keine Rolle"})
          </option>
        ))}
      </select>
      {selectedUser && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-[#050505] text-[#C9A86A] font-semibold text-xs uppercase tracking-wider">
                <th className="p-3">Funktion</th>
                <th className="p-3 w-32 text-center">Rollen-Standard</th>
                <th className="p-3 w-40">Für {selectedUser.full_name || selectedUser.email}</th>
              </tr>
            </thead>
            <tbody>
              {features.map((f) => {
                const hasOverride = f.key in overrides;
                const mode: "inherit" | "on" | "off" = hasOverride ? (overrides[f.key] ? "on" : "off") : "inherit";
                return (
                  <tr key={f.key} className="border-b border-white/5 hover:bg-black/20 transition">
                    <td className="p-3 text-white">{f.label}</td>
                    <td className="p-3 text-center text-xs text-slate-400">{roleDefault[f.key] ? "✓" : "✗"}</td>
                    <td className="p-3">
                      <UserPermissionSelect
                        userId={selectedUserId}
                        featureKey={f.key}
                        currentMode={mode}
                        onUpdateAction={onUpdateAction}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
