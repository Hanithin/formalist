-- La civilité de qui signe, figée avec sa demande.
--
-- Le circuit ne transportait que le nom et l'adresse : le courriel disait « vous êtes
-- appelé à signer » et la page de signature reprenait la même phrase, au masculin, quel
-- que soit le destinataire. Une femme recevait un message accordé au nom d'un autre.
--
-- La civilité est copiée dans la demande plutôt que relue dans le dossier, pour la même
-- raison que le nom l'est déjà : une correction du dossier après l'envoi ferait diverger
-- le message reçu et la page qu'il ouvre.
--
-- Nulle par défaut, et nulle pour tout ce qui existe : on n'accorde au féminin que sur
-- une civilité explicite, jamais sur un prénom.

ALTER TABLE signature_requests ADD COLUMN IF NOT EXISTS civilite TEXT;
