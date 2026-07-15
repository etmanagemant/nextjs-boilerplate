-- ============================================================================
-- MIGRATION: Add model_id to crm_fan_metadata for multi-model support
-- ============================================================================
-- 
-- PURPOSE: Associate each fan with a specific model so that when a user
-- connects multiple models, they see the correct fans for each model.
--
-- REQUIRES: Run this migration in Supabase SQL Editor
-- ============================================================================

-- Step 1: Add model_id column to crm_fan_metadata if it doesn't exist
ALTER TABLE crm_fan_metadata
ADD COLUMN IF NOT EXISTS model_id TEXT;

-- Step 2: Add comment to describe the column
COMMENT ON COLUMN crm_fan_metadata.model_id IS 
  'Model ID associated with this fan. Allows fans to be segmented by model.';

-- Step 3: For existing fans with no model_id, auto-associate with first connected model
-- This is a data migration step - adjust the logic as needed
UPDATE crm_fan_metadata
SET model_id = (
  SELECT model_id FROM crm_model_sessions 
  WHERE is_active = true 
  LIMIT 1
)
WHERE model_id IS NULL;

-- Step 4: (Optional) Create an index for faster queries by model_id
CREATE INDEX IF NOT EXISTS idx_crm_fan_metadata_model_id 
ON crm_fan_metadata(model_id);

-- Step 5: (Optional) Create a composite index for faster fan lookup by model
CREATE INDEX IF NOT EXISTS idx_crm_fan_metadata_model_fan 
ON crm_fan_metadata(model_id, fan_id);

-- ============================================================================
-- TESTING (Run in SQL Editor to verify):
-- ============================================================================
-- 
-- Select fans by model:
-- SELECT COUNT(*), model_id FROM crm_fan_metadata GROUP BY model_id;
-- 
-- Select a specific model's fans:
-- SELECT fan_id, lifetime_value, model_id FROM crm_fan_metadata 
-- WHERE model_id = 'testmodel' LIMIT 5;
-- 
-- ============================================================================
