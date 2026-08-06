-- Per-USER overrides for the Rechte-Kontrollzentrum, on top of the
-- existing per-ROLE grants in crm_role_permissions. Lets the Hauptadmin
-- give/take a specific feature for exactly one person without touching
-- their whole role (e.g. one chatter gets Massmessage, the others don't).
-- Resolution order (see hasFeatureAccess in lib/roles.ts): explicit
-- per-user row > explicit per-role row > admin-tier default. A missing
-- row here simply means "follow the role's setting" - there is no
-- separate "explicitly inherit" state to store.
CREATE TABLE IF NOT EXISTS crm_user_permissions (
  user_id UUID NOT NULL,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature_key)
);

ALTER TABLE crm_user_permissions ENABLE ROW LEVEL SECURITY;

-- Every logged-in user needs to read their OWN overrides (to know what to
-- show them) - same reasoning as crm_role_permissions, no secrets here.
CREATE POLICY "crm_user_permissions_select_authenticated" ON crm_user_permissions
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only the literal Hauptadmin can grant/revoke - same bar as
-- crm_role_permissions_write_admin.
CREATE POLICY "crm_user_permissions_write_admin" ON crm_user_permissions
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
