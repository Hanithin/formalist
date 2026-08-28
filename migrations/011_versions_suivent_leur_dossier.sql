-- Une version d'acte n'a pas de vie sans son dossier.
--
-- La clé étrangère posée par 010 retenait le dossier : supprimer une formalité levait
-- « document_versions_formalite_id_fkey », et la seule façon de s'en sortir était de
-- connaître cette table pour vider ses lignes d'abord. Le nettoyage d'une série de
-- tests l'a rencontré le premier ; un retrait de brouillon l'aurait rencontré ensuite.
--
-- L'historique d'un acte appartient au dossier qui l'a produit : il part avec lui.
ALTER TABLE document_versions
  DROP CONSTRAINT IF EXISTS document_versions_formalite_id_fkey;

ALTER TABLE document_versions
  ADD CONSTRAINT document_versions_formalite_id_fkey
  FOREIGN KEY (formalite_id) REFERENCES formalites(id) ON DELETE CASCADE;
