-- ========================================
-- STORAGE POLICIES - crm-vault-media Bucket
-- ========================================
-- Diese Policies ermöglichen Chattern Dateien zu speichern & zu verwalten
-- Kopiere alles hier rein und klick RUN in Supabase SQL Editor!
-- ========================================

-- ========================================
-- 1️⃣ CREATE BUCKET (falls nicht existiert)
-- ========================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('crm-vault-media', 'crm-vault-media', false)
ON CONFLICT (id) DO NOTHING;

-- ========================================
-- 2️⃣ RLS - LESEN (SELECT)
-- ========================================
-- Jeder authenticated User kann seine eigenen Dateien lesen
CREATE POLICY "crm_vault_media_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'crm-vault-media'
  AND (storage.foldername(name))[1]::uuid = auth.uid()
);

-- ========================================
-- 3️⃣ RLS - UPLOAD (INSERT)
-- ========================================
-- Jeder authenticated User kann Dateien hochladen (in seinen Ordner)
CREATE POLICY "crm_vault_media_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'crm-vault-media'
  AND (storage.foldername(name))[1]::uuid = auth.uid()
);

-- ========================================
-- 4️⃣ RLS - DELETE
-- ========================================
-- Jeder authenticated User kann nur seine eigenen Dateien löschen
CREATE POLICY "crm_vault_media_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'crm-vault-media'
  AND (storage.foldername(name))[1]::uuid = auth.uid()
);

-- ========================================
-- 5️⃣ RLS - UPDATE
-- ========================================
-- Jeder authenticated User kann nur seine eigenen Dateien aktualisieren
CREATE POLICY "crm_vault_media_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'crm-vault-media'
  AND (storage.foldername(name))[1]::uuid = auth.uid()
)
WITH CHECK (
  bucket_id = 'crm-vault-media'
  AND (storage.foldername(name))[1]::uuid = auth.uid()
);

-- ========================================
-- 6️⃣ OPTIONAL: Admin überschreiben
-- ========================================
-- Admins können ALLE Dateien im Bucket verwalten
-- Kommentiere aus wenn Admin-Override nicht nötig ist

-- CREATE POLICY "crm_vault_media_admin_select" ON storage.objects
-- FOR SELECT TO authenticated
-- USING (
--   bucket_id = 'crm-vault-media'
--   AND EXISTS (
--     SELECT 1 FROM auth.users WHERE auth.uid() = id AND raw_user_meta_data->>'role' = 'admin'
--   )
-- );

-- ========================================
-- NOTIZEN FÜR UPLOAD IMPLEMENTATION
-- ========================================
-- 1. Dateien sollten mit Folder-Struktur hochgeladen werden:
--    crm-vault-media/{user_id}/{filename}
--    Beispiel: crm-vault-media/550e8400-e29b-41d4-a716-446655440000/my-image.jpg
--
-- 2. RLS Policies überprüfen Folder-Name gegen auth.uid()
--
-- 3. Zu UploadVaultClient.tsx hinzufügen:
--    const folderPath = `${user.id}/${file.name}`;
--    await supabase.storage
--      .from('crm-vault-media')
--      .upload(folderPath, file);
--
-- 4. Media URL wird dann:
--    https://your-supabase-url/storage/v1/object/public/crm-vault-media/{user_id}/{filename}
