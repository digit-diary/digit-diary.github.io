-- ============================================================
-- Promemoria divisi per settore: i nuovi salvano reparto_dip;
-- i vecchi (NULL) restano visibili in tutti i settori
-- ============================================================

ALTER TABLE promemoria ADD COLUMN IF NOT EXISTS reparto_dip TEXT;
