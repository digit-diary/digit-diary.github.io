-- Pulizia duplicati Seven in spese_extra
-- Mantiene solo la riga più recente per ogni combinazione beneficiario+data+importo
DELETE FROM spese_extra
WHERE id NOT IN (
  SELECT MIN(id) FROM spese_extra
  WHERE luogo = 'Ristorante Seven'
  GROUP BY beneficiario, data_spesa, importo
)
AND luogo = 'Ristorante Seven';
