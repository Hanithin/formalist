-- Un dossier peut se travailler à deux.
--
-- L'assignation est unique : une colonne `assigned_avocat_id` sur la formalité, et
-- rien d'autre. Un avocat qui voulait l'avis d'un confrère - une forme rare, un apport
-- en nature à évaluer, une absence à couvrir - n'avait qu'un choix : lui rendre le
-- dossier en entier, et le perdre de vue.
--
-- Le confrère invité lit et travaille le dossier comme celui qui l'a pris. Il ne le
-- prend pas : l'assignation reste où elle est, c'est elle qui dit qui répond du dossier.
CREATE TABLE IF NOT EXISTS dossier_confreres (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  formalite_id integer NOT NULL REFERENCES formalites(id) ON DELETE CASCADE,
  avocat_id    integer NOT NULL REFERENCES users(id),
  invite_par   integer NOT NULL REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- On n'invite pas deux fois la même personne : le second appel ne doit rien créer.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dossier_confreres_unique
  ON dossier_confreres (formalite_id, avocat_id);

-- La liste des dossiers d'un avocat lit cette table à chaque affichage.
CREATE INDEX IF NOT EXISTS idx_dossier_confreres_avocat
  ON dossier_confreres (avocat_id);
