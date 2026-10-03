-- v362 · TIPI DI BUONO PERSONALIZZABILI (Impostazioni > Maison, solo admin)
-- Prima il tipo di buono di una registrazione Maison poteva essere solo BU, BL,
-- CG o WL (20260344). Ora l amministratore puo aggiungere tipi nuovi: il database
-- accetta ogni sigla valida (da 2 a 6 lettere o cifre, inizia con una lettera),
-- la stessa regola del programma. Le registrazioni esistenti restano valide.

ALTER TABLE costi_maison DROP CONSTRAINT IF EXISTS costi_maison_tipo_buono_check;
ALTER TABLE costi_maison ADD CONSTRAINT costi_maison_tipo_buono_check
  CHECK (tipo_buono IS NULL OR tipo_buono = '' OR tipo_buono ~ '^[A-Z][A-Z0-9]{1,5}$');

NOTIFY pgrst, 'reload schema';
