-- ============================================================
-- PROGETTO MULTIDISCIPLINARITA — Diario Collaboratori
-- 1) Collaboratori: separazione per reparto + spunte competenze
-- 2) Valutazioni annuali (9 aree HR + Versatilita/Affidabilita/Disponibilita)
-- 3) Sistema punti (ledger eventi, config in impostazioni)
-- 4) Whitelist secure_* estesa alle nuove tabelle
-- ============================================================

-- 1a. Collaboratori: reparto e competenze
ALTER TABLE collaboratori ADD COLUMN IF NOT EXISTS reparto_dip TEXT NOT NULL DEFAULT 'slots';
ALTER TABLE collaboratori ADD COLUMN IF NOT EXISTS competenze JSONB DEFAULT '{}'::jsonb;

-- 1b. Backfill reparto dedotto dalle registrazioni:
--     solo tavoli -> 'tavoli'; sia slots che tavoli -> 'entrambi'; altrimenti resta 'slots'
UPDATE collaboratori c SET reparto_dip = 'tavoli'
WHERE EXISTS (SELECT 1 FROM registrazioni r WHERE r.nome = c.nome)
  AND NOT EXISTS (SELECT 1 FROM registrazioni r WHERE r.nome = c.nome AND COALESCE(r.reparto_dip, 'slots') = 'slots');

UPDATE collaboratori c SET reparto_dip = 'entrambi'
WHERE EXISTS (SELECT 1 FROM registrazioni r WHERE r.nome = c.nome AND COALESCE(r.reparto_dip, 'slots') = 'slots')
  AND EXISTS (SELECT 1 FROM registrazioni r WHERE r.nome = c.nome AND r.reparto_dip = 'tavoli');

-- 2. Valutazioni annuali
CREATE TABLE IF NOT EXISTS valutazioni (
  id                  BIGSERIAL PRIMARY KEY,
  collaboratore       TEXT NOT NULL,
  anno                INTEGER NOT NULL,
  tipo                TEXT NOT NULL DEFAULT 'valutazione' CHECK (tipo IN ('valutazione', 'autovalutazione')),
  aree                JSONB DEFAULT '{}'::jsonb,   -- {gestione_risorse: 85, ..., versatilita: 90, affidabilita: 80, disponibilita: 95}
  obiettivi_precedenti JSONB DEFAULT '[]'::jsonb,  -- [{area, valore, osservazioni}]
  punti_forza         TEXT DEFAULT '',
  obiettivi           JSONB DEFAULT '[]'::jsonb,   -- max 3 obiettivi entro il 31/12
  esigenze_formative  TEXT DEFAULT '',
  commento            TEXT DEFAULT '',
  osservazioni        TEXT DEFAULT '',
  valutatore          TEXT DEFAULT '',
  data_valutazione    DATE,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  reparto_dip         TEXT NOT NULL DEFAULT 'slots',
  UNIQUE (collaboratore, anno, tipo, reparto_dip)
);
CREATE INDEX IF NOT EXISTS idx_valutazioni_collab ON valutazioni (collaboratore);
CREATE INDEX IF NOT EXISTS idx_valutazioni_anno ON valutazioni (anno DESC);
ALTER TABLE valutazioni ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON valutazioni;
CREATE POLICY deny_all_anon ON valutazioni FOR ALL TO anon USING (false) WITH CHECK (false);

-- 3. Punti: registro eventi (ledger, ogni movimento motivato e tracciato)
CREATE TABLE IF NOT EXISTS punti_eventi (
  id            BIGSERIAL PRIMARY KEY,
  collaboratore TEXT NOT NULL,
  punti         INTEGER NOT NULL DEFAULT 0,
  azione        TEXT NOT NULL,              -- chiave azione da punti_config, 'manuale' o 'premio'
  descrizione   TEXT DEFAULT '',
  data_evento   DATE NOT NULL DEFAULT CURRENT_DATE,
  operatore     TEXT DEFAULT '',            -- chi ha assegnato
  reparto_dip   TEXT NOT NULL DEFAULT 'slots',
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_punti_collab ON punti_eventi (collaboratore);
CREATE INDEX IF NOT EXISTS idx_punti_data ON punti_eventi (data_evento DESC);
ALTER TABLE punti_eventi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON punti_eventi;
CREATE POLICY deny_all_anon ON punti_eventi FOR ALL TO anon USING (false) WITH CHECK (false);

-- 4. Whitelist secure_* estesa (valutazioni + punti_eventi)
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
    'chat_groups', 'chat_group_members', 'chat_messages', 'chat_message_letti', 'chat_message_hidden',
    'valutazioni', 'punti_eventi'
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
    'chat_groups', 'chat_group_members', 'chat_messages', 'chat_message_letti', 'chat_message_hidden',
    'valutazioni', 'punti_eventi'
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
    'chat_groups', 'chat_group_members', 'chat_messages', 'chat_message_letti', 'chat_message_hidden',
    'valutazioni', 'punti_eventi'
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
    'chat_groups', 'chat_group_members', 'chat_messages', 'chat_message_letti', 'chat_message_hidden',
    'valutazioni', 'punti_eventi'
  ) THEN
    RAISE EXCEPTION 'Tabella non consentita: %', p_table;
  END IF;

  EXECUTE 'DELETE FROM ' || quote_ident(p_table) || ' WHERE ' || p_filter;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
