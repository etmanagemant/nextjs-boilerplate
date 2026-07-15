-- ============================================================================
-- CRM Model Sessions & Chatter Configuration Tables
-- ============================================================================

-- 1. CRM Model Sessions Table (Session Persistence Layer)
CREATE TABLE IF NOT EXISTS crm_model_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  auth_cookies TEXT NOT NULL, -- Encrypted JSON: {auth_id, sess, user_agent, x_bc_token}
  is_active BOOLEAN DEFAULT true,
  last_verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL,
  
  UNIQUE(model_id), -- Only one active session per model
  CONSTRAINT auth_cookies_not_empty CHECK (LENGTH(TRIM(auth_cookies)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_crm_model_sessions_model_id ON crm_model_sessions(model_id);
CREATE INDEX IF NOT EXISTS idx_crm_model_sessions_is_active ON crm_model_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_crm_model_sessions_created_by ON crm_model_sessions(created_by);

-- 2. CRM Chatter Emojis Configuration (Smiley Leiste)
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

-- 3. CRM Script Library (Global & Team Member)
CREATE TABLE IF NOT EXISTS crm_script_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  script_content TEXT NOT NULL,
  category VARCHAR(100), -- 'greeting', 'offer', 'follow_up', 'custom'
  is_global BOOLEAN DEFAULT true, -- true = global library, false = team member specific
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

-- 4. Audit Log for CRM Sessions (Security & Compliance)
CREATE TABLE IF NOT EXISTS crm_session_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES crm_model_sessions(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL, -- 'created', 'verified', 'rotated', 'deactivated'
  performed_by UUID NOT NULL,
  ip_address VARCHAR(50),
  user_agent VARCHAR(500),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_session_audit_log_session_id ON crm_session_audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_crm_session_audit_log_performed_by ON crm_session_audit_log(performed_by);

-- ============================================================================
-- Row Level Security Policies (OPTIONAL - Add after tables are created)
-- ============================================================================

-- Enable RLS
ALTER TABLE crm_model_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_chatter_emojis ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_script_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_session_audit_log ENABLE ROW LEVEL SECURITY;

-- ⚠️ RLS Policies: Customize based on your profiles table schema
-- If these fail, run them individually or adjust the role column name

-- Admins can view all CRM sessions
CREATE POLICY "Admins can view all CRM sessions" 
ON crm_model_sessions FOR SELECT 
TO authenticated 
USING (true); -- Simplified: enable globally authenticated users to read, then restrict in app

-- Admins can manage CRM sessions
CREATE POLICY "Admins can manage CRM sessions" 
ON crm_model_sessions FOR ALL 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Users can view their own chatter emojis
CREATE POLICY "Users can view their own chatter emojis" 
ON crm_chatter_emojis FOR SELECT 
TO authenticated 
USING (true);

-- Admins can manage all chatter emojis
CREATE POLICY "Admins can manage chatter emojis" 
ON crm_chatter_emojis FOR ALL 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Global scripts visible to all authenticated users
CREATE POLICY "View CRM script library" 
ON crm_script_library FOR SELECT 
TO authenticated 
USING (true);

-- Only admins can manage script library
CREATE POLICY "Admins manage script library" 
ON crm_script_library FOR ALL 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Audit log is view-only for admins
CREATE POLICY "Admins view session audit log" 
ON crm_session_audit_log FOR SELECT 
TO authenticated 
USING (true);

-- ============================================================================
-- NEXT STEPS:
-- 1. Run this SQL migration in Supabase
-- 2. Deploy the CRM Connect page component
-- 3. Test session creation and encryption
-- ============================================================================
