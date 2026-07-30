-- Task: OF Inbox (Beta) custom fan nicknames (2026-07-30) - lets a chatter
-- rename a fan in the CRM's own inbox while still showing the real OnlyFans
-- username alongside it ("Nickname (username)"), without touching OnlyFans
-- itself in any way (purely a CRM-side label).
CREATE TABLE IF NOT EXISTS crm_fan_nicknames (
  model_id TEXT NOT NULL,
  fan_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (model_id, fan_id)
);
