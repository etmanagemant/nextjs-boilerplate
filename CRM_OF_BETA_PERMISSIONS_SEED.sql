-- Seeds crm_role_permissions for the new OF Inbox Beta icon-bar keys
-- (of-notifications, of-lists, of-vault, of-fan-search, of-schedules,
-- of-earnings, of-massmessage-stats, of-massmessage-compose,
-- of-script-vault - see GRANTABLE_FEATURES in lib/roles.ts).
--
-- MUST run this before/right after deploying the code that gates these
-- icons behind hasFeatureAccess() - without an explicit row, that
-- function's default is "admin-tier sees it, everyone else doesn't",
-- which would silently hide Bell/Listen/Tresor/Fan-Suche from every
-- chatter (they've always had those, unlike Kalender/Auszahlungen/
-- Massmessage which were already isAdmin-only in code). These INSERTs
-- reproduce EXACTLY the behavior that already existed in code before
-- this change, so running this causes zero visible difference - the
-- Rechte-Kontrollzentrum grid is just the new way to change it going
-- forward. ON CONFLICT DO NOTHING makes this safe to run more than once.
INSERT INTO crm_role_permissions (role, feature_key, enabled) VALUES
  ('chatter', 'of-notifications', true),
  ('chatter', 'of-lists', true),
  ('chatter', 'of-vault', true),
  ('chatter', 'of-fan-search', true),
  ('chatter', 'of-script-vault', true),
  ('chatter', 'of-schedules', false),
  ('chatter', 'of-earnings', false),
  ('chatter', 'of-massmessage-stats', false),
  ('chatter', 'of-massmessage-compose', false),
  ('moderator', 'of-notifications', false),
  ('moderator', 'of-lists', false),
  ('moderator', 'of-vault', false),
  ('moderator', 'of-fan-search', false),
  ('moderator', 'of-script-vault', false),
  ('moderator', 'of-schedules', false),
  ('moderator', 'of-earnings', false),
  ('moderator', 'of-massmessage-stats', false),
  ('moderator', 'of-massmessage-compose', false),
  ('admin', 'of-notifications', true),
  ('admin', 'of-lists', true),
  ('admin', 'of-vault', true),
  ('admin', 'of-fan-search', true),
  ('admin', 'of-script-vault', true),
  ('admin', 'of-schedules', true),
  ('admin', 'of-earnings', true),
  ('admin', 'of-massmessage-stats', true),
  ('admin', 'of-massmessage-compose', true),
  ('content-manager', 'of-notifications', true),
  ('content-manager', 'of-lists', true),
  ('content-manager', 'of-vault', true),
  ('content-manager', 'of-fan-search', true),
  ('content-manager', 'of-script-vault', true),
  ('content-manager', 'of-schedules', true),
  ('content-manager', 'of-earnings', true),
  ('content-manager', 'of-massmessage-stats', true),
  ('content-manager', 'of-massmessage-compose', true)
ON CONFLICT (role, feature_key) DO NOTHING;
