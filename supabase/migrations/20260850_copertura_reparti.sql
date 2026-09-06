-- Multi-settore: un collaboratore appartiene al SUO settore (reparto_dip) e
-- puo' COPRIRE i buchi in altri settori (reparti_extra). Qui si registrano le
-- condizioni della copertura, senza toccare la percentuale del contratto che
-- resta una sola, del settore principale.
-- Formato: {"valet": {"max_turni": 4, "gruppi": "REC", "accompagnato": true}}
--   max_turni   = tetto mensile di turni in quel settore (0/assente = nessun limite)
--   gruppi      = solo questi gruppi di turni (vuoto = tutti)
--   accompagnato= lavora affiancato in quel settore
alter table collaboratori drop column if exists ripartizione_reparti;
alter table collaboratori add column if not exists copertura_reparti jsonb;
comment on column collaboratori.copertura_reparti is
  'Condizioni di copertura negli altri settori: {"valet":{"max_turni":4,"gruppi":"REC","accompagnato":true}}';
