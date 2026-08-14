import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { confirmerPaiement, abandonnerReservation } from "@/infrastructure/db/depots/consultations";
import { relirePaiement } from "@/infrastructure/paiement/stripe";
import { journal } from "@/lib/journal";
import { route } from "@/lib/reponses";

/**
 * Le retour du client depuis la page de paiement.
 *
 * Le paiement est relu auprès de Stripe ici plutôt que d'être cru sur parole : le
 * paramètre vient de l'adresse, et l'adresse se recopie. C'est aussi ce qui rend la
 * confirmation indépendante du webhook, qui peut arriver en retard ou pas du tout si
 * le relais n'est pas en marche. Les deux chemins mènent à la même écriture, qui ne
 * fait rien la seconde fois.
 *
 * Le client repart vers sa page avec un état dans l'adresse, jamais avec un montant
 * ni une référence de session : ce qui est affiché est relu en base.
 */
function versLaPage(requete: Request, etat: string) {
  return NextResponse.redirect(new URL("/consultations?paiement=" + etat, requete.url), 303);
}

export const GET = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const parametres = new URL(requete.url).searchParams;

  // Retour d'un paiement abandonné : le créneau est rendu tout de suite, sans
  // attendre l'expiration de la session.
  const abandon = Number(parametres.get("abandon"));
  if (Number.isInteger(abandon) && abandon > 0) {
    await abandonnerReservation(abandon, utilisateur.id);
    return versLaPage(requete, "abandonne");
  }

  const session = parametres.get("session");
  if (!session) return versLaPage(requete, "inconnu");

  const encaissement = await relirePaiement(session);
  const resultat = await confirmerPaiement(encaissement, utilisateur.id);

  if (!resultat.paye) {
    journal.warn({ session }, "Retour de paiement sans encaissement");
    return versLaPage(requete, "attente");
  }

  return versLaPage(requete, "regle");
});
