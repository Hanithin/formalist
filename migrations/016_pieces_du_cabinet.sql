-- Les pièces que le cabinet fournit quand il domicilie une société.
--
-- Elles ne dépendent d'aucun dossier : ce sont les siennes, les mêmes à chaque fois -
-- son extrait Kbis, la pièce d'identité de son représentant, son justificatif de
-- domicile. Les recopier dans chaque dossier les ferait vieillir en silence : un Kbis
-- de six mois se dépose sans que rien ne le dise, et le greffe le refuse des semaines
-- plus tard.
--
-- Une table à part, donc, avec la date que porte la pièce - non celle du téléversement.
-- C'est elle qui décide de la fraîcheur, et elle seule : un Kbis tiré en janvier et
-- déposé ici en juin est périmé le jour où on le dépose.
CREATE TABLE IF NOT EXISTS pieces_du_cabinet (
  -- « cabinet-kbis », « cabinet-identite », « cabinet-domicile ». Le domaine les nomme.
  identifiant  TEXT PRIMARY KEY,

  nom_fichier  TEXT NOT NULL,
  -- Le chemin dans uploads/, comme les pièces des dossiers.
  chemin       TEXT NOT NULL,

  -- La date portée par la pièce. Nulle pour ce qui ne se périme pas.
  etabli_le    DATE,

  depose_par   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  depose_le    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
