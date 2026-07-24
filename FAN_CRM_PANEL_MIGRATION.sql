-- ============================================================================
-- MIGRATION: Add columns for the Fan CRM side panel (SuperCreator-style)
-- ============================================================================
--
-- New fields shown in the Fan CRM panel next to the live OnlyFans view.
-- Existing columns (notes, tags, lifetime_value, vip_tier, created_at) are
-- reused as-is - this only adds what doesn't already exist.
-- ============================================================================

ALTER TABLE crm_fan_metadata
ADD COLUMN IF NOT EXISTS real_name TEXT,
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS age TEXT,
ADD COLUMN IF NOT EXISTS came_from TEXT,
ADD COLUMN IF NOT EXISTS last_subscription_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_paid_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS preferences TEXT[] DEFAULT ARRAY[]::TEXT[];

COMMENT ON COLUMN crm_fan_metadata.real_name IS 'Manually entered or AI-suggested real/nickname, distinct from the OnlyFans username';
COMMENT ON COLUMN crm_fan_metadata.age IS 'Stored as text - often an estimate, not a verified number';
COMMENT ON COLUMN crm_fan_metadata.came_from IS 'Traffic source, e.g. Reddit, Twitter/X, referral';
COMMENT ON COLUMN crm_fan_metadata.preferences IS 'Short tags: hobbies, interests, kinks, whatever the chatter/AI notes about what this fan likes';

-- ============================================================================
-- TESTING (run in the Supabase SQL editor to verify):
-- ============================================================================
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'crm_fan_metadata' ORDER BY ordinal_position;
-- ============================================================================
