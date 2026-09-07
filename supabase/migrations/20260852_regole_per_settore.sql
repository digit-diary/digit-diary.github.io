-- REGOLE DEL PIANO PER SETTORE
--
-- Finora le regole (riposo minimo, giorni consecutivi, domeniche libere...)
-- valevano per tutti i settori. Con questa migrazione ogni regola puo' valere
-- per tutti (colonna vuota, come prima) oppure solo per uno o piu' settori.
--
-- Modello: una regola GENERALE (settori vuoto) + eventuali regole SPECIFICHE
-- per settore che hanno la precedenza. Cosi' non si duplicano 35 regole per
-- ogni settore: si scrive l'eccezione solo dove serve davvero.
--
-- Esempio: min_riposo_ore = 11 per tutti, ma i Tavoli hanno 12 ore:
--   riga 1: nome=min_riposo_ore valore=11 settori=NULL      (vale ovunque)
--   riga 2: nome=min_riposo_ore valore=12 settori='tavoli'  (vince nei Tavoli)
--
-- Idempotente: si puo' rieseguire senza effetti.

ALTER TABLE piano_regole ADD COLUMN IF NOT EXISTS settori TEXT;

COMMENT ON COLUMN piano_regole.settori IS
  'Settori a cui si applica la regola, separati da virgola (es. "tavoli,valet"). Vuoto o NULL = vale per tutti i settori. Una regola con settori indicati ha la precedenza su quella generale con lo stesso nome.';

-- Le regole esistenti restano generali (settori NULL): nessun cambio di
-- comportamento per chi aggiorna.

-- Il vecchio vincolo di unicita' sul solo nome impediva di avere la regola
-- generale piu' le eccezioni per settore: si sostituisce con l'unicita' sulla
-- coppia (nome, settori), che continua a evitare i doppioni veri.
ALTER TABLE piano_regole DROP CONSTRAINT IF EXISTS piano_regole_nome_key;

-- Un solo record per (nome, settori): evita doppioni silenziosi che
-- renderebbero imprevedibile quale valore vince.
CREATE UNIQUE INDEX IF NOT EXISTS piano_regole_nome_settori_uniq
  ON piano_regole (nome, COALESCE(settori, ''));
