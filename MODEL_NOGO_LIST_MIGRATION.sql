-- Model-CRM: strukturierte No-Go-Liste zusaetzlich zu den freien
-- Model-Notizen (2026-08-07, explizit gewuenscht - "nicht nur Notizen").
-- Gleiche Idee wie Fan CRM's preferences: einfaches text[]-Array statt
-- eigener Tabelle, da nur Admin schreibt und alle Chatter lesen.
ALTER TABLE models ADD COLUMN IF NOT EXISTS no_go_list text[] DEFAULT '{}';
