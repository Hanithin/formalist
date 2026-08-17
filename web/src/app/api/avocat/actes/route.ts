import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { mettreLesActesADisposition } from "@/infrastructure/db/depots/avocat";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * La mise à disposition des actes.
 *
 * Un acte sorti du gabarit n'est pas un acte : c'est un projet. Il était versé dans la
 * bibliothèque du client dès sa production - le client pouvait le télécharger, l'envoyer
 * à sa banque ou le signer avant que quiconque l'ait lu. C'est ce geste, et lui seul,
 * qui le rend visible.
 */
export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(z.object({ dossier: schemas.identifiant }), requete);

  const { publies } = await mettreLesActesADisposition(utilisateur, dossier);
  return NextResponse.json({ publies });
});
