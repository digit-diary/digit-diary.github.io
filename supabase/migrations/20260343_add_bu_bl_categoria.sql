-- Corregge valori categoria non validi e aggiunge bu/bl
ALTER TABLE maison_budget DROP CONSTRAINT IF EXISTS maison_budget_categoria_check;

-- Pulisci valori non validi (es. 'mensile' o altri)
UPDATE maison_budget SET categoria = NULL
  WHERE categoria IS NOT NULL
  AND categoria NOT IN ('full_maison', 'maison', 'direzione', 'bu', 'bl');

ALTER TABLE maison_budget ADD CONSTRAINT maison_budget_categoria_check
  CHECK (categoria IN ('full_maison', 'maison', 'direzione', 'bu', 'bl') OR categoria IS NULL);
