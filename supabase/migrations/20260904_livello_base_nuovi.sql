-- ============================================================
-- LIVELLO 1 D UFFICIO AI COLLABORATORI NUOVI (v413, decisione del titolare 08/10/2026)
-- Chi entra senza nessun livello (importazione del piano o dei collaboratori, Diario,
-- Gestione collaboratori, formazioni...) riceve subito il livello 1 del proprio settore
-- (le competenze di livello 1 della configurazione di Formazione: Sala Slot, Croupier,
-- Servizio Valet, Pulizia sale). Cosi bozza e proposte lo mettono solo nel gruppo base
-- (in Slots: la sala, turni S) finche in Formazione non gli si danno altri livelli.
-- Vale anche quando un collaboratore passa a un altro settore senza livelli in quello.
-- Non tocca: chi ha gia un livello del settore, i RESP (non stanno nella rotazione).
-- Una tantum: i collaboratori attivi delle Slot senza livello ricevono il livello 1
-- (negli altri settori i livelli non sono ancora compilati: si impostano a mano).
-- import_backup.py disattiva i trigger: i dati importati arrivano come sono.
-- Si puo rilanciare.
-- ============================================================

-- competenze con il livello 1 del settore aggiunto, se la persona non ha nessun livello
CREATE OR REPLACE FUNCTION public._collab_competenze_base(p_rep text, p_comp jsonb, p_funzione text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_cfg JSONB;
  v_base TEXT[];
  v_tutte TEXT[];
  v_comp JSONB := COALESCE(p_comp, '{}'::jsonb);
BEGIN
  IF upper(COALESCE(p_funzione, '')) = 'RESP' THEN
    RETURN v_comp;
  END IF;
  BEGIN
    SELECT valore::jsonb -> COALESCE(p_rep, 'slots') INTO v_cfg FROM impostazioni WHERE chiave = 'competenze_config';
  EXCEPTION WHEN others THEN
    v_cfg := NULL;
  END;
  -- senza configurazione salvata: i livelli 1 predefiniti del programma (formazione.js)
  IF v_cfg IS NULL OR jsonb_typeof(v_cfg) <> 'array' THEN
    v_cfg := CASE COALESCE(p_rep, 'slots')
      WHEN 'slots' THEN '[{"key":"sala","livello":1}]'
      WHEN 'tavoli' THEN '[{"key":"croupier","livello":1}]'
      WHEN 'valet' THEN '[{"key":"valet_servizio","livello":1}]'
      WHEN 'cleaning' THEN '[{"key":"cleaning_sale","livello":1}]'
      ELSE '[]' END::jsonb;
  END IF;
  SELECT array_agg(e ->> 'key') FILTER (WHERE (e ->> 'livello') ~ '^[0-9]+$' AND (e ->> 'livello')::int = 1),
         array_agg(e ->> 'key') FILTER (WHERE (e ->> 'livello') ~ '^[0-9]+$' AND (e ->> 'livello')::int >= 1)
    INTO v_base, v_tutte
    FROM jsonb_array_elements(v_cfg) e;
  IF v_base IS NULL THEN
    RETURN v_comp;
  END IF;
  -- ha gia un livello del settore (una competenza a livello spuntata): resta com e
  IF EXISTS (SELECT 1 FROM jsonb_each(v_comp) x WHERE x.key = ANY (v_tutte) AND x.value = 'true'::jsonb) THEN
    RETURN v_comp;
  END IF;
  RETURN v_comp || (SELECT jsonb_object_agg(k, true) FROM unnest(v_base) k);
END;
$function$;

CREATE OR REPLACE FUNCTION public._collab_livello_base()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.reparto_dip, 'slots') = COALESCE(NEW.reparto_dip, 'slots') THEN
    RETURN NEW;
  END IF;
  NEW.competenze := _collab_competenze_base(NEW.reparto_dip, NEW.competenze, NEW.funzione);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public._collab_competenze_base(text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._collab_livello_base() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS collab_livello_base_trg ON public.collaboratori;
CREATE TRIGGER collab_livello_base_trg
  BEFORE INSERT OR UPDATE OF reparto_dip ON public.collaboratori
  FOR EACH ROW EXECUTE FUNCTION public._collab_livello_base();

-- una tantum: Slots, attivi, senza nessun livello
UPDATE public.collaboratori
   SET competenze = _collab_competenze_base('slots', competenze, funzione)
 WHERE COALESCE(reparto_dip, 'slots') = 'slots'
   AND attivo IS NOT FALSE
   AND competenze IS DISTINCT FROM _collab_competenze_base('slots', competenze, funzione);

NOTIFY pgrst, 'reload schema';
