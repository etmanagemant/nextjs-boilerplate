-- Add columns to crm_fan_messages for tracking sent status
-- This allows us to know if a message was successfully sent to OnlyFans platform

-- Add sent_to_platform column to track if message was sent to OnlyFans
ALTER TABLE crm_fan_messages ADD COLUMN IF NOT EXISTS
  sent_to_platform BOOLEAN DEFAULT FALSE;

-- Add external_message_id to store OnlyFans message ID for reference
ALTER TABLE crm_fan_messages ADD COLUMN IF NOT EXISTS
  external_message_id TEXT;

-- Add updated_at column for better tracking
ALTER TABLE crm_fan_messages ADD COLUMN IF NOT EXISTS
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create index for faster lookups when checking sent status
CREATE INDEX IF NOT EXISTS idx_crm_fan_messages_sent_status
  ON crm_fan_messages(chatter_id, sent_to_platform)
  WHERE sent_to_platform = FALSE;

-- Create index for external message ID lookups
CREATE INDEX IF NOT EXISTS idx_crm_fan_messages_external_id
  ON crm_fan_messages(external_message_id)
  WHERE external_message_id IS NOT NULL;

-- Add comment to document the purpose
COMMENT ON COLUMN crm_fan_messages.sent_to_platform IS 'TRUE if message was successfully sent to OnlyFans API, FALSE if only saved locally';
COMMENT ON COLUMN crm_fan_messages.external_message_id IS 'OnlyFans message ID returned from API, for reference and deduplication';
