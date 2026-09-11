import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { supprimerMessage, SuppressionRefusee } from "@/infrastructure/db/depots/messages";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Retire un message d'un fil de dossier.
 *
 * Réservé à l'avocat, et le contrôle est ici, non dans l'écran : celui-ci n'affiche la
 * croix qu'à qui en a le droit, mais un écran se contourne - la requête part d'un
 * navigateur, et rien n'empêche de la composer à la main.
 *
 * Le message n'est pas effacé de la base. Un échange entre un client et son avocat est
 * une pièce du dossier : il se retire du fil, il ne se nie pas. Voir supprimerMessage.
 */
const RETRAIT = z.object({ message: schemas.identifiant });

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { message } = await validerCorps(RETRAIT, requete);

  let retrait: Awaited<ReturnType<typeof supprimerMessage>>;
  try {
    retrait = await supprimerMessage(utilisateur, message);
  } catch (e) {
    if (e instanceof SuppressionRefusee) {
      return NextResponse.json({ error: e.message }, { status: e.statut });
    }
    throw e;
  }

  if (!retrait) {
    /* Même réponse qu'un message qu'on n'a pas le droit de lire : la réponse ne doit pas
       permettre de deviner ce que contient le fil d'un autre. */
    return NextResponse.json({ error: "Message introuvable" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, dejaFait: retrait.dejaFait });
});
