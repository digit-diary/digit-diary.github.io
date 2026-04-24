-- Promemoria ripetitivi
ALTER TABLE promemoria ADD COLUMN IF NOT EXISTS ripetizione TEXT DEFAULT NULL;
-- Valori: 'giornaliero', 'settimanale', 'mensile', 'semestrale', 'annuale'
