-- v340 · Congedo non pagato: OGNI giorno di congedo sposta in avanti l anzianita
-- di servizio (giubilei e giorni di vacanza in piu), non solo i congedi oltre
-- 6 mesi (decisione del titolare 01.10.2026). Soglia congedo_np_mesi_anzianita = 0.
UPDATE piano_regole SET valore = '0',
  descrizione = 'Congedo non pagato: mesi oltre i quali sposta l anzianita (0 = ogni giorno di congedo la sposta)'
WHERE nome = 'congedo_np_mesi_anzianita';
