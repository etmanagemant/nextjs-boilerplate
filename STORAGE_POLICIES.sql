-- SUPABASE STORAGE POLICIES für reddit_content Bucket
-- Diese Policies erlauben PUBLIC Read/Write Zugriff

-- Policy 1: Alle können Dateien LESEN (SELECT)
CREATE POLICY "Public Read Access" ON storage.objects
FOR SELECT
USING (bucket_id = 'reddit_content');

-- Policy 2: Alle können Dateien HOCHLADEN (INSERT)
CREATE POLICY "Public Upload Access" ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'reddit_content');

-- Policy 3: Alle können Dateien LÖSCHEN (DELETE)
CREATE POLICY "Public Delete Access" ON storage.objects
FOR DELETE
USING (bucket_id = 'reddit_content');

-- Policy 4: Alle können Dateien UPDATEN (UPDATE)
CREATE POLICY "Public Update Access" ON storage.objects
FOR UPDATE
USING (bucket_id = 'reddit_content')
WITH CHECK (bucket_id = 'reddit_content');
