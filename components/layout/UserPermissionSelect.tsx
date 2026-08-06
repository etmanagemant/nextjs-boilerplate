"use client";

type UserPermissionSelectProps = {
  userId: string;
  featureKey: string;
  currentMode: "inherit" | "on" | "off";
  onUpdateAction: (formData: FormData) => Promise<void>;
};

/**
 * One row's override control in the Management page's per-user overrides
 * panel - tri-state (nicht bi-state wie eine Checkbox), weil "kein
 * Override" (folgt der Rolle) sich von einem expliziten "erzwungen AUS"
 * unterscheiden muss - eine simple Checkbox kann das nicht ausdrücken.
 * Auto-submit wie PermissionCheckbox.
 */
export default function UserPermissionSelect({
  userId,
  featureKey,
  currentMode,
  onUpdateAction,
}: UserPermissionSelectProps) {
  return (
    <form action={onUpdateAction} className="inline-flex">
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="feature_key" value={featureKey} />
      <select
        name="mode"
        defaultValue={currentMode}
        onChange={(e) => e.target.form?.requestSubmit()}
        className="bg-[#050505] border border-[#9C7A3D]/30 rounded px-1.5 py-1 text-[10px] text-white outline-none focus:border-[#C9A86A] cursor-pointer"
      >
        <option value="inherit">Rolle-Standard</option>
        <option value="on">Erzwungen AN</option>
        <option value="off">Erzwungen AUS</option>
      </select>
    </form>
  );
}
