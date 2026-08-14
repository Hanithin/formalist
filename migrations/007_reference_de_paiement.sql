-- La trace du paiement d'une consultation.
--
-- La consultation est créée avant le paiement : c'est ce qui réserve le créneau
-- pendant que le client est sur la page de Stripe, sinon deux clients paieraient le
-- même horaire. Il faut donc pouvoir rattacher la session de paiement à la ligne.
--
-- payment_ref porte l'identifiant de la session Stripe. Il sert trois fois :
--   - au retour du client, pour vérifier que la session payée est bien la sienne ;
--   - au webhook, pour ne pas créditer deux fois la même consultation ;
--   - à l'annulation, pour retrouver le paiement à rembourser.
--
-- Les lignes existantes restent sans référence : elles ont été réservées quand le
-- paiement était fictif, et rien ne les rattache à un encaissement.

ALTER TABLE lawyer_consultations ADD COLUMN IF NOT EXISTS payment_ref text;

COMMENT ON COLUMN lawyer_consultations.payment_ref IS
  'Identifiant de la session de paiement Stripe ; nul si aucun paiement n''a été ouvert.';

-- Une session de paiement ne vaut que pour une consultation : sans cette
-- contrainte, un même encaissement pourrait être compté sur deux rendez-vous.
CREATE UNIQUE INDEX IF NOT EXISTS idx_consultations_paiement
  ON lawyer_consultations(payment_ref)
  WHERE payment_ref IS NOT NULL;
