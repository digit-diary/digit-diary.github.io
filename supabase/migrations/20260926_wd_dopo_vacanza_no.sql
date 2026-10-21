-- ============================================================
-- WD DOPO LE VACANZE: NO (decisione del titolare 21/10/2026)
-- Dopo il blocco di C che segue le vacanze il primo turno non deve essere per forza
-- diurno: va bene anche la notte. Il vincolo resta solo PRIMA delle vacanze (l ultimo
-- giorno di lavoro prima delle C di partenza senza notte, regola diurno_prima_vacanza).
-- La regola wd_dopo_vacanza resta configurabile (Piano > Regole > Vacanze): con 1 o piu
-- tornano i WD dopo le C del rientro come prima. Qui si porta a 0 solo se ha ancora il
-- valore iniziale 1 (mai modificato dal titolare). Rilanciabile.
-- ============================================================
UPDATE piano_regole SET valore = '0',
  descrizione = 'Giorni di lavoro diurno obbligato (WD) dopo i congedi del rientro (0 = nessuno)'
WHERE nome = 'wd_dopo_vacanza' AND trim(coalesce(valore, '')) = '1';

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260926_wd_dopo_vacanza_no')
ON CONFLICT (nome) DO NOTHING;
