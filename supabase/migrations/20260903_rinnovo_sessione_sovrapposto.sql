-- ============================================================
-- RINNOVO DELLA SESSIONE SENZA SCRITTURE PERSE (v411, trovato nelle prove dell 08/10/2026)
-- Il rinnovo cancellava subito il token vecchio. Le richieste ancora in viaggio con quel
-- token (per esempio le 10 scritture in parallelo di "Migliora la bozza") passavano il
-- controllo della sessione e un istante dopo non trovavano piu la riga: il database
-- rispondeva "Permesso mancante: azioni automatiche del piano" e la scrittura si perdeva.
-- Ora il token vecchio resta valido ancora 2 minuti (o meno, se scadeva prima), poi si
-- chiude da solo; il token nuovo vale 24 ore come sempre. Rimozione dell operatore e
-- cambio password chiudono comunque tutte le sessioni subito (20260900).
-- Si puo rilanciare.
-- ============================================================
CREATE OR REPLACE FUNCTION public.renew_op_session(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_new TEXT;
BEGIN
  SELECT operatore, is_admin INTO v_op, v_admin
    FROM operator_sessions
    WHERE token = p_token AND expires_at > now() - interval '7 days'
    LIMIT 1;
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  -- v407: un operatore rimosso non rinnova piu (prima la sessione durava per sempre);
  -- l amministratore entra con la password principale (operatore "Admin")
  IF NOT (COALESCE(v_admin, false) AND v_op = 'Admin') AND NOT EXISTS (SELECT 1 FROM operatori_auth WHERE nome = v_op) THEN
    DELETE FROM operator_sessions WHERE token = p_token;
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_new := _create_op_session(v_op, COALESCE(v_admin, false));
  -- v411: il token vecchio si chiude fra 2 minuti, non subito (richieste in viaggio)
  UPDATE operator_sessions SET expires_at = LEAST(expires_at, now() + interval '2 minutes')
   WHERE token = p_token;
  RETURN json_build_object('session_token', v_new, 'operatore', v_op, 'is_admin', COALESCE(v_admin, false));
END;
$function$;

-- i diritti restano quelli di prima (CREATE OR REPLACE li conserva)
NOTIFY pgrst, 'reload schema';
