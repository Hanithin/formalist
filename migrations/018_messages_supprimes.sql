-- Retirer un message d'un fil, sans l'effacer de la base.
--
-- L'avocat qui tient un dossier n'avait aucun moyen de retirer un message : ni le
-- sien, écrit trop vite ou au mauvais endroit, ni celui d'un client qui vient de poster
-- un relevé bancaire en clair ou un fichier destiné à un autre dossier. Il fallait
-- passer par le support, qui ouvrait la base à la main.
--
-- La ligne reste. Un message échangé entre un client et son avocat est une pièce du
-- dossier : il peut être retiré du fil, il ne peut pas être nié. Seul son contenu cesse
-- d'être servi, et le fil porte une mention à sa place - les deux parties voient qu'il y
-- avait quelque chose, ce qui vaut mieux qu'un trou inexpliqué dans une conversation
-- que l'une d'elles avait déjà lue.
--
-- Qui a supprimé et quand : sans cela, la suppression serait indiscernable d'un message
-- qui n'aurait jamais existé, et personne ne pourrait répondre à « qu'est-ce qui a
-- disparu de mon dossier ».
ALTER TABLE messages ADD COLUMN IF NOT EXISTS supprime_le  TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS supprime_par INTEGER REFERENCES users(id);

-- Les fils se lisent par dossier, en écartant ou en marquant ce qui est supprimé.
CREATE INDEX IF NOT EXISTS idx_messages_supprimes
  ON messages (formalite_id, supprime_le);
