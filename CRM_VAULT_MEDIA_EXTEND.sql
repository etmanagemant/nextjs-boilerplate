-- ADD storage_path column to track file paths in Supabase Storage
-- Dieses SQL wird benötigt damit handleDelete auch Storage-Dateien löschen kann

ALTER TABLE crm_vault_media ADD COLUMN IF NOT EXISTS 
  storage_path TEXT;

-- Erstelle index für bessere Performance
CREATE INDEX IF NOT EXISTS idx_crm_vault_media_storage_path 
  ON crm_vault_media(storage_path) 
  WHERE storage_path IS NOT NULL;

-- COMMENT für Dokumentation
COMMENT ON COLUMN crm_vault_media.storage_path IS 'Pfad zur Datei in Supabase Storage (format: {user_id}/{timestamp}-{filename})';
