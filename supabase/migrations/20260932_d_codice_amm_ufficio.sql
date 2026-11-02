-- 01/11/2026 · CODICE AMM (amministrazione / ufficio), decisione del titolare: il responsabile
-- Sicurezza & Sorveglianza fa ufficio nei giorni in cui non e in turno e lo segna con AMM.
-- Se il codice c e gia (scritto a mano in un altro settore) resta com e: niente cambia. Se non
-- c e si crea: giornata di lavoro di 8,2 ore (41 ore su 5 giorni, uguale a ogni percentuale) e
-- si aggiunge ai codici che contano come lavoro (giorni di fila, riposi, domenica non libera),
-- come U (Ufficio) e JG.
-- Idempotente. Dopo 20260932_c_promemoria_senza_settore.sql.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM piano_codici WHERE upper(codice) = 'AMM') THEN
    INSERT INTO piano_codici (codice, descrizione, ore, formula, scala_percentuale, protetto, is_riposo, attivo)
    VALUES ('AMM', 'Amministrazione (ufficio)', 8.2, '41.0/5', false, true, false, true);
    UPDATE piano_regole SET valore = valore || ',AMM'
     WHERE nome = 'codici_lavoro' AND COALESCE(btrim(valore), '') <> ''
       AND NOT ('AMM' = ANY(string_to_array(upper(replace(valore, ' ', '')), ',')));
  END IF;
END $$;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260932_d_codice_amm_ufficio')
ON CONFLICT (nome) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
