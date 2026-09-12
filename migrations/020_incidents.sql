-- Ce qui casse en production, et que personne ne voit.
--
-- Une erreur serveur partait dans le journal du conteneur : lisible tant qu'on regarde,
-- perdue au redéploiement, et jamais consultée puisque rien n'en signale l'arrivée. Le
-- seul détecteur d'incident était le client qui écrit pour dire que ça n'a pas marché.
--
-- Une ligne par signature d'erreur, non par occurrence : la même panne répétée mille
-- fois ne doit pas produire mille lignes à lire, mais une ligne qui dit « mille fois,
-- la dernière il y a deux minutes ». L'empreinte regroupe sur le type, le message
-- normalisé et l'origine dans le code - les identifiants et les nombres y sont masqués,
-- sans quoi chaque dossier ferait son propre incident.
--
-- Ce qui n'est pas écrit ici : le corps des requêtes, les en-têtes, les paramètres, ni
-- qui a rencontré la panne. Un journal d'incidents qui recopie ce que le client a saisi
-- devient un second fichier de données personnelles, hors de tout registre de
-- traitement. Le chemin, la méthode et la pile suffisent à reproduire ; le reste ne
-- servirait qu'à profiler.

CREATE TABLE IF NOT EXISTS incidents (
  id             SERIAL PRIMARY KEY,
  empreinte      TEXT        NOT NULL UNIQUE,
  type           TEXT        NOT NULL,
  message        TEXT        NOT NULL,
  chemin         TEXT,
  methode        TEXT,
  origine        TEXT,
  pile           TEXT,
  occurrences    INTEGER     NOT NULL DEFAULT 1,
  premiere_le    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  derniere_le    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolu_le      TIMESTAMPTZ,
  resolu_par     INTEGER
);

-- La liste se lit toujours de la même façon : les ouverts, du plus récent au plus vieux.
CREATE INDEX IF NOT EXISTS idx_incidents_ouverts
  ON incidents (resolu_le, derniere_le DESC);
