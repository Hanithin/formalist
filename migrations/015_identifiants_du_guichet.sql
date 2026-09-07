-- Les identifiants e-procedures de l'avocat, pour déposer en son nom.
--
-- Ils vivaient dans l'environnement du serveur : un compte unique, celui du cabinet,
-- posé dans un `.env`. Cela suffit à un essai et ne convient pas à un cabinet - le
-- compte e-procedures de l'INPI est nominatif, et c'est sous la responsabilité de celui
-- qui dépose que la formalité part. Le journal du guichet doit pouvoir dire qui a agi.
--
-- Le mot de passe est chiffré, non haché : il faut pouvoir le rejouer auprès de l'INPI.
-- C'est la différence avec `users.password_hash`, que personne n'a jamais besoin de
-- relire. La clé vit dans l'environnement, jamais dans la base : l'une sans l'autre ne
-- vaut rien, et une copie de sauvegarde égarée ne livre aucun mot de passe.

CREATE TABLE IF NOT EXISTS identifiants_guichet (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- L'identifiant de connexion, en clair : il s'affiche, il ne se cache pas.
  username      TEXT NOT NULL,

  -- Le mot de passe chiffré en AES-256-GCM, sel et sceau compris.
  password_chiffre TEXT NOT NULL,

  -- L'environnement du compte. La démonstration et la production n'en partagent aucun,
  -- et se tromper de compte ressemble en tout point à un mauvais mot de passe.
  environnement TEXT NOT NULL DEFAULT 'demonstration',

  -- Quand le guichet a confirmé pour la dernière fois que ce couple fonctionne. On
  -- n'enregistre rien qui n'ait été vérifié : une saisie fautive ne doit pas attendre
  -- le jour d'un dépôt pour se faire connaître.
  verifie_le    TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un avocat n'a qu'un compte par environnement : se reconnecter remplace.
CREATE UNIQUE INDEX IF NOT EXISTS identifiants_guichet_user_env
  ON identifiants_guichet (user_id, environnement);
