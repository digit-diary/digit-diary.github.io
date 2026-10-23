-- 20260929_a (controllo A del 23/10/2026, difetti A15 e A31)
--
-- A15 · CONSEGNA LETTA PER PERSONA. Con una consegna a «Tutti» la prima persona che la apriva
-- la segnava letta per tutti (letto_da era un nome solo). Ora letto_da e l elenco di chi l ha
-- letta («Rossi Mario, Bianchi Anna»), e la lettura si aggiunge in UNA istruzione sul database:
-- due colleghi che la aprono insieme restano tutti e due (con lettura e scrittura dal programma
-- uno dei due si perdeva). Si puo segnare letta solo una consegna che ti riguarda (destinatario
-- «tutti» o il tuo nome), mai la propria.
-- La funzione vecchia (secure_update con letto_da = me) resta valida per i programmi non
-- ancora aggiornati.
--
-- A31 · LETTURE E MESSAGGI NASCOSTI DELLA CHAT LEGATI AL MESSAGGIO. Lo schema del 11/04
-- (20260411_chat_enterprise_schema) ha gia le chiavi esterne con ON DELETE CASCADE; nella copia
-- dei dati veri (diario5) mancavano e c erano 312 letture e 22 «nascosti» senza messaggio, che
-- facevano risultare gia letti e nascosti i messaggi nuovi con lo stesso numero. Qui si
-- tolgono le righe orfane e si rimette la chiave SOLO se manca (sul cloud, se c e, non cambia
-- niente). Da verificare sul cloud prima di applicare: \d chat_message_letti

BEGIN;

CREATE OR REPLACE FUNCTION public.consegna_segna_letta(p_token text, p_id bigint)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op TEXT;
  v_c consegne_turno%ROWTYPE;
  v_elenco TEXT[];
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  SELECT * INTO v_c FROM consegne_turno WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Consegna non trovata';
  END IF;
  IF v_c.operatore = v_op THEN
    RAISE EXCEPTION 'La propria consegna non si segna letta';
  END IF;
  IF NOT (COALESCE(v_c.destinatario, '') = 'tutti'
          OR v_op = ANY (SELECT btrim(x) FROM unnest(string_to_array(COALESCE(v_c.destinatario, ''), ',')) x)) THEN
    RAISE EXCEPTION 'Consegna non destinata a te';
  END IF;
  v_elenco := ARRAY(SELECT btrim(x) FROM unnest(string_to_array(COALESCE(v_c.letto_da, ''), ',')) x
                    WHERE btrim(x) <> '');
  IF NOT (v_op = ANY (v_elenco)) THEN
    v_elenco := v_elenco || v_op;
    UPDATE consegne_turno
       SET letto_da = array_to_string(v_elenco, ', '),
           letto_at = now()
     WHERE id = p_id;
  END IF;
  RETURN json_build_object('letto_da', array_to_string(v_elenco, ', '),
                           'letto_at', (SELECT letto_at FROM consegne_turno WHERE id = p_id));
END;
$$;
REVOKE ALL ON FUNCTION public.consegna_segna_letta(text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consegna_segna_letta(text, bigint) TO anon, authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.chat_message_letti'::regclass AND contype = 'f') THEN
    DELETE FROM chat_message_letti l WHERE NOT EXISTS (SELECT 1 FROM chat_messages m WHERE m.id = l.message_id);
    ALTER TABLE chat_message_letti
      ADD CONSTRAINT chat_message_letti_message_id_fkey
      FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.chat_message_hidden'::regclass AND contype = 'f') THEN
    DELETE FROM chat_message_hidden h WHERE NOT EXISTS (SELECT 1 FROM chat_messages m WHERE m.id = h.message_id);
    ALTER TABLE chat_message_hidden
      ADD CONSTRAINT chat_message_hidden_message_id_fkey
      FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- registro delle migrazioni applicate
INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260929_a_consegna_letta_e_chat_fk')
ON CONFLICT (nome) DO NOTHING;
