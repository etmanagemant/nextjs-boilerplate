-- Extends crm_onlyfans_sent_log (created directly in Supabase, no
-- checked-in migration for the original table) to also attribute
-- attachment-only messages, which have no text to match against - the
-- existing "gesendet von" overlay only ever matched by message_text, so
-- file-only sends (e.g. from Upload Vault) were never labeled.
-- media_key stores the attached file's stable CDN path (domain +
-- /files/<hash>/<size>_<name>.<ext>, before any signed query string) -
-- the same "stable path survives OnlyFans re-signing the URL" trick
-- already used for vault-picker thumbnail matching elsewhere.
ALTER TABLE crm_onlyfans_sent_log ADD COLUMN IF NOT EXISTS media_key TEXT;

-- message_text was NOT NULL originally (every entry used to be a text
-- message) - a media-only entry now has message_text = NULL and
-- media_key set instead, so the NOT NULL constraint has to go. Safe
-- no-op if it's already nullable.
ALTER TABLE crm_onlyfans_sent_log ALTER COLUMN message_text DROP NOT NULL;
