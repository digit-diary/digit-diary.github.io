-- ============================================================
-- MIGRAZIONE: Realtime + RPC filtrate + RLS su note_colleghi
-- Eseguire su Supabase SQL Editor
-- ============================================================

-- 1. Abilita Realtime su note_colleghi
ALTER PUBLICATION supabase_realtime ADD TABLE note_colleghi;

-- 2. RPC: get_my_notes - restituisce solo le note dell'operatore
--    (server-side filtering, non più client-side)
CREATE OR REPLACE FUNCTION get_my_notes(p_operatore TEXT)
RETURNS SETOF note_colleghi
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT * FROM note_colleghi
  WHERE (da_operatore = p_operatore AND nascosta_mitt IS NOT TRUE)
     OR (a_operatore = p_operatore AND nascosta_dest IS NOT TRUE)
  ORDER BY created_at DESC;
$$;

-- 3. RLS su note_colleghi (protezione aggiuntiva)
--    Nota: con chiave anon e senza Supabase Auth, RLS non è enforceable
--    sul REST API generico, ma protegge l'accesso diretto al DB.
--    Le query passeranno comunque via RPC (SECURITY DEFINER bypassa RLS).
ALTER TABLE note_colleghi ENABLE ROW LEVEL SECURITY;

-- Policy: gli utenti anonimi possono solo INSERT (invio note)
-- Le letture passano tutte via RPC get_my_notes (SECURITY DEFINER)
CREATE POLICY "note_insert_only" ON note_colleghi
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "note_update_own" ON note_colleghi
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Per le DELETE (annulla invio)
CREATE POLICY "note_delete_own" ON note_colleghi
  FOR DELETE TO anon
  USING (true);

-- SELECT bloccato per anon (forza uso di get_my_notes)
-- ATTENZIONE: questo blocca sbGet('note_colleghi')!
-- Le letture DEVONO passare da get_my_notes()
CREATE POLICY "note_select_via_rpc" ON note_colleghi
  FOR SELECT TO anon
  USING (false);

-- NOTA: Se dopo questa migrazione l'app non funziona, eseguire:
-- DROP POLICY "note_select_via_rpc" ON note_colleghi;
-- CREATE POLICY "note_select_all" ON note_colleghi FOR SELECT TO anon USING (true);
