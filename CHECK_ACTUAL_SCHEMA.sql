-- ============================================================================
-- SCHEMA ANALYSE - WAS IST WIRKLICH IN DER DATENBANK?
-- ============================================================================

-- 1. Exact Column Types in crm_model_sessions
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'crm_model_sessions'
ORDER BY ordinal_position;

-- 2. Exact Column Types in models
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'models'
ORDER BY ordinal_position;

-- 3. Exact Column Types in crm_fan_messages
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'crm_fan_messages'
ORDER BY ordinal_position;

-- 4. Count of data in each table
SELECT 
  'crm_model_sessions' as table_name,
  COUNT(*) as row_count
FROM crm_model_sessions
UNION ALL
SELECT 
  'crm_fan_messages',
  COUNT(*)
FROM crm_fan_messages
UNION ALL
SELECT 
  'models',
  COUNT(*)
FROM models;

-- 5. Sample data from crm_model_sessions (first 5 rows)
SELECT 
  id,
  model_id,
  is_active,
  OCTET_LENGTH(auth_cookies::text) as auth_length,
  created_at
FROM crm_model_sessions
LIMIT 5;

-- 6. Sample model_id values and their types
SELECT 
  model_id,
  TYPEOF(model_id) as type_check,
  is_active,
  SUBSTRING(auth_cookies::text, 1, 30) as auth_preview
FROM crm_model_sessions
LIMIT 10;

-- 7. Foreign Key Constraints
SELECT 
  constraint_name,
  table_name,
  column_name,
  referenced_table_name,
  referenced_column_name
FROM information_schema.key_column_usage
WHERE table_name IN ('crm_model_sessions', 'crm_fan_messages')
AND referenced_table_name IS NOT NULL;

-- 8. Are there any Indexes?
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('crm_model_sessions', 'crm_fan_messages', 'models')
ORDER BY tablename;

-- 9. All constraints in crm_model_sessions
SELECT 
  constraint_type,
  constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'crm_model_sessions';
