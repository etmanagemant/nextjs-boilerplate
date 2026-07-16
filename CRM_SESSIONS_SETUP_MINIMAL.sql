-- ============================================================================
-- CRM SESSIONS SETUP - MINIMAL VERSION (NO DROPS - für nach CRM_INBOX_SETUP)
-- ============================================================================
-- Diese Version hat KEINE DROP Statements weil:
-- - CRM_INBOX_SETUP.sql war schon erfolgreich
-- - Die Tables sind schon frisch erstellt
-- - Nur neue Tables für Sessions brauchen wir

-- CREATE crm_model_sessions
CREATE TABLE IF NOT EXISTS crm_model_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL,
  auth_cookies TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL,
  
  UNIQUE(model_id),
  CONSTRAINT auth_cookies_not_empty CHECK (LENGTH(TRIM(auth_cookies)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_crm_model_sessions_model_id ON crm_model_sessions(model_id);
CREATE INDEX IF NOT EXISTS idx_crm_model_sessions_is_active ON crm_model_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_crm_model_sessions_created_by ON crm_model_sessions(created_by);

-- CREATE crm_chatter_emojis
CREATE TABLE IF NOT EXISTS crm_chatter_emojis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatter_id UUID NOT NULL,
  emoji_list TEXT[] DEFAULT ARRAY['😊', '😂', '🔥', '❤️', '😍', '👏', '🎉'],
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(chatter_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_chatter_emojis_chatter_id ON crm_chatter_emojis(chatter_id);

-- CREATE crm_script_library
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

CREATE INDEX IF NOT EXISTS idx_crm_script_library_is_global ON crm_script_library(is_global);
CREATE INDEX IF NOT EXISTS idx_crm_script_library_assigned_to_user ON crm_script_library(assigned_to_user);
CREATE INDEX IF NOT EXISTS idx_crm_script_library_category ON crm_script_library(category);

-- CREATE crm_session_audit_log
CREATE TABLE IF NOT EXISTS crm_session_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  performed_by UUID NOT NULL,
  ip_address VARCHAR(50),
  user_agent VARCHAR(500),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_session_audit_log_session_id ON crm_session_audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_crm_session_audit_log_performed_by ON crm_session_audit_log(performed_by);

-- ============================================================================
-- DONE - All CRM Session tables created!
-- ============================================================================
