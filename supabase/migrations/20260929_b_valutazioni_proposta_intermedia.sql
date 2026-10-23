-- 23/10/2026 (controllo QA audit B): l'editor delle valutazioni salva "proposta_sviluppo"
-- (v286, scheda HR rev. 2026) ma nessuna migrazione ha mai creato la colonna: "Salva"
-- nell'editor falliva con 'column "proposta_sviluppo" ... does not exist'.
-- L'editor propone anche il tipo "intermedia", che il vincolo del database rifiutava.
-- Idempotente: si puo' applicare piu' volte.
ALTER TABLE public.valutazioni ADD COLUMN IF NOT EXISTS proposta_sviluppo text;
ALTER TABLE public.valutazioni DROP CONSTRAINT IF EXISTS valutazioni_tipo_check;
ALTER TABLE public.valutazioni
  ADD CONSTRAINT valutazioni_tipo_check CHECK (tipo = ANY (ARRAY['valutazione'::text, 'autovalutazione'::text, 'intermedia'::text]));
NOTIFY pgrst, 'reload schema';

-- registro delle migrazioni applicate
INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260929_b_valutazioni_proposta_intermedia')
ON CONFLICT (nome) DO NOTHING;
