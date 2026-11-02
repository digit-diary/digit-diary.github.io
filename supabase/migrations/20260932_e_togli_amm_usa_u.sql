-- 02/11/2026 · DECISIONE DEL TITOLARE: l'ufficio si segna con U (Ufficio), gia esistente e gia
-- fra i codici che contano come lavoro. Il codice AMM creato dalla 20260932_d non serve:
-- si toglie, ma solo se nessuna cella del piano lo usa (se qualcuno l'ha gia scritto, resta).
-- Idempotente. Dopo 20260932_d_codice_amm_ufficio.sql.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM piano WHERE upper(codice) = 'AMM') THEN
    DELETE FROM piano_codici WHERE codice = 'AMM' AND descrizione = 'Amministrazione (ufficio)';
    UPDATE piano_regole
       SET valore = array_to_string(array_remove(string_to_array(replace(valore, ' ', ''), ','), 'AMM'), ',')
     WHERE nome = 'codici_lavoro'
       AND 'AMM' = ANY(string_to_array(upper(replace(valore, ' ', '')), ','));
  END IF;
END $$;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260932_e_togli_amm_usa_u')
ON CONFLICT (nome) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
