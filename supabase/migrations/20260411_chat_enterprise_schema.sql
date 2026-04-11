-- ============================================================================
-- ENTERPRISE SCHEMA REFACTOR — note_colleghi → chat_*
-- ============================================================================
-- Schema completamente normalizzato stile WhatsApp/Slack/Discord.
-- Operazione 100% ADDITIVA: la tabella note_colleghi NON viene toccata.
-- Dopo questa migration, la migrazione dei dati avviene via JS script.
-- Solo dopo verifica completa, il frontend smettera' di leggere da note_colleghi.
-- ============================================================================

-- ============================================================================
-- 1. NUOVE TABELLE
-- ============================================================================

-- chat_groups: i gruppi di chat con tipo (slots/tavoli/tutti/custom)
CREATE TABLE IF NOT EXISTS chat_groups (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome TEXT,                                     -- nome custom (es. "Supervisor Slots")
  tipo TEXT NOT NULL CHECK (tipo IN ('slots', 'tavoli', 'tutti', 'custom')),
  legacy_gid TEXT UNIQUE,                        -- mapping al vecchio gruppo_id (per migrazione)
  creato_da TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- chat_group_members: membership esplicita
CREATE TABLE IF NOT EXISTS chat_group_members (
  group_id BIGINT NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  operatore TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, operatore)
);

-- chat_messages: UNA riga per messaggio logico (1-to-1 o gruppo)
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  da_operatore TEXT NOT NULL,
  -- XOR: o a_operatore (1-to-1) o group_id (gruppo). Mai entrambi, mai entrambi NULL.
  a_operatore TEXT,
  group_id BIGINT REFERENCES chat_groups(id) ON DELETE CASCADE,
  messaggio TEXT,
  reazioni JSONB DEFAULT '{}'::jsonb,
  importante BOOLEAN DEFAULT FALSE,
  urgente BOOLEAN DEFAULT FALSE,
  reply_to_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  legacy_id BIGINT UNIQUE,                       -- mapping al vecchio note_colleghi.id
  CONSTRAINT chat_messages_recipient_xor CHECK (
    (a_operatore IS NOT NULL AND group_id IS NULL) OR
    (a_operatore IS NULL AND group_id IS NOT NULL)
  )
);

-- chat_message_letti: read receipts (chi ha letto cosa, quando)
CREATE TABLE IF NOT EXISTS chat_message_letti (
  message_id BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  operatore TEXT NOT NULL,
  letta_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, operatore)
);

-- chat_message_hidden: "nascondi per me" individuale per ogni utente
CREATE TABLE IF NOT EXISTS chat_message_hidden (
  message_id BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  operatore TEXT NOT NULL,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, operatore)
);

-- ============================================================================
-- 2. INDEXES per performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_chat_messages_group ON chat_messages(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_da_op ON chat_messages(da_operatore);
CREATE INDEX IF NOT EXISTS idx_chat_messages_a_op ON chat_messages(a_operatore) WHERE a_operatore IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_legacy ON chat_messages(legacy_id) WHERE legacy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_group_members_op ON chat_group_members(operatore);
CREATE INDEX IF NOT EXISTS idx_chat_letti_msg ON chat_message_letti(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_letti_op ON chat_message_letti(operatore);
CREATE INDEX IF NOT EXISTS idx_chat_hidden_msg ON chat_message_hidden(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_hidden_op ON chat_message_hidden(operatore);
CREATE INDEX IF NOT EXISTS idx_chat_groups_legacy ON chat_groups(legacy_gid) WHERE legacy_gid IS NOT NULL;

-- ============================================================================
-- 3. RLS deny_all_anon su tutte le 5 tabelle
-- ============================================================================
ALTER TABLE chat_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON chat_groups;
CREATE POLICY deny_all_anon ON chat_groups FOR ALL TO anon USING (false) WITH CHECK (false);

ALTER TABLE chat_group_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON chat_group_members;
CREATE POLICY deny_all_anon ON chat_group_members FOR ALL TO anon USING (false) WITH CHECK (false);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON chat_messages;
CREATE POLICY deny_all_anon ON chat_messages FOR ALL TO anon USING (false) WITH CHECK (false);

ALTER TABLE chat_message_letti ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON chat_message_letti;
CREATE POLICY deny_all_anon ON chat_message_letti FOR ALL TO anon USING (false) WITH CHECK (false);

ALTER TABLE chat_message_hidden ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON chat_message_hidden;
CREATE POLICY deny_all_anon ON chat_message_hidden FOR ALL TO anon USING (false) WITH CHECK (false);

-- ============================================================================
-- 4. UPDATE secure_* whitelists (aggiunge le 5 nuove tabelle)
-- ============================================================================
CREATE OR REPLACE FUNCTION secure_read(p_token TEXT, p_table TEXT, p_filter TEXT DEFAULT '', p_order TEXT DEFAULT '', p_limit INT DEFAULT 5000)
RETURNS JSON AS $$
DECLARE
  v_op TEXT;
  v_result JSON;
  v_query TEXT;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;

  IF p_table NOT IN (
    'registrazioni', 'note_fissate', 'scadenze', 'note_colleghi',
    'collaboratori', 'moduli', 'log_attivita', 'costi_maison',
    'maison_budget', 'promemoria', 'consegne_turno', 'spese_extra',
    'regali_maison', 'note_clienti', 'rapporti_giornalieri',
    'impostazioni', 'push_subscriptions', 'inventario',
    'chat_groups', 'chat_group_members', 'chat_messages', 'chat_message_letti', 'chat_message_hidden'
  ) THEN
    RAISE EXCEPTION 'Tabella non consentita: %', p_table;
  END IF;

  v_query := 'SELECT COALESCE(json_agg(t), ''[]''::json) FROM (SELECT * FROM ' || quote_ident(p_table);

  IF p_table = 'note_colleghi' THEN
    v_query := v_query || ' WHERE (da_operatore = ' || quote_literal(v_op) || ' AND (nascosta_mitt IS NOT TRUE)) OR (a_operatore = ' || quote_literal(v_op) || ' AND (nascosta_dest IS NOT TRUE))';
  ELSIF p_table = 'impostazioni' THEN
    v_query := v_query || ' WHERE chiave NOT IN (''password_hash'', ''password_hash_v2'', ''recovery_code'', ''groq_api_key'')';
    IF p_filter != '' THEN
      v_query := v_query || ' AND ' || p_filter;
    END IF;
  ELSIF p_table = 'chat_messages' THEN
    -- Operatore vede: messaggi propri (sender), messaggi 1-to-1 a lui, messaggi gruppo dei gruppi di cui e' membro
    -- Esclude messaggi nascosti per questo operatore (chat_message_hidden)
    v_query := v_query || ' WHERE id NOT IN (SELECT message_id FROM chat_message_hidden WHERE operatore = ' || quote_literal(v_op) || ') AND (da_operatore = ' || quote_literal(v_op) || ' OR a_operatore = ' || quote_literal(v_op) || ' OR group_id IN (SELECT group_id FROM chat_group_members WHERE operatore = ' || quote_literal(v_op) || '))';
  ELSIF p_filter != '' THEN
    v_query := v_query || ' WHERE ' || p_filter;
  END IF;

  IF p_order != '' THEN
    v_query := v_query || ' ORDER BY ' || p_order;
  END IF;

  v_query := v_query || ' LIMIT ' || p_limit || ') t';

  EXECUTE v_query INTO v_result;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION secure_insert(p_token TEXT, p_table TEXT, p_data JSONB)
RETURNS JSON AS $$
DECLARE
  v_op TEXT;
  v_result JSON;
  v_cols TEXT := '';
  v_vals TEXT := '';
  v_key TEXT;
  v_val JSONB;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;

  IF p_table NOT IN (
    'registrazioni', 'note_fissate', 'scadenze', 'note_colleghi',
    'collaboratori', 'moduli', 'log_attivita', 'costi_maison',
    'maison_budget', 'promemoria', 'consegne_turno', 'spese_extra',
    'regali_maison', 'note_clienti', 'rapporti_giornalieri',
    'impostazioni', 'push_subscriptions', 'inventario',
    'chat_groups', 'chat_group_members', 'chat_messages', 'chat_message_letti', 'chat_message_hidden'
  ) THEN
    RAISE EXCEPTION 'Tabella non consentita: %', p_table;
  END IF;

  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_data)
  LOOP
    IF v_cols != '' THEN v_cols := v_cols || ', '; v_vals := v_vals || ', '; END IF;
    v_cols := v_cols || quote_ident(v_key);
    IF v_val = 'null'::jsonb THEN
      v_vals := v_vals || 'NULL';
    ELSIF jsonb_typeof(v_val) = 'string' THEN
      v_vals := v_vals || quote_literal(v_val #>> '{}');
    ELSIF jsonb_typeof(v_val) = 'number' THEN
      v_vals := v_vals || (v_val #>> '{}');
    ELSIF jsonb_typeof(v_val) = 'boolean' THEN
      v_vals := v_vals || (v_val #>> '{}');
    ELSE
      v_vals := v_vals || quote_literal(v_val::text);
    END IF;
  END LOOP;

  EXECUTE 'INSERT INTO ' || quote_ident(p_table) || ' (' || v_cols || ') VALUES (' || v_vals || ') RETURNING row_to_json(' || quote_ident(p_table) || '.*)'
    INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION secure_update(p_token TEXT, p_table TEXT, p_filter TEXT, p_data JSONB)
RETURNS VOID AS $$
DECLARE
  v_op TEXT;
  v_set TEXT := '';
  v_key TEXT;
  v_val JSONB;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;

  IF p_table NOT IN (
    'registrazioni', 'note_fissate', 'scadenze', 'note_colleghi',
    'collaboratori', 'moduli', 'log_attivita', 'costi_maison',
    'maison_budget', 'promemoria', 'consegne_turno', 'spese_extra',
    'regali_maison', 'note_clienti', 'rapporti_giornalieri',
    'impostazioni', 'push_subscriptions', 'inventario',
    'chat_groups', 'chat_group_members', 'chat_messages', 'chat_message_letti', 'chat_message_hidden'
  ) THEN
    RAISE EXCEPTION 'Tabella non consentita: %', p_table;
  END IF;

  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_data)
  LOOP
    IF v_set != '' THEN v_set := v_set || ', '; END IF;
    IF v_val = 'null'::jsonb THEN
      v_set := v_set || quote_ident(v_key) || ' = NULL';
    ELSIF jsonb_typeof(v_val) = 'string' THEN
      v_set := v_set || quote_ident(v_key) || ' = ' || quote_literal(v_val #>> '{}');
    ELSIF jsonb_typeof(v_val) = 'number' THEN
      v_set := v_set || quote_ident(v_key) || ' = ' || (v_val #>> '{}');
    ELSIF jsonb_typeof(v_val) = 'boolean' THEN
      v_set := v_set || quote_ident(v_key) || ' = ' || (v_val #>> '{}');
    ELSE
      v_set := v_set || quote_ident(v_key) || ' = ' || quote_literal(v_val::text);
    END IF;
  END LOOP;

  EXECUTE 'UPDATE ' || quote_ident(p_table) || ' SET ' || v_set || ' WHERE ' || p_filter;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION secure_delete(p_token TEXT, p_table TEXT, p_filter TEXT)
RETURNS VOID AS $$
DECLARE
  v_op TEXT;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;

  IF p_table NOT IN (
    'registrazioni', 'note_fissate', 'scadenze', 'note_colleghi',
    'collaboratori', 'moduli', 'log_attivita', 'costi_maison',
    'maison_budget', 'promemoria', 'consegne_turno', 'spese_extra',
    'regali_maison', 'note_clienti', 'rapporti_giornalieri',
    'push_subscriptions', 'inventario',
    'chat_groups', 'chat_group_members', 'chat_messages', 'chat_message_letti', 'chat_message_hidden'
  ) THEN
    RAISE EXCEPTION 'Tabella non consentita: %', p_table;
  END IF;

  EXECUTE 'DELETE FROM ' || quote_ident(p_table) || ' WHERE ' || p_filter;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. RPC HELPERS
-- ============================================================================

-- Marca un messaggio come letto da operatore corrente (idempotente)
CREATE OR REPLACE FUNCTION chat_mark_letta(p_token TEXT, p_message_id BIGINT)
RETURNS VOID AS $$
DECLARE
  v_op TEXT;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  INSERT INTO chat_message_letti(message_id, operatore, letta_at)
  VALUES (p_message_id, v_op, NOW())
  ON CONFLICT (message_id, operatore) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Nasconde un messaggio per l'operatore corrente
CREATE OR REPLACE FUNCTION chat_hide_message(p_token TEXT, p_message_id BIGINT)
RETURNS VOID AS $$
DECLARE
  v_op TEXT;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  INSERT INTO chat_message_hidden(message_id, operatore, hidden_at)
  VALUES (p_message_id, v_op, NOW())
  ON CONFLICT (message_id, operatore) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crea o recupera un gruppo persistente (slots/tavoli/tutti) o custom
-- Restituisce l'id del gruppo (esistente o appena creato)
CREATE OR REPLACE FUNCTION chat_get_or_create_group(
  p_token TEXT,
  p_tipo TEXT,
  p_legacy_gid TEXT,
  p_nome TEXT,
  p_members TEXT[]
)
RETURNS BIGINT AS $$
DECLARE
  v_op TEXT;
  v_group_id BIGINT;
  v_member TEXT;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;

  -- Cerca per legacy_gid (riusa gruppo esistente)
  SELECT id INTO v_group_id FROM chat_groups WHERE legacy_gid = p_legacy_gid LIMIT 1;

  IF v_group_id IS NULL THEN
    -- Crea nuovo
    INSERT INTO chat_groups(nome, tipo, legacy_gid, creato_da)
    VALUES (p_nome, p_tipo, p_legacy_gid, v_op)
    RETURNING id INTO v_group_id;

    -- Aggiungi membri
    IF p_members IS NOT NULL THEN
      FOREACH v_member IN ARRAY p_members LOOP
        INSERT INTO chat_group_members(group_id, operatore)
        VALUES (v_group_id, v_member)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
  END IF;

  RETURN v_group_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
