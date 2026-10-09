-- ============================================================
-- SOSTITUZIONE IN UN COLPO SOLO (v434, controllo completo del 09/10/2026, fase 2 "dati")
-- Fabbisogno del mese (import, file del piano, incolla) e import Maison di un giorno
-- cancellavano le righe e poi le reinserivano una alla volta dal programma: con la rete
-- caduta a meta il mese restava senza fabbisogno (e la bozza generava meno turni) o il
-- giorno Maison restava vuoto, con il messaggio "importato". secure_sostituisci fa la
-- cancellazione e gli inserimenti nella STESSA transazione, con gli stessi controlli di
-- secure_delete e secure_insert (permessi, filtro sicuro): o tutto o niente.
-- Si puo rilanciare.
-- ============================================================
CREATE OR REPLACE FUNCTION public.secure_sostituisci(p_token text, p_table text, p_filter text, p_rows jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
 SET standard_conforming_strings = on
AS $function$
DECLARE
  v_riga JSONB;
  v_out JSONB := '[]'::jsonb;
  v_ins JSON;
BEGIN
  IF p_table NOT IN ('piano_fabbisogni', 'costi_maison', 'spese_extra') THEN
    RAISE EXCEPTION 'Sostituzione non consentita: %', p_table;
  END IF;
  IF jsonb_typeof(COALESCE(p_rows, 'null'::jsonb)) <> 'array' OR jsonb_array_length(p_rows) > 5000 THEN
    RAISE EXCEPTION 'Righe non valide (max 5000)';
  END IF;
  PERFORM secure_delete(p_token, p_table, p_filter);
  FOR v_riga IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_ins := secure_insert(p_token, p_table, v_riga);
    v_out := v_out || jsonb_build_array(v_ins::jsonb);
  END LOOP;
  RETURN v_out::json;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.secure_sostituisci(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.secure_sostituisci(text, text, text, jsonb) TO anon, authenticated, service_role;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260909_sostituzione_unica')
ON CONFLICT (nome) DO NOTHING;
