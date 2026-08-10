import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/infrastructure/db/utilisateur-courant";
import { accepterInvitation } from "@/infrastructure/db/depots/equipe";

/**
 * Acceptation d'une invitation.
 *
 * Le lien est cliqué depuis un email : la réponse est une redirection, avec
 * l'issue en paramètre. Sans session, on renvoie vers la connexion en gardant la
 * destination, pour revenir ici une fois connecté.
 */
export async function GET(requete: Request) {
  const jeton = new URL(requete.url).searchParams.get("jeton") ?? "";
  const utilisateur = await utilisateurCourant();

  if (!utilisateur) {
    const connexion = new URL("/connexion", requete.url);
    connexion.searchParams.set("suite", "/api/equipe/accepter?jeton=" + jeton);
    return NextResponse.redirect(connexion);
  }

  const resultat = await accepterInvitation(utilisateur, jeton);

  const destination = new URL("/equipe", requete.url);
  destination.searchParams.set("invitation", resultat.ok ? "acceptee" : resultat.etat);
  return NextResponse.redirect(destination);
}
