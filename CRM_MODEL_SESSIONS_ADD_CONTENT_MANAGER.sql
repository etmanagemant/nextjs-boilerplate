-- Confirmed live via pg_policies: crm_model_sessions has a permissive
-- "true" SELECT policy for any authenticated user (reads already work for
-- everyone), but writes (connect/disconnect a model in the Connection Hub)
-- only go through the "Admin users can access sessions" FOR ALL policy,
-- which checked the literal 'admin' role. Content-manager needs the same
-- write access admin already has here.
DROP POLICY IF EXISTS "Admin users can access sessions" ON crm_model_sessions;
CREATE POLICY "Admin users can access sessions" ON crm_model_sessions
FOR ALL
USING (
  (auth.uid() = '35498c92-2c4d-4720-a6f7-cc187a4c5fc4'::uuid)
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'content-manager')
  )
)
WITH CHECK (
  (auth.uid() = '35498c92-2c4d-4720-a6f7-cc187a4c5fc4'::uuid)
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'content-manager')
  )
);
