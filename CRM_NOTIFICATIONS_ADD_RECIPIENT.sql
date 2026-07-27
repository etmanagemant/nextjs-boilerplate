-- Lets a notification target ONE specific user instead of always being a
-- role-wide broadcast. NULL recipient_user_id keeps the existing behavior
-- (visible to admin-tier roles, e.g. the "model uploaded to vault" alert);
-- a set recipient_user_id makes it visible ONLY to that user (new shift-
-- assigned / PPV-purchased notifications).
ALTER TABLE crm_notifications ADD COLUMN IF NOT EXISTS recipient_user_id UUID;
ALTER TABLE crm_notifications ADD COLUMN IF NOT EXISTS type TEXT;
CREATE INDEX IF NOT EXISTS idx_crm_notifications_recipient ON crm_notifications(recipient_user_id);

-- The old SELECT/UPDATE/DELETE policies were purely role-based
-- (admin/moderator) - a personal, recipient-targeted row would have been
-- silently invisible to its own recipient if they're a plain chatter/model
-- (RLS just filters the row out, no error). Also fixes a pre-existing
-- mismatch noticed along the way: app/api/notifications already allowed
-- content-manager at the app level, but these policies never actually
-- granted it - content-manager's bell was silently empty this whole time.
-- Per explicit scoping: the shared broadcast kind (recipient_user_id null,
-- currently just "model uploaded to Vault") is admin/content-manager only,
-- NOT moderator - personal rows are unaffected by role, visible to
-- whoever they're addressed to regardless of role.
DROP POLICY IF EXISTS "crm_notifications_select_admin" ON crm_notifications;
CREATE POLICY "crm_notifications_select" ON crm_notifications
FOR SELECT
USING (
  recipient_user_id = auth.uid()
  OR (
    recipient_user_id IS NULL
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('admin', 'content-manager')
    )
  )
);

DROP POLICY IF EXISTS "crm_notifications_update_admin" ON crm_notifications;
CREATE POLICY "crm_notifications_update" ON crm_notifications
FOR UPDATE
USING (
  recipient_user_id = auth.uid()
  OR (
    recipient_user_id IS NULL
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('admin', 'content-manager')
    )
  )
)
WITH CHECK (
  recipient_user_id = auth.uid()
  OR (
    recipient_user_id IS NULL
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('admin', 'content-manager')
    )
  )
);

DROP POLICY IF EXISTS "crm_notifications_delete_admin" ON crm_notifications;
CREATE POLICY "crm_notifications_delete" ON crm_notifications
FOR DELETE
USING (
  recipient_user_id = auth.uid()
  OR (
    recipient_user_id IS NULL
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('admin', 'content-manager')
    )
  )
);
