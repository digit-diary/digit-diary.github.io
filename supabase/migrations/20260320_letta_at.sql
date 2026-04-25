-- Aggiunge colonna letta_at a note_colleghi per tracciare orario lettura
ALTER TABLE note_colleghi ADD COLUMN IF NOT EXISTS letta_at TIMESTAMPTZ;
