-- ============================================================
-- registrazioni.id: l'app genera gli id lato client (Date.now()),
-- ma la tabella era rimasta senza DEFAULT — qualsiasi insert senza
-- id esplicito falliva. Aggiunto default da sequenza (compatibile
-- con gli id espliciti del client) per robustezza e per l'IT.
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS registrazioni_id_seq;
ALTER TABLE registrazioni ALTER COLUMN id SET DEFAULT nextval('registrazioni_id_seq');
ALTER SEQUENCE registrazioni_id_seq OWNED BY registrazioni.id;
SELECT setval('registrazioni_id_seq', COALESCE((SELECT MAX(id) FROM registrazioni), 0) + 1, false);
