-- Termine di consegna della lista non disponibilita' dei Jolly: era scritto
-- fisso nel codice ("entro il 3 del mese"), ora e' una regola modificabile
-- dall'admin come tutte le altre (direttiva interna 16-007_Piani di lavoro).
insert into piano_regole (nome, valore, tipo, attivo, descrizione)
select 'nd_jolly_giorno', '3', 'PIPELINE', true,
  'Giorno del mese entro cui i Jolly consegnano la lista delle non disponibilita'' (formulario HR 1187)'
where not exists (select 1 from piano_regole where nome = 'nd_jolly_giorno');
