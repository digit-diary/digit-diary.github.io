-- 23/10/2026 · VALUTAZIONI NEL CESTINO (decisione del titolare, controllo QA audit B / B19)
-- Come registrazioni e moduli: "Elimina" mette la valutazione nel Cestino (eliminato = true),
-- da li' si ripristina; l'eliminazione definitiva la fa solo l'amministratore, e lo impone il
-- database (_controlla_permessi_scrittura), non solo l'interfaccia.
-- Idempotente: si puo' applicare piu' volte. Richiede 20260929_b_valutazioni_proposta_intermedia.sql.

-- 1) colonne del Cestino
ALTER TABLE public.valutazioni ADD COLUMN IF NOT EXISTS eliminato boolean NOT NULL DEFAULT false;
ALTER TABLE public.valutazioni ADD COLUMN IF NOT EXISTS eliminato_da text;
ALTER TABLE public.valutazioni ADD COLUMN IF NOT EXISTS eliminato_at timestamptz;

-- 2) una sola scheda VIVA per collaboratore, anno, tipo e settore: una valutazione nel Cestino
--    non impedisce di rifarla (prima il vincolo valeva anche per le righe tolte)
ALTER TABLE public.valutazioni DROP CONSTRAINT IF EXISTS valutazioni_collaboratore_anno_tipo_reparto_dip_key;
CREATE UNIQUE INDEX IF NOT EXISTS valutazioni_una_viva
  ON public.valutazioni (collaboratore, anno, tipo, reparto_dip) WHERE eliminato IS NOT TRUE;

-- 3) permessi nel database: chi non e' amministratore non cancella le valutazioni (usa il
--    Cestino) e non cambia numero, data di creazione e autore. Si aggiunge 'valutazioni' alle
--    due regole gia' scritte per registrazioni e moduli, lasciando intatto il resto della
--    funzione (che altri lavori aggiornano). Se le righe attese non ci sono, ci si ferma.
DO $mig$
DECLARE
  v_def text;
  v_nuova text;
  v_a text := $t$IF p_table IN ('registrazioni', 'moduli') AND p_azione = 'delete' THEN$t$;
  v_a2 text := $t$IF p_table IN ('registrazioni', 'moduli', 'valutazioni') AND p_azione = 'delete' THEN$t$;
  v_b text := $t$IF p_table IN ('registrazioni', 'moduli') AND p_azione = 'update' AND p_data ?| ARRAY['id', 'created_at', 'operatore'] THEN$t$;
  v_b2 text := $t$IF p_table IN ('registrazioni', 'moduli', 'valutazioni') AND p_azione = 'update' AND p_data ?| ARRAY['id', 'created_at', 'operatore'] THEN$t$;
BEGIN
  v_def := pg_get_functiondef('public._controlla_permessi_scrittura(text,text,text,jsonb)'::regprocedure);
  IF position(v_a2 IN v_def) > 0 AND position(v_b2 IN v_def) > 0 THEN
    RAISE NOTICE 'valutazioni gia nel Cestino: niente da fare';
    RETURN;
  END IF;
  IF position(v_a IN v_def) = 0 OR position(v_b IN v_def) = 0 THEN
    RAISE EXCEPTION '_controlla_permessi_scrittura: righe del Cestino non trovate, migrazione da rivedere';
  END IF;
  v_nuova := replace(replace(v_def, v_a, v_a2), v_b, v_b2);
  EXECUTE v_nuova;
END
$mig$;

NOTIFY pgrst, 'reload schema';

-- registro delle migrazioni applicate
INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260929_b_valutazioni_cestino')
ON CONFLICT (nome) DO NOTHING;
