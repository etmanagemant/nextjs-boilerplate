"use client";

type SecondaryRoleSelectProps = {
  userId: string;
  primaryRole: string;
  defaultSecondaryRole: string | null;
  onUpdateAction: (formData: FormData) => Promise<void>;
};

// Task #80: lets an employee hold a second role at once (e.g. Chatter +
// Moderator, both Stechuhr panels shown). Only meaningful for chatter/
// moderator primary roles - the other options (leave a select) let it
// be cleared again.
export default function SecondaryRoleSelect({ userId, primaryRole, defaultSecondaryRole, onUpdateAction }: SecondaryRoleSelectProps) {
  if (primaryRole !== "chatter" && primaryRole !== "moderator") {
    return <span className="text-[10px] text-slate-500">-</span>;
  }
  const other = primaryRole === "chatter" ? "moderator" : "chatter";
  const otherLabel = primaryRole === "chatter" ? "🎭 Moderator" : "🎬 Chatter";

  return (
    <form action={onUpdateAction} className="inline-block w-full">
      <input type="hidden" name="user_id" value={userId} />
      <select
        name="zweitrolle"
        defaultValue={defaultSecondaryRole || ""}
        onChange={(e) => e.target.form?.requestSubmit()}
        className="w-full px-2 py-1 rounded border text-xs font-semibold bg-slate-900 text-white border-slate-700 cursor-pointer"
      >
        <option value="">- keine -</option>
        <option value={other}>{otherLabel}</option>
      </select>
    </form>
  );
}
