-- ============================================================
-- REGISTRO ATTIVITA: PERIODO, FILTRI E PAGINE NEL DATABASE (controllo C, C11, 23/10/2026)
-- Prima la pagina Registro filtrava le ultime 500 righe caricate all avvio e ne mostrava 200:
-- settembre (599 righe nei dati veri) dava "Nessuna attivita registrata", il filtro Operatore
-- proponeva solo i nomi di quelle 500 righe e la categoria "Collaboratori" riconosceva 4 azioni
-- su piu di 30 (Impiego, Percentuale, Funzione, Fine contratto, Competenze... mancavano).
-- Ora: registro_leggi legge dal database il periodo, l operatore, la categoria e la ricerca,
-- a pagine, con il totale (la pagina scrive "mostrate N di M") e i nomi degli operatori del
-- periodo. Le categorie stanno qui (_registro_categoria), una sola volta: la pagina le riceve
-- con i dati. "Altro" = nessuna categoria.
-- Chi la puo chiamare: l amministratore e chi ha la pagina Registro (come secure_read, che
-- agli altri da solo le proprie righe e quelle del piano).
-- Funzioni nuove: 3 (_registro_categorie, _registro_categoria, registro_leggi). Rilanciabile.
-- ============================================================

-- indice per le letture per periodo (gia presente in alcuni database come idx_log_attivita_created)
CREATE INDEX IF NOT EXISTS idx_log_attivita_created ON public.log_attivita (created_at DESC);

-- categoria di un azione: la PRIMA che corrisponde, nell ordine qui sotto (cosi ogni riga sta in
-- una categoria sola: "Piano: annullato" e Piano, non Annulla). Etichette per la pagina.
CREATE OR REPLACE FUNCTION public._registro_categorie()
RETURNS TABLE(ordine int, chiave text, etichetta text, modello text)
LANGUAGE sql
IMMUTABLE
AS $$
  VALUES
    (1, 'piano', 'Piano, vacanze, pause e briefing',
      '^(piano|pause|briefing|bigliettino|vacanz|fabbisogno|incolla|turni|turno |timbratur|festivit|festivi|ore reali|recupero ore|riporto saldo|saldo:|regol|marcatore giorno|giorn[oi] chius|mese chiuso|export dati piano|import piani|formulari|commenti recuperati|colore sigla|colonne dell import|limite cambi|nd:|ristampato foglio cambio|cambio turno|accoglienza|protocollo|corso inserito|copertura malattia|malattia dal piano|malattia tolta dal piano|malattia range|malattia: piano|malattia corretta: piano|assenza: piano|inizio attivit|pulizia piani|riallinea nomi|turni orfani|orario)'),
    (2, 'registrazione', 'Diario e Rapporto',
      '^(nuova registrazione|modifica registrazione|eliminata registrazione|registrazione|auto-registrazione|malattia|certificato|non disponibilit|validazione assenza|tolto dal rapporto|rapporto|report direzione|campi rapporto|duplicato cross-rapporto|assenze da rapporto|alert ignorato)'),
    (3, 'modulo', 'Moduli e valutazioni', '(modulo|^moduli:|^valutazion)'),
    (4, 'formazione', 'Formazione, punti e premi',
      '^(competenz|formazion|passaggio livello|punti|premio|nome livello|azione punti|corsi|livell|giubile|notifiche giubileo|notifiche incentivi|report incentivi|copertura rimossa)'),
    (5, 'maison', 'Maison e spese extra',
      '(maison|^spes[ae]|^modifica spesa|^eliminat[ao] spes|^rinomina spese|^regal|^extra |^valori buoni|^compleanni)'),
    (6, 'collaboratore', 'Collaboratori',
      '(collaborator|^importa (categorie|compleanni)|^impiego|^percentuale|^funzione|^lingue|^data (di )?nascita|^inizio contratto|^fine contratto|^congedo non pagato|^evento hr|^allegato hr|^fisso/jolly|^copertura settori)'),
    (7, 'inventario', 'Inventario', '^inventario'),
    (8, 'operatore', 'Operatori e permessi',
      '^(operatore|accessi copiati|profili|visibilit|scheda permessi|sicurezza|password|impronta)'),
    (9, 'promemoria', 'Promemoria, consegne e note', '^(promemoria|consegn|not[ae] |scadenz|membro|gruppo rinominato)'),
    (10, 'impostazioni', 'Impostazioni e sistema',
      '^(backup|conservazione|settore|pagine settore|soglie|soglia|intelligenza|migrazione|database|tipo aggiunto|guida|esportazione|logo|identit|istruzioni|modell|riferiment|codici)'),
    (11, 'annulla', 'Annulla, ripristini e cestino', '^(annullat|ripristinat|eliminato definitivamente|cestino)')
$$;

CREATE OR REPLACE FUNCTION public._registro_categoria(p_azione text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    (SELECT c.chiave FROM public._registro_categorie() c WHERE COALESCE(p_azione, '') ~* c.modello ORDER BY c.ordine LIMIT 1),
    'altro');
$$;

-- p_dal / p_al: giorni (ora di Lugano), inclusi; NULL = senza limite. p_operatore '' = tutti.
-- p_categoria '' = tutte, 'altro' = nessuna categoria. p_cerca: azione, dettaglio o operatore.
-- Risposta: { righe: [...], totale, operatori: [nomi del periodo], categorie: [{chiave, etichetta}] }
CREATE OR REPLACE FUNCTION public.registro_leggi(
  p_token text,
  p_dal date DEFAULT NULL,
  p_al date DEFAULT NULL,
  p_operatore text DEFAULT '',
  p_categoria text DEFAULT '',
  p_cerca text DEFAULT '',
  p_limit int DEFAULT 200,
  p_offset int DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
SET standard_conforming_strings TO 'on'
AS $$
DECLARE
  v_op text;
  v_admin boolean;
  v_da timestamptz;
  v_a timestamptz;
  v_cerca text;
  v_lim int := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 5000);
  v_off int := GREATEST(COALESCE(p_offset, 0), 0);
  v_righe json;
  v_tot bigint;
  v_ops json;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_admin := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);
  IF NOT v_admin AND NOT _pagina_visibile(p_token, 'registro') THEN
    RAISE EXCEPTION 'Permesso mancante: Registro attivita';
  END IF;
  IF COALESCE(p_categoria, '') <> '' AND p_categoria <> 'altro'
     AND NOT EXISTS (SELECT 1 FROM _registro_categorie() c WHERE c.chiave = p_categoria) THEN
    RAISE EXCEPTION 'Categoria del registro sconosciuta: %', p_categoria;
  END IF;
  v_da := CASE WHEN p_dal IS NULL THEN NULL ELSE (p_dal::timestamp AT TIME ZONE 'Europe/Zurich') END;
  v_a := CASE WHEN p_al IS NULL THEN NULL ELSE ((p_al + 1)::timestamp AT TIME ZONE 'Europe/Zurich') END;
  v_cerca := NULLIF(btrim(COALESCE(p_cerca, '')), '');
  IF v_cerca IS NOT NULL THEN
    v_cerca := '%' || replace(replace(replace(v_cerca, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  -- righe del periodo con categoria e ricerca; l operatore si filtra dopo, cosi la lista dei
  -- nomi resta quella del periodo e non solo il nome scelto
  WITH periodo AS (
    SELECT l.id, l.operatore, l.azione, l.dettaglio, l.created_at, l.reparto_dip
    FROM log_attivita l
    WHERE (v_da IS NULL OR l.created_at >= v_da)
      AND (v_a IS NULL OR l.created_at < v_a)
      AND (COALESCE(p_categoria, '') = '' OR _registro_categoria(l.azione) = p_categoria)
      AND (v_cerca IS NULL OR l.azione ILIKE v_cerca OR COALESCE(l.dettaglio, '') ILIKE v_cerca
           OR COALESCE(l.operatore, '') ILIKE v_cerca)
  ),
  scelte AS (
    SELECT * FROM periodo WHERE COALESCE(p_operatore, '') = '' OR COALESCE(operatore, '') = p_operatore
  ),
  pagina AS (
    SELECT s.*, _registro_categoria(s.azione) AS categoria FROM scelte s
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT v_lim OFFSET v_off
  )
  SELECT
    (SELECT COALESCE(json_agg(p ORDER BY p.created_at DESC, p.id DESC), '[]'::json) FROM pagina p),
    (SELECT count(*) FROM scelte),
    (SELECT COALESCE(json_agg(o ORDER BY o), '[]'::json) FROM (SELECT DISTINCT COALESCE(operatore, '') AS o FROM periodo) x)
  INTO v_righe, v_tot, v_ops;

  RETURN json_build_object(
    'righe', v_righe,
    'totale', v_tot,
    'operatori', v_ops,
    'categorie', (SELECT json_agg(json_build_object('chiave', c.chiave, 'etichetta', c.etichetta) ORDER BY c.ordine)
                  FROM _registro_categorie() c));
END;
$$;

REVOKE ALL ON FUNCTION public.registro_leggi(text, date, date, text, text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registro_leggi(text, date, date, text, text, text, int, int) TO anon;

-- registro delle migrazioni applicate
INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260929_c_registro_attivita')
ON CONFLICT (nome) DO NOTHING;
