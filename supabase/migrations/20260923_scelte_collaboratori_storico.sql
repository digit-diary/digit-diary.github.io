-- ============================================================
-- STORICO DELLE SCELTE DEI COLLABORATORI SUL PIANO (15/10/2026)
-- Le scelte di una persona (solo notti, solo diurni, giorni di lavoro, giorni a settimana,
-- turni solo a mano) sono spunte che si mettono per qualche mese e poi si tolgono. Il
-- Benessere e Controlla le regole sui mesi passati devono giudicare ogni giorno con la
-- scelta valida QUEL giorno, non con quella di oggi.
--  1) tabella collab_scelte_storico: una riga per ogni cambio (persona, scelta, valore,
--     valore di prima, valido dal giorno). Nessuna lettura o scrittura diretta.
--  2) trigger su collaboratori: registra DA SOLO ogni cambio di quelle colonne, da
--     qualsiasi strada (Preferenze, Annulla/Ripristina, import, script del server).
--  3) leggi_scelte_storico(p_token): le righe dei collaboratori che l operatore vede
--     (stesso ambito della lista collaboratori).
--  4) storico iniziale dal registro (log_attivita "Piano: preferenza collaboratore", anche
--     annullate e ripristinate; il registro dice persona e scelta, non il valore): la scelta
--     di oggi vale dal giorno dell ultimo cambio registrato. Spunte si/no: prima valeva il
--     contrario se i cambi sono dispari, come oggi se sono pari (nessuna riga). Giorni di
--     lavoro / a settimana: prima "nessuna scelta"; una scelta gia tolta non si ricostruisce.
--     Chi non ha cambi nel registro: la scelta di oggi vale da sempre.
-- Funzioni nuove: 2 (_collab_scelte_registra, leggi_scelte_storico). Rilanciabile.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.collab_scelte_storico (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  collaboratore_id BIGINT NOT NULL,
  collaboratore TEXT NOT NULL,
  campo TEXT NOT NULL CHECK (campo IN ('solo_notti', 'solo_diurni', 'giorni_lavoro', 'giorni_settimana',
                                       'turni_solo_a_mano')),
  valore TEXT NOT NULL DEFAULT '',
  valore_prima TEXT NOT NULL DEFAULT '',
  valido_dal DATE NOT NULL,
  operatore TEXT,
  origine TEXT NOT NULL DEFAULT 'salvataggio' CHECK (origine IN ('salvataggio', 'registro')),
  quando TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collab_scelte_storico_idx
  ON public.collab_scelte_storico (collaboratore_id, campo, valido_dal, id);
COMMENT ON TABLE public.collab_scelte_storico IS
  'Cambi delle scelte del piano dei collaboratori (valore: true/false, giorni "5,6", numero o vuoto). La scrive solo il trigger su collaboratori; si legge con leggi_scelte_storico.';
ALTER TABLE public.collab_scelte_storico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.collab_scelte_storico FROM PUBLIC, anon, authenticated;

-- valori in forma di testo: booleani true/false, giorni senza spazi, numero o vuoto
CREATE OR REPLACE FUNCTION public._collab_scelte_registra()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_dal DATE := (now() AT TIME ZONE 'Europe/Zurich')::date;
  v_op TEXT := NULLIF(current_setting('diario.operatore', true), '');
  v_campo TEXT;
  v_prima TEXT;
  v_dopo TEXT;
BEGIN
  FOREACH v_campo IN ARRAY ARRAY['solo_notti', 'solo_diurni', 'giorni_lavoro', 'giorni_settimana', 'turni_solo_a_mano']
  LOOP
    CASE v_campo
      WHEN 'solo_notti' THEN
        v_prima := COALESCE(OLD.solo_notti, false)::text; v_dopo := COALESCE(NEW.solo_notti, false)::text;
      WHEN 'solo_diurni' THEN
        v_prima := COALESCE(OLD.solo_diurni, false)::text; v_dopo := COALESCE(NEW.solo_diurni, false)::text;
      WHEN 'turni_solo_a_mano' THEN
        v_prima := COALESCE(OLD.turni_solo_a_mano, false)::text;
        v_dopo := COALESCE(NEW.turni_solo_a_mano, false)::text;
      WHEN 'giorni_lavoro' THEN
        v_prima := replace(COALESCE(OLD.giorni_lavoro, ''), ' ', '');
        v_dopo := replace(COALESCE(NEW.giorni_lavoro, ''), ' ', '');
      ELSE
        v_prima := COALESCE(NULLIF(OLD.giorni_settimana, 0)::text, '');
        v_dopo := COALESCE(NULLIF(NEW.giorni_settimana, 0)::text, '');
    END CASE;
    IF v_prima IS DISTINCT FROM v_dopo THEN
      INSERT INTO collab_scelte_storico (collaboratore_id, collaboratore, campo, valore, valore_prima, valido_dal,
                                         operatore)
      VALUES (NEW.id, NEW.nome, v_campo, v_dopo, v_prima, v_dal, v_op);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._collab_scelte_registra() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS collab_scelte_storico_trg ON public.collaboratori;
CREATE TRIGGER collab_scelte_storico_trg
  AFTER UPDATE OF solo_notti, solo_diurni, giorni_lavoro, giorni_settimana, turni_solo_a_mano
  ON public.collaboratori
  FOR EACH ROW EXECUTE FUNCTION public._collab_scelte_registra();

-- lettura: chiunque abbia una sessione, solo per i collaboratori che vede
CREATE OR REPLACE FUNCTION public.leggi_scelte_storico(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_res JSON;
BEGIN
  IF _validate_op_session(p_token) IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  EXECUTE 'SELECT COALESCE(json_agg(json_build_object(''id'', s.id, ''collaboratore_id'', s.collaboratore_id,'
       || ' ''collaboratore'', s.collaboratore, ''campo'', s.campo, ''valore'', s.valore,'
       || ' ''valore_prima'', s.valore_prima, ''valido_dal'', s.valido_dal, ''operatore'', s.operatore,'
       || ' ''origine'', s.origine, ''quando'', s.quando) ORDER BY s.collaboratore_id, s.campo, s.valido_dal, s.id),'
       || ' ''[]''::json) FROM collab_scelte_storico s'
       || ' WHERE s.collaboratore_id IN (SELECT id FROM collaboratori WHERE true' || _ambito_collaboratori(p_token) || ')'
    INTO v_res;
  RETURN v_res;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.leggi_scelte_storico(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leggi_scelte_storico(text) TO anon, authenticated, service_role;

-- STORICO INIZIALE dal registro (solo la prima volta: se la tabella e vuota)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM collab_scelte_storico) THEN
    RETURN;
  END IF;
  WITH cambi AS (
    -- "Nome Cognome campo", anche dentro "Annullata/Ripristinata azione · Piano: preferenza collaboratore · ..."
    SELECT regexp_replace(l.dettaglio, '^.*Piano: preferenza collaboratore · ', '') AS testo, l.created_at
      FROM log_attivita l
     WHERE l.azione = 'Piano: preferenza collaboratore'
        OR (l.azione IN ('Annullata azione', 'Ripristinata azione')
            AND l.dettaglio LIKE 'Piano: preferenza collaboratore · %')
  ), ultimo AS (
    SELECT c.id, c.nome, k.campo, max((x.created_at AT TIME ZONE 'Europe/Zurich')::date) AS dal, count(*) AS n
      FROM cambi x
      JOIN collaboratori c ON x.testo LIKE c.nome || ' %'
      CROSS JOIN unnest(ARRAY['solo_notti', 'solo_diurni', 'giorni_lavoro', 'giorni_settimana',
                              'turni_solo_a_mano']) AS k(campo)
     WHERE x.testo = c.nome || ' ' || k.campo
     GROUP BY c.id, c.nome, k.campo
  ), adesso AS (
    SELECT u.id, u.nome, u.campo, u.dal, u.n,
           CASE u.campo
             WHEN 'solo_notti' THEN COALESCE(c.solo_notti, false)::text
             WHEN 'solo_diurni' THEN COALESCE(c.solo_diurni, false)::text
             WHEN 'turni_solo_a_mano' THEN COALESCE(c.turni_solo_a_mano, false)::text
             WHEN 'giorni_lavoro' THEN replace(COALESCE(c.giorni_lavoro, ''), ' ', '')
             ELSE COALESCE(NULLIF(c.giorni_settimana, 0)::text, '')
           END AS valore
      FROM ultimo u JOIN collaboratori c ON c.id = u.id
  )
  INSERT INTO collab_scelte_storico (collaboratore_id, collaboratore, campo, valore, valore_prima, valido_dal, origine,
                                     quando)
  SELECT a.id, a.nome, a.campo, a.valore,
         CASE WHEN a.campo IN ('solo_notti', 'solo_diurni', 'turni_solo_a_mano')
              THEN (NOT a.valore::boolean)::text ELSE '' END,
         a.dal, 'registro', now()
    FROM adesso a
   -- spunte si/no: ogni riga del registro e un cambio (anche Annulla e Ripristina), quindi con
   -- un numero dispari di cambi prima del primo valeva il contrario di oggi; con un numero pari
   -- valeva come oggi (es. spuntata per sbaglio e tolta): nessuna riga, vale da sempre.
   -- Giorni di lavoro / giorni a settimana: solo se oggi c e una scelta (il valore di prima il
   -- registro non lo dice: si considera "nessuna scelta").
   WHERE CASE WHEN a.campo IN ('solo_notti', 'solo_diurni', 'turni_solo_a_mano') THEN a.n % 2 = 1
              ELSE a.valore <> '' END;
END
$$;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260923_scelte_collaboratori_storico')
ON CONFLICT (nome) DO NOTHING;

COMMIT;

-- PostgREST rilegge l elenco delle funzioni
NOTIFY pgrst, 'reload schema';
