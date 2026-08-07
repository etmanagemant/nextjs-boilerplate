-- Explizit gewuenscht (2026-08-07): Chatter sollen sich selbst eine
-- Rechnung generieren/herunterladen koennen, Admin soll diese auf der
-- Buchhaltungsseite einsehen koennen. Kein PDF-Binary gespeichert (teuer,
-- unnoetig - die PDF-Route berechnet deterministisch aus denselben Daten
-- neu) - nur ein Log-Eintrag pro Monat+Mitarbeiter, damit Admin sieht WER
-- WANN fuer WELCHEN Monat eine Rechnung gezogen hat.
CREATE TABLE IF NOT EXISTS crm_invoices (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  month_start date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  invoice_number text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month_start)
);

ALTER TABLE crm_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_invoices_select" ON crm_invoices;
CREATE POLICY "crm_invoices_select" ON crm_invoices FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin_tier(auth.uid()));

DROP POLICY IF EXISTS "crm_invoices_insert" ON crm_invoices;
CREATE POLICY "crm_invoices_insert" ON crm_invoices FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR is_admin_tier(auth.uid()));

DROP POLICY IF EXISTS "crm_invoices_update" ON crm_invoices;
CREATE POLICY "crm_invoices_update" ON crm_invoices FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_admin_tier(auth.uid()));
