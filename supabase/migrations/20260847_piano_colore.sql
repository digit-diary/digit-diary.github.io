-- Colore personalizzato della singola cella del piano (palette "Colori" in alto,
-- come il secchiello di Excel): solo visivo, il colore del turno non cambia mai.
-- Applicata in produzione il 01/09/2026.
alter table piano add column if not exists colore text;
