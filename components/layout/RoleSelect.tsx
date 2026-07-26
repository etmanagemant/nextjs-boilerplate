"use client";

type RoleSelectProps = {
  userId: string;
  defaultRole: string;
  onUpdateAction: (formData: FormData) => Promise<void>;
};

export default function RoleSelect({ userId, defaultRole, onUpdateAction }: RoleSelectProps) {
  return (
    <form action={onUpdateAction} className="inline-block w-full">
      <input type="hidden" name="user_id" value={userId} />
      <select
        name="rolle"
        defaultValue={defaultRole || ""}
        onChange={(e) => e.target.form?.requestSubmit()} // 🟢 Hier absolut sicher und erlaubt!
        className="w-full px-2 py-1 rounded border text-xs font-semibold bg-slate-900 text-white border-slate-700 cursor-pointer"
      >
        {/* Neu registrierte Accounts haben noch keine Rolle (siehe
            WaitingForRole) - diese Option macht das in der Liste sichtbar
            statt fälschlich wie "Chatter" auszusehen. */}
        {!defaultRole && <option value="" disabled>⏳ Noch keine Rolle</option>}
        <option value="chatter">🎬 Chatter</option>
        <option value="moderator">🎭 Moderator (Stripchat)</option>
        <option value="model">👤 Model</option>
        <option value="content-manager">📋 Content-Managerin</option>
        <option value="admin">👑 Admin</option>
      </select>
    </form>
  );
}
