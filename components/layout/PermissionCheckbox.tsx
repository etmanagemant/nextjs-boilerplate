"use client";

type PermissionCheckboxProps = {
  role: string;
  featureKey: string;
  defaultChecked: boolean;
  onUpdateAction: (formData: FormData) => Promise<void>;
};

/**
 * One cell in the Management page's Rechte-Kontrollzentrum grid - submits
 * itself the moment it's toggled, same auto-submit pattern as RoleSelect.
 * An unchecked box simply omits "enabled" from the FormData, which the
 * server action correctly reads as false (no hidden fallback field needed).
 */
export default function PermissionCheckbox({
  role,
  featureKey,
  defaultChecked,
  onUpdateAction,
}: PermissionCheckboxProps) {
  return (
    <form action={onUpdateAction} className="inline-flex">
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="feature_key" value={featureKey} />
      <input
        type="checkbox"
        name="enabled"
        value="true"
        defaultChecked={defaultChecked}
        onChange={(e) => e.target.form?.requestSubmit()}
        className="w-5 h-5 rounded accent-[#C9A86A] cursor-pointer"
      />
    </form>
  );
}
