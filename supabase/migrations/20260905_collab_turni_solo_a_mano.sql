-- ============================================================
-- TURNI SOLO A MANO (v416, decisione del titolare 08/10/2026)
-- Per chi non sta nella rotazione dei turni (es. la responsabile che fa ufficio): bozza,
-- Migliora la bozza, Migliora ore, coperture e cambi non le propongono mai turni e la
-- bozza non le riempie i giorni vuoti. Le ore contano come sempre (ore dovute, saldo,
-- Valida, vacanze); i turni e i codici si scrivono a mano. Si imposta nel Piano,
-- Impostazioni, Preferenze collaboratori.
-- Si puo rilanciare.
-- ============================================================
ALTER TABLE public.collaboratori ADD COLUMN IF NOT EXISTS turni_solo_a_mano BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.collaboratori.turni_solo_a_mano IS
  'true = il programma non propone turni (bozza, Migliora, coperture, cambi); turni scritti a mano, ore conteggiate come sempre';
NOTIFY pgrst, 'reload schema';
