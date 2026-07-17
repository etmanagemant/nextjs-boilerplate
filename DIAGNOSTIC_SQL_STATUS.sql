-- ============================================================================
-- DIAGNOSTIC SQL - STATUS CHECK (SIMPLIFIZIERT - KEINE TYPE-CAST-FEHLER)
-- ============================================================================
-- Diese Version vermeidet TYPE-CASTING-Fehler durch separate Queries

-- ============================================================================
-- 1. TABELLEN-EXISTENZ CHECK
-- ============================================================================
SELECT 
  'TABLE CHECK' as check_type,
  CASE 
    WHEN tablename = 'crm_model_sessions' THEN '✅ crm_model_sessions'
    WHEN tablename = 'crm_fan_messages' THEN '✅ crm_fan_messages'
    WHEN tablename = 'crm_fan_metadata' THEN '✅ crm_fan_metadata'
    WHEN tablename = 'models' THEN '✅ models'
    ELSE '❌ ' || tablename
  END as result
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('crm_model_sessions', 'crm_fan_messages', 'crm_fan_metadata', 'models')
ORDER BY tablename;

-- ============================================================================
-- 2. CONNECTED MODELS OVERVIEW (DIREKT)
-- ============================================================================
SELECT 
  'CONNECTED MODELS' as section,
  COUNT(*) as total_count,
  COUNT(CASE WHEN is_active = true THEN 1 END) as active_count,
  COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_count
FROM crm_model_sessions;

-- ============================================================================
-- 3. ACTIVE MODELS (einfache Query - nur aus crm_model_sessions)
-- ============================================================================
SELECT 
  model_id,
  is_active as connected,
  CASE 
    WHEN auth_cookies IS NULL THEN '❌ NO AUTH'
    WHEN auth_cookies = 'null' THEN '⚠️ NULL STRING'
    WHEN LENGTH(auth_cookies) < 10 THEN '⚠️ TOO SHORT'
    ELSE '✅ HAS AUTH'
  END as auth_status,
  last_verified_at,
  created_at as connection_date,
  EXTRACT(DAY FROM NOW() - last_verified_at) as days_since_verify
FROM crm_model_sessions
ORDER BY is_active DESC, created_at DESC;

-- ============================================================================
-- 4. FAN MESSAGES SUMMARY
-- ============================================================================
SELECT 
  COUNT(*) as total_messages,
  COUNT(DISTINCT chatter_id) as unique_chatters,
  COUNT(DISTINCT fan_id) as unique_fans,
  COUNT(CASE WHEN is_read = false THEN 1 END) as unread_messages
FROM crm_fan_messages;

-- ============================================================================
-- 5. MODELS TABLE COUNT
-- ============================================================================
SELECT 
  COUNT(*) as total_models,
  COUNT(CASE WHEN platform_type = 'onlyfans' THEN 1 END) as onlyfans_count,
  COUNT(CASE WHEN platform_type = 'stripchat' THEN 1 END) as stripchat_count
FROM models;

-- ============================================================================
-- 6. AUTH_COOKIES ANALYSIS (ohne JOIN)
-- ============================================================================
SELECT 
  COUNT(*) as total_sessions,
  COUNT(CASE WHEN auth_cookies IS NOT NULL AND LENGTH(auth_cookies) > 10 THEN 1 END) as has_valid_auth,
  COUNT(CASE WHEN auth_cookies IS NULL OR LENGTH(auth_cookies) < 10 THEN 1 END) as missing_or_invalid_auth
FROM crm_model_sessions;

-- ============================================================================
-- 7. SESSION TYPE ANALYSIS
-- ============================================================================
SELECT 
  CASE 
    WHEN auth_cookies LIKE '{%' THEN 'JSON OBJECT'
    WHEN auth_cookies LIKE '[%' THEN 'JSON ARRAY'
    WHEN auth_cookies LIKE '"sess%' THEN 'AUTH TOKEN'
    ELSE 'OTHER FORMAT'
  END as auth_format,
  COUNT(*) as count
FROM crm_model_sessions
WHERE auth_cookies IS NOT NULL
GROUP BY auth_format;

-- ============================================================================
-- 8. MESSAGES PER DAY (letzte 7 Tage)
-- ============================================================================
SELECT 
  DATE(created_at) as message_date,
  COUNT(*) as message_count,
  COUNT(DISTINCT chatter_id) as chatters,
  COUNT(DISTINCT fan_id) as fans
FROM crm_fan_messages
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY message_date DESC;

-- ============================================================================
-- 9. RLS POLICIES CHECK
-- ============================================================================
SELECT 
  schemaname,
  tablename,
  policyname,
  CASE WHEN permissive = true THEN '✅ ALLOW' ELSE '❌ DENY' END as policy_type
FROM pg_policies
WHERE tablename IN ('crm_model_sessions', 'crm_fan_messages', 'models')
ORDER BY tablename, policyname;

-- ============================================================================
-- 10. DATA TYPE CHECK (model_id in crm_model_sessions)
-- ============================================================================
SELECT 
  column_name,
  data_type,
  CASE 
    WHEN data_type = 'text' THEN 'TEXT (für Webapp-Kompatibilität ✅)'
    WHEN data_type = 'uuid' THEN 'UUID (für Joins ✅)'
    ELSE 'UNKNOWN'
  END as type_info
FROM information_schema.columns
WHERE table_name = 'crm_model_sessions' 
AND column_name = 'model_id';

-- ============================================================================
-- END - Diese Queries vermeiden Type-Cast-Fehler
-- ============================================================================
-- Die wichtigsten Metriken:
-- - active_count sollte > 0 sein
-- - has_valid_auth sollte = active_count sein
-- - total_messages sollte zeigen, ob Nachrichten empfangen wurden

