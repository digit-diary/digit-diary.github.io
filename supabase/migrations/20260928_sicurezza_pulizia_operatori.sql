-- ============================================================
-- OPERATORI RIMOSSI: PERMESSI RIMASTI NELLE IMPOSTAZIONI (controllo C, C8, 23/10/2026)
-- Prima remove_operator toglieva password, sessioni e impronte ma NON il nome dalle voci
-- "Operatori selezionati" di Visibilita, dal profilo, dagli accessi extra e dal settore: un
-- nuovo operatore con lo stesso nome ereditava tutto. Dalla 20260928_sicurezza_permessi_dati
-- remove_operator chiama _operatore_togli. Qui si sistemano i dati di prima.
-- Chi si toglie: i nomi presenti in quelle impostazioni che NON sono operatori, cioe non sono
-- in operatori_auth (accesso con password) e nemmeno nell elenco operatori_lista. Nei dati
-- veri (copia del 23/10): solo "Pisano Pamela" (profilo + 20 voci di Visibilita).
-- Per ognuno una riga nel Registro con le voci tolte. Ha bisogno della 20260928_sicurezza_
-- permessi_dati (_operatore_togli). Rilanciabile: la seconda volta non trova nessuno.
-- Funzioni nuove: 0.
-- ============================================================
BEGIN;

DO $$
DECLARE
  r RECORD;
  v_n INT;
BEGIN
  FOR r IN
    WITH vivi AS (
      SELECT nome FROM public.operatori_auth
      UNION
      SELECT jsonb_array_elements_text(valore::jsonb) FROM public.impostazioni
       WHERE chiave = 'operatori_lista' AND valore ~ '^\s*\['
      UNION SELECT 'Admin'
    ), citati AS (
      SELECT n AS nome
        FROM public.impostazioni i, jsonb_each(i.valore::jsonb) x(k, v),
             jsonb_array_elements_text(CASE WHEN jsonb_typeof(v -> 'operatori') = 'array' THEN v -> 'operatori' ELSE '[]'::jsonb END) n
       WHERE i.chiave = 'visibilita' AND i.valore ~ '^\s*\{' AND jsonb_typeof(v) = 'object'
      UNION
      SELECT k FROM public.impostazioni i, jsonb_object_keys(i.valore::jsonb) k
       WHERE i.chiave IN ('profili_operatori', 'operatori_accessi_extra', 'operatori_reparto') AND i.valore ~ '^\s*\{'
    )
    SELECT DISTINCT c.nome FROM citati c WHERE c.nome NOT IN (SELECT nome FROM vivi) ORDER BY 1
  LOOP
    v_n := public._operatore_togli(r.nome);
    INSERT INTO public.log_attivita (operatore, azione, dettaglio)
    VALUES ('Sistema (manutenzione)', 'Operatore rimosso: permessi tolti',
            r.nome || ' (non piu operatore, ' || v_n || ' voci di permessi, profilo e settore tolte; migrazione 20260928)');
    RAISE NOTICE 'permessi tolti a % (% voci)', r.nome, v_n;
  END LOOP;
END $$;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260928_sicurezza_pulizia_operatori')
ON CONFLICT (nome) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
