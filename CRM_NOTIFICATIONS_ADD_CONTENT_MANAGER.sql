-- The content-manager role didn't exist yet when CRM_NOTIFICATIONS_SETUP.sql
-- was written - notifications went to admin/moderator as a stand-in. Now
-- that content-manager exists (its whole reason for existing was to be
-- told when a model uploads), it needs the same read/update/delete access
-- moderator already has.
DROP POLICY IF EXISTS "crm_notifications_select_admin" ON crm_notifications;
CREATE POLICY "crm_notifications_select_admin" ON crm_notifications
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'moderator', 'content-manager')
  )
);

DROP POLICY IF EXISTS "crm_notifications_update_admin" ON crm_notifications;
CREATE POLICY "crm_notifications_update_admin" ON crm_notifications
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'moderator', 'content-manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'moderator', 'content-manager')
  )
);

DROP POLICY IF EXISTS "crm_notifications_delete_admin" ON crm_notifications;
CREATE POLICY "crm_notifications_delete_admin" ON crm_notifications
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'moderator', 'content-manager')
  )
);
