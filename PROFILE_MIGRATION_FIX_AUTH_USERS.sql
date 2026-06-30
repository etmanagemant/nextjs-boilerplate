-- 🔧 NOTFALL-FIX: Erstelle Profiles für alle Auth-Users die kein Profile haben
-- Führe das aus, wenn Benutzer sich nicht in der Management-Liste zeigen

-- 1️⃣ Zeige zuerst alle Auth-Users ohne Profile
SELECT 
  au.id,
  au.email,
  CASE WHEN p.user_id IS NULL THEN '❌ FEHLT' ELSE '✅ OK' END as profile_status
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.user_id
ORDER BY au.created_at DESC;

-- 2️⃣ DANN: Erstelle Profiles für fehlende Users (TIPP: Kopiere `au.id` und `au.email` manuell oder nutze die INSERT-Query unten)
-- Beispiel für EINEN Benutzer:
-- INSERT INTO profiles (user_id, email, full_name, role, provision_rate, created_at, updated_at)
-- VALUES (
--   'PASTE_USER_ID_HERE',
--   'PASTE_EMAIL_HERE', 
--   '',
--   'chatter',
--   20,
--   NOW(),
--   NOW()
-- );

-- 3️⃣ AUTOMATISCHE LÖSUNG: Alle Users ohne Profile erstellen (VORSICHT: Überprüfe vorher mit Query 1️⃣)
INSERT INTO profiles (user_id, email, full_name, role, provision_rate, created_at, updated_at)
SELECT 
  au.id,
  au.email,
  '',
  'chatter',
  20,
  NOW(),
  NOW()
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM profiles p WHERE p.user_id = au.id
)
AND au.id NOT IN ('35498c92-2c4d-4720-a6f7-cc187a4c5fc4')  -- Ignoriere Admin-Test-User
ON CONFLICT (user_id) DO NOTHING;

-- ✅ Überprüfe das Resultat
SELECT 
  COUNT(*) as gesamt_profiles
FROM profiles;

SELECT 
  role,
  COUNT(*) as anzahl
FROM profiles
GROUP BY role
ORDER BY anzahl DESC;
