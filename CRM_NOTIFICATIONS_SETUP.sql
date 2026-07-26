-- Minimal notifications inbox for the topbar bell (previously a UI shell
-- with no backing data - see GlobalTopBar.tsx). First real use case: tell
-- the content manager/admin when a model has finished uploading a batch
-- of files to their OnlyFans Vault via the model workspace.
-- Access control follows this project's existing convention (role checks
-- in the API route, not DB-level RLS - see the commented-out policy
-- blocks in CRM_SESSIONS_SETUP.sql for the same pattern).
CREATE TABLE IF NOT EXISTS crm_notifications (
  id BIGSERIAL PRIMARY KEY,
  message TEXT NOT NULL,
  model_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS crm_notifications_unread_idx ON crm_notifications (created_at DESC) WHERE read_at IS NULL;
