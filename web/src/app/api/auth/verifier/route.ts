import { NextResponse } from "next/server";
import { confirmer } from "@/infrastructure/db/depots/inscription";
import { adresseDeRetour } from "@/lib/site";

/**
 * Confirmation d'adresse.
 *
 * Le lien est cliqué depuis un email : la réponse est donc une redirection vers
 * la page de connexion, avec l'issue en paramètre, et non du JSON.
 *
 * La destination se bâtit sur l'adresse déclarée de l'application, non sur celle de la
 * requête. En production, le conteneur écoute sur 0.0.0.0 et c'est ce nom que
 * `requete.url` porte : le client qui confirmait son inscription était renvoyé vers
 * http://0.0.0.0:3000/connexion, une adresse qui ne mène nulle part depuis son
 * navigateur. Le premier geste après l'inscription échouait donc, en silence.
 */
export async function GET(requete: Request) {
  const jeton = new URL(requete.url).searchParams.get("jeton") ?? "";
  const etat = await confirmer(jeton);

  const destination = new URL(adresseDeRetour(requete, "/connexion"));
  destination.searchParams.set("confirmation", etat);
  return NextResponse.redirect(destination);
}
