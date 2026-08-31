-- Ce que le guichet unique tient de nos dossiers.
--
-- Une table à part, et non une clé de plus dans `formalites.data_json` : celui-ci est
-- le brouillon du client, réécrit à chaque saisie. Une référence de dépôt faite en son
-- nom ne doit pas pouvoir être écrasée par une frappe dans un formulaire. Et l'état se
-- lit par statut - « quels dépôts attendent une régularisation » - ce qu'une colonne
-- JSON rend pénible et lent.
--
-- Le rattachement se fait dans les deux sens : notre dossier porte la référence que le
-- guichet nous rendra, et le dépôt porte l'identifiant que le guichet lui a donné.

CREATE TABLE IF NOT EXISTS depots_guichet (
  id            SERIAL PRIMARY KEY,
  dossier_id    INTEGER NOT NULL REFERENCES formalites(id) ON DELETE CASCADE,

  -- L'identifiant du guichet. Absent tant que le dépôt n'a pas été accepté : on
  -- enregistre l'intention avant de connaître son numéro.
  formalite_id  INTEGER,

  -- La référence libre posée à l'envoi, telle que le guichet nous la rendra.
  reference     TEXT NOT NULL,

  -- Le dernier état connu, et la date que le guichet y attache - non la nôtre : c'est
  -- la sienne qui dit quand la chose a bougé chez lui.
  statut        TEXT,
  statut_le     TIMESTAMPTZ,

  -- Le numéro national, délivré au paiement.
  num_nat       TEXT,

  -- Quand nous avons regardé pour la dernière fois. Distinct de `statut_le` : un dépôt
  -- consulté hier et inchangé depuis un mois a deux dates différentes, et c'est celle-ci
  -- qui dit si notre copie est fraîche.
  vu_le         TIMESTAMPTZ,

  -- L'environnement d'où vient la ligne. Un dépôt de démonstration et un dépôt de
  -- production portent des identifiants qui se ressemblent : sans cette colonne, une
  -- bascule d'environnement ferait consulter l'un en croyant lire l'autre.
  environnement TEXT NOT NULL DEFAULT 'demonstration',

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un dossier n'a qu'un dépôt par environnement : redéposer remplace, il n'empile pas.
CREATE UNIQUE INDEX IF NOT EXISTS depots_guichet_dossier_env
  ON depots_guichet (dossier_id, environnement);

-- La référence est ce que le guichet nous rend : on l'interroge dans ce sens-là.
CREATE UNIQUE INDEX IF NOT EXISTS depots_guichet_reference
  ON depots_guichet (reference, environnement);

-- « Ce qui attend un geste du cabinet » se lit par statut.
CREATE INDEX IF NOT EXISTS depots_guichet_statut ON depots_guichet (statut);
