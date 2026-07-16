-- ============================================================================
-- CRM INBOX SETUP - SAFE VERSION (ohne RLS am Anfang)
-- ============================================================================

-- SCHRITT 1: DROP alte Tabellen
DROP TABLE IF EXISTS crm_vault_media CASCADE;
DROP TABLE IF EXISTS crm_fan_metadata CASCADE;
DROP TABLE IF EXISTS crm_fan_messages CASCADE;

-- SCHRITT 2: CREATE crm_fan_messages
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

CREATE INDEX idx_crm_fan_messages_chatter_id ON crm_fan_messages(chatter_id);
CREATE INDEX idx_crm_fan_messages_fan_id ON crm_fan_messages(fan_id);
CREATE INDEX idx_crm_fan_messages_created_at ON crm_fan_messages(created_at);
CREATE INDEX idx_crm_fan_messages_is_read ON crm_fan_messages(is_read);

-- SCHRITT 3: CREATE crm_fan_metadata
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

CREATE INDEX idx_crm_fan_metadata_chatter_id ON crm_fan_metadata(chatter_id);
CREATE INDEX idx_crm_fan_metadata_fan_id ON crm_fan_metadata(fan_id);

-- SCHRITT 4: CREATE crm_vault_media
CREATE TABLE crm_vault_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatter_id UUID NOT NULL,
  media_url VARCHAR(1000) NOT NULL,
  media_type VARCHAR(50) NOT NULL,
  preview_url VARCHAR(1000),
  file_size_bytes BIGINT,
  mime_type VARCHAR(100),
  storage_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT media_url_not_empty CHECK (LENGTH(TRIM(media_url)) > 0)
);

CREATE INDEX idx_crm_vault_media_chatter_id ON crm_vault_media(chatter_id);
CREATE INDEX idx_crm_vault_media_media_type ON crm_vault_media(media_type);
CREATE INDEX idx_crm_vault_media_storage_path ON crm_vault_media(storage_path) WHERE storage_path IS NOT NULL;

-- ============================================================================
-- DONE - All tables created successfully!
-- RLS Policies can be added separately if needed
-- ============================================================================
