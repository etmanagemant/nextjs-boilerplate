-- ============================================================================
-- FIX: Korrigiere Type-Casting-Fehler in crm_model_sessions
-- ============================================================================
-- Diese Migration behebt das Problem, dass model_id als TEXT statt UUID
-- gespeichert wurde, was zu JOIN-Fehlern führt.

-- ============================================================================
-- SCHRITT 1: Backup der aktuellen Daten
-- ============================================================================
-- (Falls etwas schiefgeht, kannst du hier zurück)
CREATE TABLE IF NOT EXISTS crm_model_sessions_backup AS
SELECT * FROM crm_model_sessions;

-- ============================================================================
-- SCHRITT 2: Alte Tabelle löschen
-- ============================================================================
DROP TABLE IF EXISTS crm_model_sessions CASCADE;

-- ============================================================================
-- SCHRITT 3: Neue Tabelle mit korrekten Types erstellen
-- ============================================================================
CREATE TABLE crm_model_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL,  -- ← WICHTIG: UUID statt TEXT!
  auth_cookies TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL,
  
  UNIQUE(model_id),
  CONSTRAINT auth_cookies_not_empty CHECK (LENGTH(TRIM(auth_cookies)) > 0),
  CONSTRAINT fk_model_id FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
);

-- ============================================================================
-- SCHRITT 4: Indices neu erstellen
-- ============================================================================
CREATE INDEX idx_crm_model_sessions_model_id ON crm_model_sessions(model_id);
CREATE INDEX idx_crm_model_sessions_is_active ON crm_model_sessions(is_active);
CREATE INDEX idx_crm_model_sessions_created_by ON crm_model_sessions(created_by);

-- ============================================================================
-- SCHRITT 5: Daten zurück migrieren (falls vorhanden)
-- ============================================================================
-- Wenn die alte Tabelle Daten hatte, versuche sie zu migrieren
INSERT INTO crm_model_sessions (id, model_id, auth_cookies, is_active, last_verified_at, created_at, updated_at, created_by)
SELECT 
  id,
  model_id::uuid,  -- ← Cast zu UUID
  auth_cookies,
  is_active,
  last_verified_at,
  created_at,
  updated_at,
  created_by::uuid
FROM crm_model_sessions_backup
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SCHRITT 6: Enable RLS (falls benötigt)
-- ============================================================================
ALTER TABLE crm_model_sessions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SCHRITT 7: Überprüfung
-- ============================================================================
SELECT 
  COUNT(*) as total_sessions,
  COUNT(CASE WHEN is_active = true THEN 1 END) as active_sessions
FROM crm_model_sessions;

-- ============================================================================
-- INFO: Falls etwas schiefgeht...
-- ============================================================================
-- Um zurückzurollen:
-- DROP TABLE crm_model_sessions;
-- ALTER TABLE crm_model_sessions_backup RENAME TO crm_model_sessions;
