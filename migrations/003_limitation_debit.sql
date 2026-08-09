-- Limitation de débit persistée.
--
-- Le compteur du serveur d'origine vit en mémoire : il repart à zéro à chaque
-- redémarrage - ce qui suffit à contourner la limite - et deux instances comptent
-- chacune de leur côté. En base, il survit et vaut pour toute l'application.

CREATE TABLE IF NOT EXISTS tentatives (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Quoi est limité : "contact", "connexion", "inscription"
  action TEXT NOT NULL,
  -- Qui : adresse IP, ou email selon l'action. Jamais les deux dans la même clé,
  -- sinon changer d'adresse suffit à repartir de zéro.
  cle TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- La requête est toujours « les tentatives de cette clé depuis telle date »
CREATE INDEX IF NOT EXISTS idx_tentatives_cle ON tentatives(action, cle, created_at DESC);
