-- Settore sul registro attività: i nuovi log portano il reparto, così lo
-- storico del piano mostra a ogni settore solo le sue modifiche.
-- Applicata in produzione il 02/09/2026.
alter table log_attivita add column if not exists reparto_dip text;
