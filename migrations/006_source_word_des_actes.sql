-- Le Word derrière un acte livré en PDF.
--
-- Les actes sont désormais figés en PDF au moment de la génération : c'est ce
-- fichier qu'on remet au client, qu'il relit et qu'il dépose au greffe, et il ne
-- dépend plus d'une conversion à chaque lecture.
--
-- Le Word reste nécessaire malgré tout : la signature s'appose sur le zip du
-- document Word avant conversion (apposerSignature), et on ne sait pas signer un
-- PDF déjà rendu. file_path porte donc le PDF livré, source_path le Word qui l'a
-- produit.
--
-- Les lignes existantes gardent leur .docx dans file_path et un source_path vide :
-- elles restent lisibles, la remise les convertit à la demande comme avant.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_path text;

COMMENT ON COLUMN documents.source_path IS
  'Document Word source d''un acte livré en PDF ; nul pour une pièce déposée.';
