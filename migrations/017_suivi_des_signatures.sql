-- Le suivi d'une demande de signature, de l'envoi à la signature.
--
-- Le circuit créait un jeton, postait un courriel et n'en gardait rien. L'écran
-- annonçait « chacun reçoit son lien par email », puis se taisait : le client qui
-- attendait une signature n'avait aucun moyen de savoir si le message était parti, s'il
-- était arrivé, si la personne l'avait lu - ni de le renvoyer autrement qu'en relançant
-- tout le circuit, ce qui invalide les jetons de ceux qui n'ont pas encore signé.
--
-- Deux dates existaient déjà et aucun écran ne les lisait : opened_at, qui date
-- l'ouverture du *lien*, et signed_at. Les colonnes ajoutées ici couvrent ce qui
-- précède : ce que nous avons envoyé, ce que le fournisseur en a fait, et ce que le
-- destinataire en a fait.

-- Le moment où nous avons remis le message à Resend, et où il l'a accepté. Ce n'est
-- pas la remise : un message accepté peut encore rebondir.
ALTER TABLE signature_requests ADD COLUMN IF NOT EXISTS envoye_le TIMESTAMPTZ;

-- L'identifiant que Resend rend à l'envoi. C'est par lui que ses événements se
-- rattachent à la demande : le destinataire ne suffit pas, la même adresse pouvant
-- porter deux demandes dans deux dossiers.
ALTER TABLE signature_requests ADD COLUMN IF NOT EXISTS message_id TEXT;

-- Ce que les événements de Resend rapportent ensuite.
--
-- « Remis » est le seul mot qui veuille dire que le message est arrivé quelque part.
-- « Ouvert » ici est l'ouverture du courriel, distincte de opened_at qui date
-- l'ouverture du lien de signature - on peut ouvrir un message sans cliquer, et
-- cliquer un lien transmis sans avoir jamais reçu le message.
ALTER TABLE signature_requests ADD COLUMN IF NOT EXISTS remis_le TIMESTAMPTZ;
ALTER TABLE signature_requests ADD COLUMN IF NOT EXISTS mail_ouvert_le TIMESTAMPTZ;

-- Pourquoi ça n'est pas parti, ou pourquoi c'est revenu.
--
-- Le motif du refus finissait dans le journal, où le client ne va pas et où l'avocat
-- ne va pas non plus. Une adresse mal orthographiée est exactement ce que l'écran doit
-- dire, à côté du champ qui la corrige.
ALTER TABLE signature_requests ADD COLUMN IF NOT EXISTS envoi_motif TEXT;

-- Combien de fois on a relancé. Une relance renvoie le même lien : elle ne casse pas
-- le jeton en circulation, elle le fait revenir.
ALTER TABLE signature_requests ADD COLUMN IF NOT EXISTS relances INTEGER NOT NULL DEFAULT 0;

-- Les événements arrivent par identifiant de message, jamais par dossier.
CREATE INDEX IF NOT EXISTS idx_signature_requests_message
  ON signature_requests (message_id);
