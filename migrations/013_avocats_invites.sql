-- Le code parle comme l'écran.
--
-- La table est née « dossier_confreres », du mot que la profession emploie entre pairs.
-- L'écran, lui, dit « Inviter un avocat » : deux vocabulaires pour une seule chose, et
-- c'est celui de la personne qui clique qui a raison.
--
-- Rien ne change de forme : ni colonne, ni contrainte, ni donnée. Seuls les noms.
ALTER TABLE IF EXISTS dossier_confreres RENAME TO avocats_invites;

ALTER INDEX IF EXISTS idx_dossier_confreres_unique RENAME TO idx_avocats_invites_unique;
ALTER INDEX IF EXISTS idx_dossier_confreres_avocat RENAME TO idx_avocats_invites_avocat;

-- Les avis déjà écrits portent l'ancien genre : la cloche les lit par leur contenu,
-- mais le genre décide du canal et de la destination. On les aligne.
UPDATE notifications SET type = 'avocat_invite' WHERE type = 'confrere_invite';

-- Postgres ne renomme pas les contraintes avec la table : leur nom garderait l'ancien
-- mot, et il ressort dans le schéma Prisma à chaque introspection.
ALTER TABLE avocats_invites RENAME CONSTRAINT dossier_confreres_pkey TO avocats_invites_pkey;
ALTER TABLE avocats_invites
  RENAME CONSTRAINT dossier_confreres_avocat_id_fkey TO avocats_invites_avocat_id_fkey;
ALTER TABLE avocats_invites
  RENAME CONSTRAINT dossier_confreres_formalite_id_fkey TO avocats_invites_formalite_id_fkey;
ALTER TABLE avocats_invites
  RENAME CONSTRAINT dossier_confreres_invite_par_fkey TO avocats_invites_invite_par_fkey;
