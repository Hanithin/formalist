-- Sessions révocables, avec double expiration.
--
-- La table n'avait que token, user_id et expires_at : impossible de révoquer une
-- session, de fermer celles restées ouvertes sur un poste partagé, ni de couper les
-- sessions existantes quand un mot de passe est changé pour en chasser quelqu'un.
--
-- created_at borne la durée absolue, que l'activité ne prolonge pas.
-- last_seen_at borne l'inactivité.
-- revoked_at ferme la session sans la supprimer, pour garder la trace.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- Une session est cherchée par jeton à chaque requête authentifiée : l'index sur la
-- clé primaire suffit. Celui-ci sert au listing des sessions d'un compte et à la
-- révocation en masse.
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id) WHERE revoked_at IS NULL;
