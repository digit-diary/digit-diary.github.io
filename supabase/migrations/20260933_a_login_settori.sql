-- 02/11/2026 · SETTORI E OPERATORI NELLA PAGINA DI ACCESSO (difetto segnalato dal titolare dopo la
-- creazione di «Sicurezza & Sorveglianza»). Prima dell accesso il programma non puo leggere le
-- impostazioni: il selettore dei settori aveva le voci fisse (Slots, Tavoli, Valet, Cleaning) o
-- quelle salvate nel browser dopo un accesso precedente, e il settore di ogni operatore veniva solo
-- dal browser. Su un PC nuovo un settore aggiunto non compariva e ogni operatore compariva sotto
-- tutti i settori (es. Louati sotto Slots, con ingresso nelle Slots).
-- login_elenco(): una sola lettura pubblica per la schermata di accesso, con
--   settori:   chiave e nome dei settori attivi (Slots e Tavoli + quelli di Impostazioni › Settori);
--   operatori: nome, ruolo e settore (chiave, 'entrambi' = Tutti i settori) di ogni operatore.
-- Niente altro (ne permessi, ne colori, ne dati delle persone): nomi e ruoli li dava gia
-- list_operators, che resta com e.
-- Idempotente. Dopo 20260932_e_togli_amm_usa_u.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.login_elenco()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_cfg jsonb;
  v_map jsonb;
  v_settori jsonb := '[{"key":"slots","label":"Slots"},{"key":"tavoli","label":"Tavoli"}]'::jsonb;
BEGIN
  BEGIN
    SELECT valore::jsonb INTO v_cfg FROM impostazioni WHERE chiave = 'reparti_config';
  EXCEPTION WHEN others THEN v_cfg := NULL;
  END;
  -- senza configurazione salvata valgono i settori predefiniti del programma (Valet, Cleaning)
  IF v_cfg IS NULL OR jsonb_typeof(v_cfg) <> 'array' THEN
    v_cfg := '[{"key":"valet","label":"Valet","attivo":true},{"key":"cleaning","label":"Cleaning","attivo":true}]'::jsonb;
  END IF;
  v_settori := v_settori || COALESCE((
    SELECT jsonb_agg(jsonb_build_object('key', e->>'key', 'label', COALESCE(NULLIF(e->>'label', ''), e->>'key')) ORDER BY o)
      FROM jsonb_array_elements(v_cfg) WITH ORDINALITY AS t(e, o)
     WHERE jsonb_typeof(e) = 'object'
       AND COALESCE(e->>'key', '') <> ''
       AND e->>'key' NOT IN ('slots', 'tavoli', 'entrambi')
       AND COALESCE(e->>'attivo', 'true') <> 'false'), '[]'::jsonb);
  BEGIN
    SELECT valore::jsonb INTO v_map FROM impostazioni WHERE chiave = 'operatori_reparto';
  EXCEPTION WHEN others THEN v_map := NULL;
  END;
  IF v_map IS NULL OR jsonb_typeof(v_map) <> 'object' THEN
    v_map := '{}'::jsonb;
  END IF;
  RETURN json_build_object(
    'settori', v_settori,
    'operatori', COALESCE((
      SELECT json_agg(json_build_object(
               'nome', a.nome,
               'ruolo', a.ruolo,
               'settore', COALESCE(NULLIF(v_map->>a.nome, ''), 'entrambi')) ORDER BY a.nome)
        FROM operatori_auth a), '[]'::json));
END;
$function$;

REVOKE ALL ON FUNCTION public.login_elenco() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_elenco() TO anon, authenticated;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260933_a_login_settori')
ON CONFLICT (nome) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
