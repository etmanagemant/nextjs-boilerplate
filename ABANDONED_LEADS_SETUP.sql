-- ============================================================================
-- ABANDONED_LEADS TABLE SETUP
-- Tabelle für abgebrochene Bewerbungen (Leads, die das Formular nicht fertiggestellt haben)
-- ============================================================================

CREATE TABLE IF NOT EXISTS abandoned_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  birthday DATE,
  category VARCHAR(100),
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  abandoned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  form_data JSONB DEFAULT '{}',
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indizes für bessere Performance
CREATE INDEX IF NOT EXISTS idx_abandoned_leads_abandoned_at ON abandoned_leads(abandoned_at DESC);
CREATE INDEX IF NOT EXISTS idx_abandoned_leads_phone ON abandoned_leads(phone);
CREATE INDEX IF NOT EXISTS idx_abandoned_leads_email ON abandoned_leads(email);

-- RLS (Row Level Security) deaktivieren, damit API darauf zugreifen kann
ALTER TABLE abandoned_leads DISABLE ROW LEVEL SECURITY;

-- Grant Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON abandoned_leads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON abandoned_leads TO authenticated;
