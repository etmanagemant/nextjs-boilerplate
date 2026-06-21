"use client";

type RoleSelectProps = {
  userId: string;
  defaultRole: string;
  onUpdateAction: (formData: FormData) => void;
};

export default function RoleSelect({ userId, defaultRole, onUpdateAction }: RoleSelectProps) {
  return (
    <form action={onUpdateAction} className="inline-block w-full">
      <input type="hidden" name="user_id" value={userId} />
      <select 
        name="rolle" 
        defaultValue={defaultRole || "chatter"}
        onChange={(e) => e.target.form?.requestSubmit()}
        className={`w-full px-2 py-1 rounded border text-xs font-semibold bg-slate-900 text-white cursor-pointer ${
          defaultRole === 'admin' ? 'border-red-500/50 text-red-400' : 'border-green-500/50 text-green-400'
        }`}
      >
        <option value="chatter">Chatter</option>
        <option value="admin">Admin</option>
      </select>
    </form>
  );
}
