-- Diritti delle funzioni e delle tabelle del database: deve dare 0 righe.
-- Uso: psql ... -f strumenti/verifica_permessi_db.sql
-- 1) funzioni interne ("_...") eseguibili da fuori
-- 2) funzioni senza token che non devono essere pubbliche
-- 3) funzioni pubbliche del programma (secure_*, verify_*, ...) NON eseguibili da anon
-- 4) tabelle senza RLS (seconda barriera, dalla 20260911)
-- 5) tabelle o contatori con diritti diretti per anon/authenticated: il programma passa
--    solo dalle funzioni (20260911)
-- 6) diritti predefiniti che darebbero diritti diretti alle tabelle nuove
-- 7) diritti predefiniti che renderebbero le funzioni NUOVE eseguibili da tutti (PUBLIC) o
--    da anon/authenticated senza un GRANT esplicito della migrazione (20260895; dal
--    20260913 1_prepara_database.sql non le concede piu)
-- Le tabelle che cominciano con "_" sono copie di prova della copia locale (_bk_*,
-- _ck_*, ...): compaiono come "di prova" e nel cloud non esistono.
SELECT 'interna aperta' AS problema, p.oid::regprocedure::text AS oggetto, r AS ruolo
  FROM pg_proc p, unnest(ARRAY['anon', 'authenticated']) AS r
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname LIKE '\_%'
   AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
   AND has_function_privilege(r, p.oid, 'EXECUTE')
UNION ALL
SELECT 'senza token aperta', p.oid::regprocedure::text, r
  FROM pg_proc p, unnest(ARRAY['anon', 'authenticated']) AS r
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('get_due_promemoria', 'get_today_birthdays', 'get_my_notes')
   AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
   AND has_function_privilege(r, p.oid, 'EXECUTE')
UNION ALL
SELECT 'pubblica chiusa', p.oid::regprocedure::text, 'anon'
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname NOT LIKE '\_%'
   AND p.proname NOT IN ('get_due_promemoria', 'get_today_birthdays', 'get_my_notes')
   AND p.prorettype <> 'trigger'::regtype
   AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
   AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
UNION ALL
SELECT CASE WHEN c.relname LIKE '\_%' THEN 'tabella di prova senza RLS' ELSE 'tabella senza RLS' END,
       c.oid::regclass::text, '-'
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace
   AND c.relkind IN ('r', 'p')
   AND NOT c.relrowsecurity
UNION ALL
SELECT CASE WHEN c.relname LIKE '\_%' THEN 'tabella di prova con diritti diretti' ELSE 'tabella con diritti diretti' END,
       c.oid::regclass::text, r
  FROM pg_class c, unnest(ARRAY['anon', 'authenticated']) AS r
 WHERE c.relnamespace = 'public'::regnamespace
   AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
   AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
   AND has_table_privilege(r, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
UNION ALL
SELECT 'contatore con diritti diretti', c.oid::regclass::text, r
  FROM pg_class c, unnest(ARRAY['anon', 'authenticated']) AS r
 WHERE c.relnamespace = 'public'::regnamespace
   AND c.relkind = 'S'
   AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
   AND has_sequence_privilege(r, c.oid, 'USAGE, SELECT, UPDATE')
UNION ALL
SELECT 'diritti predefiniti alle tabelle nuove', d.defaclrole::regrole::text || ' (' || d.defaclobjtype::text || ')', r
  FROM pg_default_acl d, unnest(ARRAY['anon', 'authenticated']) AS r
 WHERE d.defaclnamespace = 'public'::regnamespace
   AND d.defaclobjtype IN ('r', 'S')
   AND d.defaclrole IN (SELECT c.relowner FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace)
   AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
   AND EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = (SELECT oid FROM pg_roles WHERE rolname = r))
UNION ALL
SELECT 'funzioni nuove eseguibili da tutti', o.rolname || ' (globale)', 'PUBLIC'
  FROM (SELECT DISTINCT p.proowner FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
          AND NOT EXISTS (SELECT 1 FROM pg_depend e WHERE e.objid = p.oid AND e.deptype = 'e')) x
  JOIN pg_roles o ON o.oid = x.proowner
 WHERE NOT EXISTS (SELECT 1 FROM pg_default_acl d
                    WHERE d.defaclrole = x.proowner AND d.defaclnamespace = 0 AND d.defaclobjtype = 'f'
                      AND NOT EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 0))
UNION ALL
SELECT 'diritti predefiniti alle funzioni nuove',
       d.defaclrole::regrole::text || CASE WHEN d.defaclnamespace = 0 THEN ' (globale)' ELSE ' (public)' END, r
  FROM pg_default_acl d, unnest(ARRAY['anon', 'authenticated']) AS r
 WHERE d.defaclobjtype = 'f'
   AND d.defaclnamespace IN (0, 'public'::regnamespace)
   AND d.defaclrole IN (SELECT p.proowner FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
                          AND NOT EXISTS (SELECT 1 FROM pg_depend e WHERE e.objid = p.oid AND e.deptype = 'e'))
   AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
   AND EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = (SELECT oid FROM pg_roles WHERE rolname = r));
