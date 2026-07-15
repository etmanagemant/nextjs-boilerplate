-- ============================================================================
-- CRM_SESSIONS_SETUP - SCHRITT FÜR SCHRITT ANLEITUNG
-- ============================================================================
-- Führe JEDEN Block einzeln aus (kopieren → Supabase SQL Editor → "Run" klicken)
-- Warte, dass ein Block erfolgreich durchläuft, bevor du den nächsten startest!

-- ============================================================================
-- SCHRITT 1: CRM Model Sessions Tabelle erstellen
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_model_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  auth_cookies TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL,
  
  UNIQUE(model_id),
  CONSTRAINT auth_cookies_not_empty CHECK (LENGTH(TRIM(auth_cookies)) > 0)
);

-- STOP HIER! ✋ Bitte Erfolg bestätigen, bevor du weitermachst.


-- ============================================================================
-- SCHRITT 2: Indices für crm_model_sessions erstellen
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_crm_model_sessions_model_id ON crm_model_sessions(model_id);
CREATE INDEX IF NOT EXISTS idx_crm_model_sessions_is_active ON crm_model_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_crm_model_sessions_created_by ON crm_model_sessions(created_by);

-- STOP HIER! ✋ Bitte Erfolg bestätigen, bevor du weitermachst.


-- ============================================================================
-- SCHRITT 3: CRM Chatter Emojis Tabelle erstellen
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_chatter_emojis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatter_id UUID NOT NULL,
  emoji_list TEXT[] DEFAULT ARRAY['😊', '😂', '🔥', '❤️', '😍', '👏', '🎉'],
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(chatter_id)
);

-- STOP HIER! ✋ Bitte Erfolg bestätigen, bevor du weitermachst.


-- ============================================================================
-- SCHRITT 4: Index für crm_chatter_emojis erstellen
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_crm_chatter_emojis_chatter_id ON crm_chatter_emojis(chatter_id);

-- STOP HIER! ✋ Bitte Erfolg bestätigen, bevor du weitermachst.


-- ============================================================================
-- SCHRITT 5: CRM Script Library Tabelle erstellen
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_script_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  script_content TEXT NOT NULL,
  category VARCHAR(100),
  is_global BOOLEAN DEFAULT true,
  assigned_to_user UUID,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT title_not_empty CHECK (LENGTH(TRIM(title)) > 0),
  CONSTRAINT script_not_empty CHECK (LENGTH(TRIM(script_content)) > 0)
);

-- STOP HIER! ✋ Bitte Erfolg bestätigen, bevor du weitermachst.


-- ============================================================================
-- SCHRITT 6: Indices für crm_script_library erstellen
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_crm_script_library_is_global ON crm_script_library(is_global);
CREATE INDEX IF NOT EXISTS idx_crm_script_library_assigned_to_user ON crm_script_library(assigned_to_user);
CREATE INDEX IF NOT EXISTS idx_crm_script_library_category ON crm_script_library(category);

-- STOP HIER! ✋ Bitte Erfolg bestätigen, bevor du weitermachst.


-- ============================================================================
-- SCHRITT 7: CRM Session Audit Log Tabelle erstellen
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_session_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES crm_model_sessions(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  performed_by UUID NOT NULL,
  ip_address VARCHAR(50),
  user_agent VARCHAR(500),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- STOP HIER! ✋ Bitte Erfolg bestätigen, bevor du weitermachst.


-- ============================================================================
-- SCHRITT 8: Indices für crm_session_audit_log erstellen
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_crm_session_audit_log_session_id ON crm_session_audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_crm_session_audit_log_performed_by ON crm_session_audit_log(performed_by);

-- STOP HIER! ✋ Bitte Erfolg bestätigen, bevor du weitermachst.


-- ============================================================================
-- SCHRITT 9: RLS aktivieren
-- ============================================================================

ALTER TABLE crm_model_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_chatter_emojis ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_script_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_session_audit_log ENABLE ROW LEVEL SECURITY;

-- STOP HIER! ✋ Bitte Erfolg bestätigen, bevor du weitermachst.


-- ============================================================================
-- SCHRITT 10: RLS Policy für crm_model_sessions (SELECT)
-- ============================================================================

CREATE POLICY "crm_model_sessions_select" 
ON crm_model_sessions FOR SELECT 
TO authenticated 
USING (true);

-- STOP HIER! ✋ Bitte Erfolg bestätigen, bevor du weitermachst.


-- ============================================================================
-- SCHRITT 11: RLS Policy für crm_model_sessions (INSERT, UPDATE, DELETE)
-- ============================================================================

CREATE POLICY "crm_model_sessions_modify" 
ON crm_model_sessions FOR ALL 
TO authenticated 
USING (true)
WITH CHECK (true);

-- STOP HIER! ✋ Bitte Erfolg bestätigen, bevor du weitermachst.


-- ============================================================================
-- SCHRITT 12: RLS Policies für crm_chatter_emojis
-- ============================================================================

CREATE POLICY "crm_chatter_emojis_select" 
ON crm_chatter_emojis FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "crm_chatter_emojis_modify" 
ON crm_chatter_emojis FOR ALL 
TO authenticated 
USING (true)
WITH CHECK (true);

-- STOP HIER! ✋ Bitte Erfolg bestätigen, bevor du weitermachst.


-- ============================================================================
-- SCHRITT 13: RLS Policies für crm_script_library
-- ============================================================================

CREATE POLICY "crm_script_library_select" 
ON crm_script_library FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "crm_script_library_modify" 
ON crm_script_library FOR ALL 
TO authenticated 
USING (true)
WITH CHECK (true);

-- STOP HIER! ✋ Bitte Erfolg bestätigen, bevor du weitermachst.


-- ============================================================================
-- SCHRITT 14: RLS Policy für crm_session_audit_log
-- ============================================================================

CREATE POLICY "crm_session_audit_log_select" 
ON crm_session_audit_log FOR SELECT 
TO authenticated 
USING (true);

-- ✅ FERTIG! Alle 14 Schritte sollten erfolgreich sein.

-- ============================================================================
-- Verifizierung: Führe diese Queries aus, um zu sehen, dass alles erstellt wurde
-- ============================================================================

SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'crm_%';

-- Du solltest 4 Tabellen sehen:
-- - crm_model_sessions
-- - crm_chatter_emojis
-- - crm_script_library
-- - crm_session_audit_log
