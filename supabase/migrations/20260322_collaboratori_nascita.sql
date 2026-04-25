-- Aggiunge data_nascita ai collaboratori per notifiche compleanno
ALTER TABLE collaboratori ADD COLUMN IF NOT EXISTS data_nascita DATE;
