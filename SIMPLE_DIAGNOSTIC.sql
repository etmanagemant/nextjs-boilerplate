-- ============================================================================
-- KORREKTES DIAGNOSTIC SCRIPT (basierend auf echtem Code)
-- ============================================================================

-- 1️⃣ Table Info
SELECT 'TABLES' as info;
SELECT 
  schemaname,
  tablename
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('crm_model_sessions', 'crm_fan_messages', 'models', 'crm_fan_metadata')
ORDER BY tablename;

-- 2️⃣ crm_model_sessions - Connected Models Count
SELECT 
  'crm_model_sessions' as table_name,
  COUNT(*) as total,
  COUNT(CASE WHEN is_active = true THEN 1 END) as active,
  COUNT(CASE WHEN is_active = false THEN 1 END) as inactive
FROM crm_model_sessions;

-- 3️⃣ Active Sessions Detail
SELECT 
  model_id,
  id as session_id,
  is_active,
  CASE 
    WHEN auth_cookies IS NOT NULL THEN 'HAS_AUTH'
    ELSE 'NO_AUTH'
  END as auth_status,
  created_at,
  last_verified_at
FROM crm_model_sessions
ORDER BY is_active DESC, created_at DESC
LIMIT 20;

-- 4️⃣ crm_fan_messages - Messages Count
SELECT 
  'crm_fan_messages' as table_name,
  COUNT(*) as total_messages,
  COUNT(DISTINCT chatter_id) as unique_chatters,
  COUNT(DISTINCT fan_id) as unique_fans,
  COUNT(CASE WHEN is_read = false THEN 1 END) as unread
FROM crm_fan_messages;

-- 5️⃣ Fan Messages Recent Activity
SELECT 
  DATE(created_at) as day,
  COUNT(*) as messages,
  COUNT(DISTINCT fan_id) as fans
FROM crm_fan_messages
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY day DESC;

-- 6️⃣ models Table - OnlyFans
SELECT 
  'models' as table_name,
  COUNT(*) as total,
  COUNT(CASE WHEN platform_type = 'onlyfans' THEN 1 END) as onlyfans,
  COUNT(CASE WHEN platform_type = 'stripchat' THEN 1 END) as stripchat
FROM models;

-- 7️⃣ Model Details
SELECT 
  id,
  name,
  platform_type
FROM models
WHERE platform_type = 'onlyfans'
LIMIT 10;

-- 8️⃣ crm_fan_metadata Count
SELECT 
  'crm_fan_metadata' as table_name,
  COUNT(*) as total,
  COUNT(DISTINCT chatter_id) as chatters
FROM crm_fan_metadata;

-- 9️⃣ Sample Message Data
SELECT 
  fan_id,
  chatter_id,
  external_message_id,
  sender,
  SUBSTRING(message_text, 1, 50) as message_preview,
  is_read,
  created_at
FROM crm_fan_messages
ORDER BY created_at DESC
LIMIT 5;
