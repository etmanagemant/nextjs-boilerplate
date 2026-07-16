-- ============================================================================
-- MIGRATION: Add columns for OnlyFans sync support
-- ============================================================================

-- Step 1: Add last_synced_at to crm_model_sessions
ALTER TABLE crm_model_sessions
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN crm_model_sessions.last_synced_at IS 
  'Timestamp of last successful OnlyFans data sync';

-- Step 2: Ensure auth_cookies is JSONB (if it's TEXT, migrate it)
-- This should already be JSONB from the browser login setup

-- Step 3: Create index for faster queries on is_active sessions
CREATE INDEX IF NOT EXISTS idx_crm_model_sessions_active 
ON crm_model_sessions(is_active) WHERE is_active = true;

-- Step 4: Add columns to crm_fan_messages for external message tracking
ALTER TABLE crm_fan_messages
ADD COLUMN IF NOT EXISTS external_message_id TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN crm_fan_messages.external_message_id IS 
  'OnlyFans message ID for deduplication during sync';

COMMENT ON COLUMN crm_fan_messages.metadata IS 
  'Additional metadata from OnlyFans (mediaType, price, etc.)';

-- Step 5: Create index for faster duplicate checking
CREATE INDEX IF NOT EXISTS idx_crm_fan_messages_external_id 
ON crm_fan_messages(external_message_id);

-- Step 6: Add columns to crm_fan_metadata for last_synced tracking
ALTER TABLE crm_fan_metadata
ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN crm_fan_metadata.last_verified_at IS 
  'Last time this fan was synced from OnlyFans';

-- ============================================================================
-- TESTING (Run in SQL Editor to verify):
-- ============================================================================
-- 
-- Check columns were added:
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'crm_model_sessions';
-- 
-- Check active sessions:
-- SELECT model_id, is_active, last_synced_at 
-- FROM crm_model_sessions 
-- WHERE is_active = true;
-- 
-- ============================================================================
