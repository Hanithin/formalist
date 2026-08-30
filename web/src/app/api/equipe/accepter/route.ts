import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/infrastructure/db/utilisateur-courant";
import { accepterInvitation } from "@/infrastructure/db/depots/equipe";
import { adresseDeRetour } from "@/lib/site";

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
    /*
     * L'adresse déclarée, non celle de la requête : le conteneur écoute sur 0.0.0.0 et
     * c'est ce nom que `requete.url` porte en production.
     */
    const connexion = new URL(adresseDeRetour(requete, "/connexion"));
    connexion.searchParams.set("suite", "/api/equipe/accepter?jeton=" + jeton);
    return NextResponse.redirect(connexion);
  }

  const resultat = await accepterInvitation(utilisateur, jeton);

  const destination = new URL(adresseDeRetour(requete, "/equipe"));
  destination.searchParams.set("invitation", resultat.ok ? "acceptee" : resultat.etat);
  return NextResponse.redirect(destination);
}
