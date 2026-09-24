-- Le contrôle automatique d'une pièce d'identité déposée.
--
-- Le verdict est gardé avec la pièce, et non recalculé à l'affichage : la lecture
-- coûte un appel au modèle, et surtout elle n'est pas reproductible - relire la même
-- carte deux jours plus tard peut rendre un texte légèrement différent. Ce que
-- l'avocat voit doit être ce qui a été constaté au dépôt, mot pour mot.
--
-- Le JSON tient en une colonne plutôt qu'en une table : rien n'interroge un constat
-- isolément, on les lit toujours tous ensemble, avec la pièce.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS controle_json TEXT;
