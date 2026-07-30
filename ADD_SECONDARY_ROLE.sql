-- Task #80: a user can hold a second role at the same time (currently only
-- Chatter + Moderator combos are exposed in the UI - see RoleSelect.tsx).
-- profiles.role stays the "primary" role (used everywhere existing
-- role === "x" checks already work); secondary_role is purely additive so
-- none of those existing checks need to change, only the specific places
-- that need "has role X" semantics (Stechuhr dual-clock-in, see lib/roles.ts
-- hasRole()).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS secondary_role VARCHAR(50) DEFAULT NULL;
