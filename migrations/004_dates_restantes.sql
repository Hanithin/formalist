-- Colonnes de date restées en texte.
--
-- La conversion initiale reconnaissait les noms de colonnes par une liste, et six
-- lui ont échappé : opened_at, finalized_at, done_at, archived_at, last_seen_at et
-- last_login_at. Elles se comparaient donc comme du texte, ce qui fonctionne par
-- chance tant que le format est ISO, et cesse dès qu'un fuseau ou un espace s'y
-- glisse.
--
-- Le schéma initial est corrigé depuis : sur une base neuve, ces colonnes sont
-- déjà des dates. La migration ne fait donc rien dans ce cas - sans cette
-- condition, elle échoue en comparant une date à une chaîne vide.
--
-- Une valeur illisible devient NULL plutôt que de faire échouer la reprise : un
-- horodatage manquant vaut mieux qu'une migration bloquée.

DO $$
DECLARE
  cible RECORD;
BEGIN
  FOR cible IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type = 'text'
      AND column_name IN (
        'opened_at', 'finalized_at', 'done_at', 'archived_at',
        'last_seen_at', 'last_login_at'
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE TIMESTAMPTZ USING NULLIF(%I, '''')::TIMESTAMPTZ',
      cible.table_name, cible.column_name, cible.column_name
    );
    RAISE NOTICE 'converti : %.%', cible.table_name, cible.column_name;
  END LOOP;
END $$;
