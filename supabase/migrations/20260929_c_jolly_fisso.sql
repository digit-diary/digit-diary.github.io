-- ============================================================
-- FISSO / JOLLY SEMPRE ALLINEATI (controllo C, C14, 23/10/2026)
-- Due campi dicono la stessa cosa: impiego (scheda, elenco di Gestione collaboratori) e il
-- vecchio is_jolly (piano, ore dovute, C attorno alle vacanze, CGF). Nei dati veri del 23/10:
--   - Fusetti Nicoletta e Nebiaj Enfris: impiego jolly, is_jolly false (il piano li tratta
--     da fissi, l elenco da Jolly; Salva della scheda rispondeva "Nessuna modifica");
--   - Sanvito, Timonina, Chierico, Della Pace (Tavoli, attivi) e Aricci, Maira (Slots,
--     disattivati): impiego vuoto, is_jolly true (elenco "da indicare", piano Jolly).
-- Da qui il database li tiene allineati a ogni scrittura (trigger): vale l impiego; se cambia
-- solo is_jolly (flussi vecchi del piano) l impiego lo segue; un collaboratore nuovo con
-- is_jolly e senza impiego diventa Jolly; "Da indicare" scelto nella scheda = non Jolly.
-- Una riga che si modifica in altri campi (percentuale, nome...) NON viene toccata: la
-- contraddizione di prima si sistema solo con lo strumento, che mostra prima cosa cambia
-- (Impostazioni > Controlla il sistema > Coerenza fisso/jolly > Allinea).
-- Qui nessun dato viene cambiato: a fine file l elenco delle contraddizioni rimaste.
-- Funzioni nuove: 1 (_collab_jolly_allinea). Rilanciabile.
-- ============================================================

CREATE OR REPLACE FUNCTION public._collab_jolly_allinea()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.impiego := NULLIF(btrim(COALESCE(NEW.impiego, '')), '');
  IF TG_OP = 'INSERT' THEN
    IF NEW.impiego IS NULL AND NEW.is_jolly IS TRUE THEN
      NEW.impiego := 'jolly';
    END IF;
  ELSE
    -- niente cambia nei due campi: la riga resta com e (anche se era in contraddizione)
    IF NEW.impiego IS NOT DISTINCT FROM OLD.impiego AND NEW.is_jolly IS NOT DISTINCT FROM OLD.is_jolly THEN
      RETURN NEW;
    END IF;
    -- cambiato solo il vecchio campo: l impiego lo segue
    IF NEW.impiego IS NOT DISTINCT FROM OLD.impiego THEN
      IF NEW.is_jolly IS TRUE THEN
        NEW.impiego := 'jolly';
      ELSIF NEW.impiego = 'jolly' THEN
        NEW.impiego := 'fisso';
      END IF;
    END IF;
  END IF;
  -- vale l impiego; "da indicare" scelto (o scritto) = non Jolly
  IF NEW.impiego = 'jolly' THEN
    NEW.is_jolly := TRUE;
  ELSIF NEW.impiego = 'fisso' THEN
    NEW.is_jolly := FALSE;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.is_jolly := FALSE;
  ELSE
    NEW.is_jolly := COALESCE(NEW.is_jolly, FALSE);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS collab_jolly_allinea_trg ON public.collaboratori;
CREATE TRIGGER collab_jolly_allinea_trg
  BEFORE INSERT OR UPDATE ON public.collaboratori
  FOR EACH ROW EXECUTE FUNCTION public._collab_jolly_allinea();

-- contraddizioni rimaste (da sistemare con lo strumento Allinea, che le mostra prima)
DO $$
DECLARE
  r RECORD;
  n INT := 0;
BEGIN
  FOR r IN
    SELECT nome, reparto_dip, COALESCE(impiego, '-') AS imp, is_jolly, attivo
    FROM collaboratori
    WHERE (impiego = 'jolly' AND is_jolly IS NOT TRUE)
       OR (impiego = 'fisso' AND is_jolly IS TRUE)
       OR (COALESCE(impiego, '') = '' AND is_jolly IS TRUE)
    ORDER BY attivo DESC, reparto_dip, nome
  LOOP
    n := n + 1;
    RAISE NOTICE 'Fisso/jolly da allineare: % (%, impiego %, piano %, %)', r.nome, r.reparto_dip, r.imp,
      CASE WHEN r.is_jolly THEN 'Jolly' ELSE 'Fisso' END, CASE WHEN r.attivo THEN 'attivo' ELSE 'disattivato' END;
  END LOOP;
  RAISE NOTICE 'Fisso/jolly: % collaboratori in contraddizione (Controlla il sistema > Allinea)', n;
END $$;

-- registro delle migrazioni applicate
INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260929_c_jolly_fisso')
ON CONFLICT (nome) DO NOTHING;
