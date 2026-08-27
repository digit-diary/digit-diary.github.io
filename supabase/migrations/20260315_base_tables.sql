-- ============================================================
-- BASE SCHEMA — Diario Collaboratori
-- Ricostruzione delle tabelle base (in origine create via Dashboard).
-- Colonne ricavate da: backup dati 25/04/2026, DDL in _archive/ e codice app.
-- Le migrazioni successive (20260318+) presuppongono queste tabelle.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. registrazioni (diario) — id generato dal client (Date.now())
CREATE TABLE IF NOT EXISTS registrazioni (
  id            BIGINT PRIMARY KEY,
  nome          TEXT NOT NULL,
  tipo          TEXT NOT NULL,
  testo         TEXT NOT NULL,
  data          TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  operatore     TEXT DEFAULT '',
  importo       NUMERIC(10,2) DEFAULT 0,
  valuta        TEXT DEFAULT '',
  reparto       TEXT DEFAULT '',
  modificato_da TEXT DEFAULT NULL,
  reparto_dip   TEXT NOT NULL DEFAULT 'slots',
  eliminato     BOOLEAN DEFAULT FALSE,
  eliminato_da  TEXT,
  eliminato_at  TIMESTAMPTZ,
  origine       TEXT DEFAULT 'manual'
);
CREATE INDEX IF NOT EXISTS idx_registrazioni_nome ON registrazioni (nome);
CREATE INDEX IF NOT EXISTS idx_registrazioni_tipo ON registrazioni (tipo);
CREATE INDEX IF NOT EXISTS idx_registrazioni_data ON registrazioni (data DESC);

-- 2. collaboratori (lista master nomi per autocomplete)
CREATE TABLE IF NOT EXISTS collaboratori (
  id           BIGSERIAL PRIMARY KEY,
  nome         TEXT NOT NULL UNIQUE,
  attivo       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT now(),
  data_nascita DATE
);

-- 3. impostazioni (chiave/valore, include password master e groq key)
CREATE TABLE IF NOT EXISTS impostazioni (
  chiave TEXT PRIMARY KEY,
  valore TEXT
);

-- 4. operatori_auth (login operatori)
CREATE TABLE IF NOT EXISTS operatori_auth (
  nome              TEXT PRIMARY KEY,
  pwd_hash          TEXT,
  recovery_code     TEXT DEFAULT '',
  ruolo             TEXT DEFAULT 'operatore',
  created_at        TIMESTAMPTZ DEFAULT now(),
  deve_cambiare_pwd BOOLEAN DEFAULT FALSE,
  pwd_hash_v2       TEXT
);

-- 5. note_colleghi (chat legacy, mantenuta per compatibilita e storico)
CREATE TABLE IF NOT EXISTS note_colleghi (
  id            BIGSERIAL PRIMARY KEY,
  da_operatore  TEXT NOT NULL,
  a_operatore   TEXT NOT NULL,
  messaggio     TEXT DEFAULT '',
  letta         BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  nascosta_dest BOOLEAN DEFAULT FALSE,
  nascosta_mitt BOOLEAN DEFAULT FALSE,
  gruppo_id     TEXT,
  letta_at      TIMESTAMPTZ,
  reazioni      JSONB DEFAULT '{}'::jsonb,
  importante    BOOLEAN DEFAULT FALSE,
  urgente       BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_note_colleghi_dest ON note_colleghi (a_operatore, letta);
CREATE INDEX IF NOT EXISTS idx_note_colleghi_created ON note_colleghi (created_at DESC);

-- 6. moduli (disciplinari: allineamento / apprezzamento / rdi)
CREATE TABLE IF NOT EXISTS moduli (
  id            BIGSERIAL PRIMARY KEY,
  tipo          TEXT NOT NULL,
  collaboratore TEXT NOT NULL,
  resp_settore  TEXT DEFAULT '',
  data_modulo   TEXT DEFAULT '',
  dati          JSONB DEFAULT '{}'::jsonb,
  operatore     TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT now(),
  reparto_dip   TEXT NOT NULL DEFAULT 'slots',
  modificato_da TEXT DEFAULT NULL,
  eliminato     BOOLEAN DEFAULT FALSE,
  eliminato_da  TEXT,
  eliminato_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_moduli_collaboratore ON moduli (collaboratore);
CREATE INDEX IF NOT EXISTS idx_moduli_created ON moduli (created_at DESC);

-- 7. log_attivita (registro azioni operatori)
CREATE TABLE IF NOT EXISTS log_attivita (
  id         BIGSERIAL PRIMARY KEY,
  operatore  TEXT DEFAULT '',
  azione     TEXT NOT NULL,
  dettaglio  TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_log_attivita_created ON log_attivita (created_at DESC);

-- 8. costi_maison (spese ristorante clienti VIP)
CREATE TABLE IF NOT EXISTS costi_maison (
  id            BIGSERIAL PRIMARY KEY,
  data_giornata DATE NOT NULL,
  nome          TEXT NOT NULL,
  px            INTEGER DEFAULT 1,
  costo         NUMERIC(10,2) DEFAULT 0,
  tipo_buono    TEXT CHECK (tipo_buono IN ('BU', 'BL') OR tipo_buono IS NULL),
  note          TEXT DEFAULT '',
  gruppo        TEXT DEFAULT '',
  operatore     TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT now(),
  reparto_dip   TEXT NOT NULL DEFAULT 'slots'
);
CREATE INDEX IF NOT EXISTS idx_costi_maison_data ON costi_maison (data_giornata DESC);
CREATE INDEX IF NOT EXISTS idx_costi_maison_nome ON costi_maison (nome);

-- 9. maison_budget (scheda clienti: budget, categoria, compleanno)
CREATE TABLE IF NOT EXISTS maison_budget (
  id            BIGSERIAL PRIMARY KEY,
  nome          TEXT NOT NULL UNIQUE,
  budget_chf    NUMERIC(10,2),
  budget_bu     INTEGER,
  budget_bl     INTEGER,
  periodo       TEXT DEFAULT 'mensile' CHECK (periodo IN ('mensile', 'annuale')),
  created_at    TIMESTAMPTZ DEFAULT now(),
  data_nascita  DATE,
  categoria     TEXT,
  reparto_dip   TEXT NOT NULL DEFAULT 'slots',
  aggiornato_da TEXT DEFAULT NULL,
  aggiornato_at TIMESTAMPTZ DEFAULT NULL
);

-- 10. promemoria
CREATE TABLE IF NOT EXISTS promemoria (
  id            BIGSERIAL PRIMARY KEY,
  titolo        TEXT NOT NULL,
  descrizione   TEXT DEFAULT '',
  data_scadenza DATE NOT NULL,
  assegnato_a   TEXT DEFAULT 'tutti',
  creato_da     TEXT DEFAULT '',
  completata    BOOLEAN DEFAULT FALSE,
  completata_da TEXT,
  completata_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  push_sent_at  TIMESTAMPTZ DEFAULT NULL,
  ripetizione   TEXT DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_promemoria_scadenza ON promemoria (data_scadenza);

-- 11. consegne_turno
CREATE TABLE IF NOT EXISTS consegne_turno (
  id            BIGSERIAL PRIMARY KEY,
  data_giornata DATE NOT NULL,
  turno_uscente TEXT NOT NULL,
  operatore     TEXT DEFAULT '',
  messaggio     TEXT NOT NULL,
  priorita      TEXT DEFAULT 'normale',
  letto_da      TEXT,
  letto_at      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  destinatario  TEXT DEFAULT 'tutti',
  reparto_dip   TEXT NOT NULL DEFAULT 'slots'
);
CREATE INDEX IF NOT EXISTS idx_consegne_created ON consegne_turno (created_at DESC);

-- 12. spese_extra (cene esterne, viaggi, rimborsi)
CREATE TABLE IF NOT EXISTS spese_extra (
  id           BIGSERIAL PRIMARY KEY,
  beneficiario TEXT NOT NULL,
  tipo         TEXT DEFAULT 'altro',
  descrizione  TEXT DEFAULT '',
  importo      NUMERIC(10,2) DEFAULT 0,
  data_spesa   DATE NOT NULL,
  luogo        TEXT DEFAULT '',
  operatore    TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT now(),
  reparto_dip  TEXT NOT NULL DEFAULT 'slots'
);
CREATE INDEX IF NOT EXISTS idx_spese_extra_data ON spese_extra (data_spesa DESC);

-- 13. regali_maison
CREATE TABLE IF NOT EXISTS regali_maison (
  id          BIGSERIAL PRIMARY KEY,
  nome        TEXT NOT NULL,
  descrizione TEXT DEFAULT '',
  importo     NUMERIC(10,2),
  data_regalo DATE,
  operatore   TEXT DEFAULT '',
  reparto_dip TEXT NOT NULL DEFAULT 'slots',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 14. note_clienti (note private sui clienti maison)
CREATE TABLE IF NOT EXISTS note_clienti (
  id          BIGSERIAL PRIMARY KEY,
  nome        TEXT NOT NULL,
  nota        TEXT NOT NULL,
  operatore   TEXT DEFAULT '',
  reparto_dip TEXT NOT NULL DEFAULT 'slots',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 15. rapporti_giornalieri (n_assegni e prelievi sono campi testo liberi)
CREATE TABLE IF NOT EXISTS rapporti_giornalieri (
  id            BIGSERIAL PRIMARY KEY,
  data_rapporto DATE NOT NULL,
  turno         TEXT NOT NULL CHECK (turno IN ('PRESTO', 'NOTTE')),
  sup_note      TEXT DEFAULT '',
  cassa_note    TEXT DEFAULT '',
  sala_note     TEXT DEFAULT '',
  n_assegni     TEXT DEFAULT '',
  prelievi      TEXT DEFAULT '',
  assenze       TEXT DEFAULT '',
  operatore     TEXT DEFAULT '',
  updated_at    TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now(),
  note_extra    TEXT DEFAULT '',
  reparto_dip   TEXT NOT NULL DEFAULT 'slots',
  UNIQUE (data_rapporto, turno)
);
CREATE INDEX IF NOT EXISTS idx_rapporti_data ON rapporti_giornalieri (data_rapporto DESC);

-- 16. note_fissate (pin su registrazioni)
CREATE TABLE IF NOT EXISTS note_fissate (
  registrazione_id BIGINT PRIMARY KEY REFERENCES registrazioni(id) ON DELETE CASCADE,
  fissata_at       TIMESTAMPTZ DEFAULT now()
);

-- 17. scadenze (promemoria legati a registrazioni)
CREATE TABLE IF NOT EXISTS scadenze (
  id               BIGSERIAL PRIMARY KEY,
  registrazione_id BIGINT REFERENCES registrazioni(id) ON DELETE SET NULL,
  titolo           TEXT NOT NULL,
  descrizione      TEXT DEFAULT '',
  data_scadenza    DATE NOT NULL,
  completata       BOOLEAN DEFAULT FALSE,
  completata_da    TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scadenze_data ON scadenze (data_scadenza);

-- 18. push_subscriptions (Web Push)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           BIGSERIAL PRIMARY KEY,
  operatore    TEXT NOT NULL,
  reparto_dip  TEXT NOT NULL DEFAULT 'slots',
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ps_operatore ON push_subscriptions (operatore);
CREATE INDEX IF NOT EXISTS idx_ps_reparto ON push_subscriptions (reparto_dip);

-- RLS: abilitata su tutto, deny-all di default (nessuna policy).
-- Le policy specifiche vengono create dalle migrazioni successive
-- (20260316 security, 20260318 secure_all, 20260323/24 deny_all_anon).
ALTER TABLE registrazioni        ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaboratori        ENABLE ROW LEVEL SECURITY;
ALTER TABLE impostazioni         ENABLE ROW LEVEL SECURITY;
ALTER TABLE operatori_auth       ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_colleghi        ENABLE ROW LEVEL SECURITY;
ALTER TABLE moduli               ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_attivita         ENABLE ROW LEVEL SECURITY;
ALTER TABLE costi_maison         ENABLE ROW LEVEL SECURITY;
ALTER TABLE maison_budget        ENABLE ROW LEVEL SECURITY;
ALTER TABLE promemoria           ENABLE ROW LEVEL SECURITY;
ALTER TABLE consegne_turno       ENABLE ROW LEVEL SECURITY;
ALTER TABLE spese_extra          ENABLE ROW LEVEL SECURITY;
ALTER TABLE regali_maison        ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_clienti         ENABLE ROW LEVEL SECURITY;
ALTER TABLE rapporti_giornalieri ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_fissate         ENABLE ROW LEVEL SECURITY;
ALTER TABLE scadenze             ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions   ENABLE ROW LEVEL SECURITY;
