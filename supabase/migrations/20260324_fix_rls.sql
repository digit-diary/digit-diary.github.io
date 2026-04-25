-- Fix: rimuove TUTTE le policy permissive esistenti e ricrea deny_all
-- note_colleghi
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename='note_colleghi' AND schemaname='public') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON note_colleghi';
  END LOOP;
END $$;
CREATE POLICY "deny_all_anon" ON note_colleghi FOR ALL TO anon USING (false) WITH CHECK (false);

-- costi_maison
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename='costi_maison' AND schemaname='public') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON costi_maison';
  END LOOP;
END $$;
CREATE POLICY "deny_all_anon" ON costi_maison FOR ALL TO anon USING (false) WITH CHECK (false);

-- log_attivita
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename='log_attivita' AND schemaname='public') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON log_attivita';
  END LOOP;
END $$;
CREATE POLICY "deny_all_anon" ON log_attivita FOR ALL TO anon USING (false) WITH CHECK (false);

-- collaboratori
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename='collaboratori' AND schemaname='public') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON collaboratori';
  END LOOP;
END $$;
CREATE POLICY "deny_all_anon" ON collaboratori FOR ALL TO anon USING (false) WITH CHECK (false);

-- consegne_turno
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename='consegne_turno' AND schemaname='public') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON consegne_turno';
  END LOOP;
END $$;
CREATE POLICY "deny_all_anon" ON consegne_turno FOR ALL TO anon USING (false) WITH CHECK (false);

-- spese_extra
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename='spese_extra' AND schemaname='public') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON spese_extra';
  END LOOP;
END $$;
CREATE POLICY "deny_all_anon" ON spese_extra FOR ALL TO anon USING (false) WITH CHECK (false);

-- impostazioni
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename='impostazioni' AND schemaname='public') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON impostazioni';
  END LOOP;
END $$;
CREATE POLICY "deny_all_anon" ON impostazioni FOR ALL TO anon USING (false) WITH CHECK (false);
