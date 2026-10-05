-- ============================================================
-- FUNZIONI INTERNE RISERVATE (controllo completo 05/10/2026)
-- Problema: in Postgres ogni funzione nuova e eseguibile da tutti (PUBLIC) e su
-- Supabase anche da anon. Le funzioni interne (nome che comincia con "_") erano
-- quindi chiamabili con la sola chiave pubblica del programma: _create_op_session
-- rilascia una sessione (anche da amministratore) senza password, _diag_check
-- mostra impostazioni interne. Altre funzioni senza token davano dati a chiunque:
-- get_due_promemoria (promemoria scaduti, e li segnava come gia notificati),
-- get_today_birthdays (nomi e compleanni), get_my_notes (note di qualsiasi
-- operatore), cleanup_old_data (cancellazione del registro senza accesso).
--
-- Correzione:
-- 1) tutte le funzioni "_..." si tolgono a PUBLIC, anon e authenticated: le usano
--    solo le funzioni pubbliche SECURITY DEFINER, che girano come proprietario;
-- 2) get_due_promemoria e get_today_birthdays solo a service_role (notifiche push);
--    get_my_notes a nessuno (il programma non la usa piu);
-- 3) cleanup_old_data richiede una sessione valida (cleanup_old_data(p_token));
-- 4) da qui in poi una funzione nuova NON e eseguibile da nessuno finche la
--    migrazione non la concede esplicitamente (GRANT EXECUTE ... TO anon,
--    authenticated, service_role): una funzione dimenticata non funziona (si vede
--    subito) invece di restare aperta a tutti.
-- Lista di verifica: strumenti/verifica_permessi_db.sql deve dare 0 righe.
-- ============================================================

-- 3) pulizia automatica solo con una sessione valida
DROP FUNCTION IF EXISTS cleanup_old_data();
CREATE OR REPLACE FUNCTION cleanup_old_data(p_token TEXT)
RETURNS JSON AS $$
DECLARE
  v_sessions INT;
  v_logs INT;
BEGIN
  IF NOT _sessione_valida(p_token) THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  DELETE FROM operator_sessions WHERE expires_at < now();
  GET DIAGNOSTICS v_sessions = ROW_COUNT;
  DELETE FROM admin_sessions WHERE expires_at < now();
  DELETE FROM log_attivita WHERE created_at < now() - interval '12 months';
  GET DIAGNOSTICS v_logs = ROW_COUNT;
  RETURN json_build_object('sessions_cleaned', v_sessions, 'logs_cleaned', v_logs);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- 1) funzioni interne: nessuno da fuori
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS firma
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname LIKE '\_%'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f.firma);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', f.firma);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f.firma);
    END IF;
  END LOOP;
END
$$;

-- 2) funzioni senza token: solo per il servizio delle notifiche, o per nessuno
REVOKE EXECUTE ON FUNCTION get_due_promemoria() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_today_birthdays() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_my_notes(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_due_promemoria() TO service_role;
GRANT EXECUTE ON FUNCTION get_today_birthdays() TO service_role;

-- la pulizia la chiama il programma (con il token)
REVOKE EXECUTE ON FUNCTION cleanup_old_data(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_old_data(TEXT) TO anon, authenticated, service_role;

-- 4) funzioni future: chiuse finche non concesse esplicitamente. Il diritto di
--    PUBLIC e un valore predefinito globale (si toglie senza IN SCHEMA); quelli di
--    anon/authenticated possono essere globali o dello schema (Supabase, oppure
--    1_prepara_database.sql sul server interno): si tolgono tutti e due.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
