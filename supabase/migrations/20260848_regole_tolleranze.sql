-- Regole personalizzabili di tolleranza ore (pannello Regole del piano).
-- Nascono SPENTE con valori suggeriti: si attivano dal pannello quando servono.
-- Fissi e jolly con percentuale: max sopra / max sotto l'obiettivo mensile
-- (se attive vincono sulla tolleranza_ore simmetrica); jolly senza percentuale:
-- range assoluto min/max al mese. Applicata in produzione il 01/09/2026.
insert into piano_regole (nome, descrizione, tipo, valore, peso, attivo)
select 'tolleranza_ore_sopra', 'Ore massime SOPRA l''obiettivo mensile (fissi e jolly con %). Se attiva vince sulla tolleranza_ore simmetrica', 'SOFT', '10', 0, false
where not exists (select 1 from piano_regole where nome = 'tolleranza_ore_sopra');
insert into piano_regole (nome, descrizione, tipo, valore, peso, attivo)
select 'tolleranza_ore_sotto', 'Ore massime SOTTO l''obiettivo mensile (fissi e jolly con %). Se attiva vince sulla tolleranza_ore simmetrica', 'SOFT', '10', 0, false
where not exists (select 1 from piano_regole where nome = 'tolleranza_ore_sotto');
insert into piano_regole (nome, descrizione, tipo, valore, peso, attivo)
select 'jolly_ore_min', 'Ore MINIME al mese per i jolly senza percentuale (solo avviso del validatore)', 'SOFT', '40', 0, false
where not exists (select 1 from piano_regole where nome = 'jolly_ore_min');
insert into piano_regole (nome, descrizione, tipo, valore, peso, attivo)
select 'jolly_ore_max', 'Ore MASSIME al mese per i jolly senza percentuale (validatore + generatore)', 'SOFT', '150', 0, false
where not exists (select 1 from piano_regole where nome = 'jolly_ore_max');
