-- Lets the Hauptadmin grant a role (chatter/moderator) extra access to a
-- specific page, on top of whatever that role already gets by default.
-- Admin and content-manager are never affected by this table - they stay
-- fully admin-tier via isAdminTierRole() regardless of what's configured
-- here (see lib/roles.ts). A missing row for (role, feature_key) means
-- "not granted" - explicit opt-in only, nothing is granted by default.
CREATE TABLE IF NOT EXISTS crm_role_permissions (
  role TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role, feature_key)
);

ALTER TABLE crm_role_permissions ENABLE ROW LEVEL SECURITY;

-- Every logged-in user needs to read their OWN role's permissions (to
-- know what to show them) - this table holds no secrets, just booleans.
CREATE POLICY "crm_role_permissions_select_authenticated" ON crm_role_permissions
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only the literal Hauptadmin can grant/revoke - matches the Management
-- page's own strict admin-only gate, not admin-tier (content-manager
-- should not be able to grant itself or others more access).
CREATE POLICY "crm_role_permissions_write_admin" ON crm_role_permissions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
);
