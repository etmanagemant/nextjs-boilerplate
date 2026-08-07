-- TEMPORAER, NUR ZUM SOFORTIGEN ENTSPERREN (2026-08-07) - macht die
-- RLS-Sperre von eben rueckgaengig, damit die Webapp sofort wieder
-- funktioniert, waehrend wir den echten Grund in Ruhe finden. Danach
-- unbedingt wieder durch eine korrekte Policy ersetzen, nicht dauerhaft
-- so lassen (das oeffnet wieder die Datenlecks von vorhin).
alter table profiles disable row level security;
alter table shift_assignments disable row level security;
alter table chatter_revenues disable row level security;
alter table crm_onlyfans_sent_log disable row level security;
alter table models disable row level security;
