-- Un acte produit attend sa relecture avant d'être un document.
--
-- Ce qui sort d'un gabarit n'est pas un acte : c'est un projet. Il était pourtant versé
-- dans la bibliothèque du client à la seconde où il était produit - le client pouvait
-- le télécharger, l'envoyer à sa banque ou le signer avant que l'avocat l'ait lu.
--
-- Le statut « a_relire » marque ce temps intermédiaire. La contrainte d'origine ne
-- connaissait que quatre valeurs et rejetait la cinquième : l'écriture échouait, et la
-- production d'actes rendait une erreur serveur.
--
-- Les dossiers en cours ne sont pas touchés : ce qui est déjà « generated » a été vu
-- par quelqu'un, ou appartient à une création, que le client produit lui-même.

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_status_check
  CHECK (status IN ('a_relire', 'generated', 'uploaded', 'signed', 'verified'));
