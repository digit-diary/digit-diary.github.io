-- Push Subscriptions table for Web Push notifications
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

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_ps" ON push_subscriptions FOR SELECT USING (true);
CREATE POLICY "anon_insert_ps" ON push_subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_ps" ON push_subscriptions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_ps" ON push_subscriptions FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_ps_operatore ON push_subscriptions (operatore);
CREATE INDEX IF NOT EXISTS idx_ps_reparto ON push_subscriptions (reparto_dip);
