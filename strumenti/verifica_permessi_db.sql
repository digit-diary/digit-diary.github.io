-- Diritti delle funzioni del database: deve dare 0 righe.
-- Uso: psql ... -f strumenti/verifica_permessi_db.sql
-- 1) funzioni interne ("_...") eseguibili da fuori
-- 2) funzioni senza token che non devono essere pubbliche
-- 3) funzioni pubbliche del programma (secure_*, verify_*, ...) NON eseguibili da anon
SELECT 'interna aperta' AS problema, p.oid::regprocedure AS funzione, r AS ruolo
  FROM pg_proc p, unnest(ARRAY['anon', 'authenticated']) AS r
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname LIKE '\_%'
   AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
   AND has_function_privilege(r, p.oid, 'EXECUTE')
UNION ALL
SELECT 'senza token aperta', p.oid::regprocedure, r
  FROM pg_proc p, unnest(ARRAY['anon', 'authenticated']) AS r
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('get_due_promemoria', 'get_today_birthdays', 'get_my_notes')
   AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
   AND has_function_privilege(r, p.oid, 'EXECUTE')
UNION ALL
SELECT 'pubblica chiusa', p.oid::regprocedure, 'anon'
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname NOT LIKE '\_%'
   AND p.proname NOT IN ('get_due_promemoria', 'get_today_birthdays', 'get_my_notes')
   AND p.prorettype <> 'trigger'::regtype
   AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
   AND NOT has_function_privilege('anon', p.oid, 'EXECUTE');
