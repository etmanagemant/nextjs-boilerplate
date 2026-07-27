-- Tracks the first moment our system observed OnlyFans' own "NEUE" (new
-- fan) badge for a given fan, so the spend-ring overlay can show "NEW"
-- for a bounded 24h window instead of forever (or however long OnlyFans'
-- own badge happens to persist).
ALTER TABLE crm_fan_metadata ADD COLUMN IF NOT EXISTS first_seen_new_at TIMESTAMPTZ;

-- The spend-ring overlay creates/updates a fan's row automatically (via the
-- service-role client, no logged-in chatter involved) purely to record
-- first_seen_new_at - chatter_id NOT NULL previously forced every row to
-- claim a human editor, which doesn't apply to a system-observed row nobody
-- has actually opened/edited yet. lastEditedBy display logic already treats
-- a null chatter_id as "no editor yet" (see /api/crm/current-fan), so this
-- is safe.
ALTER TABLE crm_fan_metadata ALTER COLUMN chatter_id DROP NOT NULL;
