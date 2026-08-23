import { NextResponse } from "next/server";
import { confirmerPaiement } from "@/infrastructure/db/depots/consultations";
import { confirmerLeReglementDeLaFormalite } from "@/infrastructure/db/depots/reglements";
import { evenementDeStripe, encaissementDe } from "@/infrastructure/paiement/stripe";
import { journal } from "@/lib/journal";
import { route } from "@/lib/reponses";

/**
 * Les avis de paiement envoyés par Stripe.
 *
 * Cette route est publique, et c'est nécessaire : Stripe appelle depuis ses serveurs
 * et n'a pas de session chez nous. Son authentification est la signature du corps,
 * vérifiée avant toute lecture - sans quoi n'importe qui pourrait annoncer qu'une
 * consultation est payée.
 *
 * Le corps est lu en texte brut, tel qu'il est arrivé : la signature porte sur les
 * octets reçus, et un JSON reparsé puis réécrit ne correspondrait plus.
 *
 * La réponse est toujours 200 dès que la signature est bonne, même pour un événement
 * qui ne nous concerne pas : un 4xx ferait réessayer Stripe indéfiniment sur un
 * message que nous avons bien reçu et volontairement ignoré.
 */
export const POST = route(async (requete: Request) => {
  const corps = await requete.text();
  const evenement = evenementDeStripe(corps, requete.headers.get("stripe-signature"));

  const encaissement = encaissementDe(evenement);
  if (!encaissement) {
    return NextResponse.json({ recu: true, traite: false });
  }

  /*
   * Deux natures se règlent ici : une consultation juridique et une formalité. Les
   * métadonnées de la session disent laquelle ; les confondre confirmerait la mauvaise
   * chose.
   *
   * Une formalité se confirme ensuite par le parcours dont elle relève - création,
   * modification, approbation des comptes - qui n'écrivent ni les mêmes champs ni la
   * même ligne de journal.
   */
  if (encaissement.dossierId !== null) {
    const resultat = await confirmerLeReglementDeLaFormalite(
      encaissement.reference,
      encaissement.dossierId
    );
    journal.info(
      { evenement: evenement.type, dossier: resultat.dossierId, paye: resultat.paye },
      "Règlement de formalité traité"
    );
    return NextResponse.json({ recu: true, traite: true });
  }

  const resultat = await confirmerPaiement(encaissement);
  journal.info(
    { evenement: evenement.type, consultation: resultat.consultationId, paye: resultat.paye },
    "Avis de paiement traité"
  );

  return NextResponse.json({ recu: true, traite: true });
});
