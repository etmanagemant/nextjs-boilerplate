-- ============================================================================
-- CRM LIVE INBOX - STEP-BY-STEP SETUP
-- ============================================================================
-- Kopiere JEDEN SCHRITT einzeln in Supabase SQL Editor und führe aus!

-- ============================================================================
-- SCHRITT 1: DROP alte Tabellen (falls sie existieren)
-- ============================================================================
DROP TABLE IF EXISTS crm_fan_messages CASCADE;
DROP TABLE IF EXISTS crm_fan_metadata CASCADE;
DROP TABLE IF EXISTS crm_vault_media CASCADE;

-- ============================================================================
-- SCHRITT 2: CREATE crm_fan_messages
-- ============================================================================
CREATE TABLE crm_fan_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatter_id UUID NOT NULL,
  fan_id UUID NOT NULL,
  sender VARCHAR(20) NOT NULL,
  message_text TEXT NOT NULL,
  attached_media_id UUID,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT message_text_not_empty CHECK (LENGTH(TRIM(message_text)) > 0)
);

-- ============================================================================
-- SCHRITT 3: Indices für crm_fan_messages
-- ============================================================================
CREATE INDEX idx_crm_fan_messages_chatter_id ON crm_fan_messages(chatter_id);
CREATE INDEX idx_crm_fan_messages_fan_id ON crm_fan_messages(fan_id);
CREATE INDEX idx_crm_fan_messages_created_at ON crm_fan_messages(created_at);
CREATE INDEX idx_crm_fan_messages_is_read ON crm_fan_messages(is_read);

-- ============================================================================
-- SCHRITT 4: CREATE crm_fan_metadata
-- ============================================================================
CREATE TABLE crm_fan_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatter_id UUID NOT NULL,
  fan_id UUID NOT NULL,
  notes TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  purchase_history TEXT,
  vip_tier VARCHAR(50),
  lifetime_value DECIMAL(10, 2) DEFAULT 0,
  last_interaction TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(chatter_id, fan_id)
);

-- ============================================================================
-- SCHRITT 5: Indices für crm_fan_metadata
-- ============================================================================
CREATE INDEX idx_crm_fan_metadata_chatter_id ON crm_fan_metadata(chatter_id);
CREATE INDEX idx_crm_fan_metadata_fan_id ON crm_fan_metadata(fan_id);

-- ============================================================================
-- SCHRITT 6: CREATE crm_vault_media
-- ============================================================================
CREATE TABLE crm_vault_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatter_id UUID NOT NULL,
  media_url VARCHAR(1000) NOT NULL,
  media_type VARCHAR(50) NOT NULL,
  preview_url VARCHAR(1000),
  file_size_bytes BIGINT,
  mime_type VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT media_url_not_empty CHECK (LENGTH(TRIM(media_url)) > 0)
);

-- ============================================================================
-- SCHRITT 7: Indices für crm_vault_media
-- ============================================================================
CREATE INDEX idx_crm_vault_media_chatter_id ON crm_vault_media(chatter_id);
CREATE INDEX idx_crm_vault_media_media_type ON crm_vault_media(media_type);

-- ============================================================================
-- SCHRITT 8: RLS AKTIVIEREN
-- ============================================================================
ALTER TABLE crm_fan_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_fan_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_vault_media ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SCHRITT 9: crm_fan_messages - SELECT Policy
-- ============================================================================
CREATE POLICY "crm_fan_messages_select" ON crm_fan_messages
FOR SELECT TO authenticated
USING (chatter_id = auth.uid());

-- ============================================================================
-- SCHRITT 10: crm_fan_messages - INSERT Policy
-- ============================================================================
CREATE POLICY "crm_fan_messages_insert" ON crm_fan_messages
FOR INSERT TO authenticated
WITH CHECK (chatter_id = auth.uid());

-- ============================================================================
-- SCHRITT 11: crm_fan_metadata - SELECT Policy
-- ============================================================================
CREATE POLICY "crm_fan_metadata_select" ON crm_fan_metadata
FOR SELECT TO authenticated
USING (chatter_id = auth.uid());

-- ============================================================================
-- SCHRITT 12: crm_fan_metadata - UPDATE/INSERT Policy
-- ============================================================================
CREATE POLICY "crm_fan_metadata_upsert" ON crm_fan_metadata
FOR ALL TO authenticated
USING (chatter_id = auth.uid())
WITH CHECK (chatter_id = auth.uid());

-- ============================================================================
-- SCHRITT 13: crm_vault_media - SELECT Policy
-- ============================================================================
CREATE POLICY "crm_vault_media_select" ON crm_vault_media
FOR SELECT TO authenticated
USING (chatter_id = auth.uid());

-- ============================================================================
-- SCHRITT 14: crm_vault_media - INSERT/UPDATE/DELETE Policy
-- ============================================================================
CREATE POLICY "crm_vault_media_all" ON crm_vault_media
FOR ALL TO authenticated
USING (chatter_id = auth.uid())
WITH CHECK (chatter_id = auth.uid());
