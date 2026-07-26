-- Minimal notifications inbox for the topbar bell (previously a UI shell
-- with no backing data - see GlobalTopBar.tsx). First real use case: tell
-- the content manager/admin when a model has finished uploading a batch
-- of files to their OnlyFans Vault via the model workspace.
CREATE TABLE IF NOT EXISTS crm_notifications (
  id BIGSERIAL PRIMARY KEY,
  message TEXT NOT NULL,
  model_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS crm_notifications_unread_idx ON crm_notifications (created_at DESC) WHERE read_at IS NULL;

-- RLS enabled with real, enforced policies - not just an app-level check
-- (crm_model_sessions proves this project actually relies on DB-level RLS
-- for anything sensitive, e.g. its own admin-only read policy).
ALTER TABLE crm_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_notifications_select_admin" ON crm_notifications
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'moderator')
  )
);

CREATE POLICY "crm_notifications_insert_authenticated" ON crm_notifications
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "crm_notifications_update_admin" ON crm_notifications
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'moderator')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'moderator')
  )
);

-- Needed so the opportunistic 20-day cleanup in app/api/notifications
-- (GET) can actually delete old rows - without this, RLS silently
-- blocks every delete since no policy grants it.
CREATE POLICY "crm_notifications_delete_admin" ON crm_notifications
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'moderator')
  )
);
