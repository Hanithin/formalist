import { NextResponse } from "next/server";
import { confirmerPaiement } from "@/infrastructure/db/depots/consultations";
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

  const resultat = await confirmerPaiement(encaissement);
  journal.info(
    { evenement: evenement.type, consultation: resultat.consultationId, paye: resultat.paye },
    "Avis de paiement traité"
  );

  return NextResponse.json({ recu: true, traite: true });
});
