-- Aggiunge CG e WL ai valori permessi per tipo_buono in costi_maison
ALTER TABLE costi_maison DROP CONSTRAINT IF EXISTS costi_maison_tipo_buono_check;

-- Pulisci valori non validi
UPDATE costi_maison SET tipo_buono = NULL
  WHERE tipo_buono IS NOT NULL
  AND tipo_buono NOT IN ('BU', 'BL', 'CG', 'WL', '');

ALTER TABLE costi_maison ADD CONSTRAINT costi_maison_tipo_buono_check
  CHECK (tipo_buono IN ('BU', 'BL', 'CG', 'WL', '') OR tipo_buono IS NULL);
