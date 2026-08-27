-- L'historique d'un acte produit.
--
-- Reproduire un acte le détruisait : la ligne était supprimée, le fichier effacé du
-- disque. L'avocat qui corrigeait une coquille perdait la version d'origine, et rien ne
-- permettait d'y revenir - ni de comparer ce qui avait changé.
--
-- Une version n'est pas rattachée au document mais à l'acte : la reproduction supprime
-- la ligne de `documents` et en crée une autre, si bien qu'un identifiant de document
-- ne survivrait pas à la première correction. L'identité d'un acte, dans un dossier,
-- c'est son titre.
CREATE TABLE IF NOT EXISTS document_versions (
  id           SERIAL PRIMARY KEY,
  formalite_id INTEGER NOT NULL REFERENCES formalites(id),
  -- Le titre de l'acte : « Procès-verbal d'assemblée générale extraordinaire ».
  name         TEXT NOT NULL,
  -- Le PDF remis, et le Word qui l'a produit quand la conversion a réussi.
  file_path    TEXT,
  source_path  TEXT,
  -- Quand cette version a été produite, et quand elle a cédé la place.
  produite_le  TIMESTAMPTZ NOT NULL,
  archivee_le  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Qui l'a remplacée. Nul quand c'est une reproduction automatique, au règlement.
  archivee_par INTEGER REFERENCES users(id)
);

-- On lit toujours les versions d'un acte d'un dossier, de la plus récente à la plus
-- ancienne : c'est le seul accès, et il mérite son index.
CREATE INDEX IF NOT EXISTS document_versions_acte
  ON document_versions (formalite_id, name, archivee_le DESC);
