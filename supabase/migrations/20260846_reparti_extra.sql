-- 20260846_reparti_extra.sql
-- Collaboratori multi-reparto: es. un valet che fa anche turni slots
-- appare nel piano/briefing/generatore di tutti i reparti elencati
-- (CSV, es. 'valet' o 'valet,tavoli'), e le sue ore contano insieme.
ALTER TABLE collaboratori ADD COLUMN IF NOT EXISTS reparti_extra TEXT;
