import { NextResponse } from "next/server";
import { confirmer } from "@/infrastructure/db/depots/inscription";

/**
 * Confirmation d'adresse.
 *
 * Le lien est cliqué depuis un email : la réponse est donc une redirection vers
 * la page de connexion, avec l'issue en paramètre, et non du JSON.
 */
export async function GET(requete: Request) {
  const jeton = new URL(requete.url).searchParams.get("jeton") ?? "";
  const etat = await confirmer(jeton);

  const destination = new URL("/connexion", requete.url);
  destination.searchParams.set("confirmation", etat);
  return NextResponse.redirect(destination);
}
