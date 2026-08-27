import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  mettreLesActesADisposition,
  mettreUnActeADisposition,
  retirerLesActesDeLEspaceClient,
} from "@/infrastructure/db/depots/avocat";
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
  /*
   * Un acte, ou le jeu entier.
   *
   * La relecture se fait acte par acte : c'est la ligne du document qui la déclare.
   * Le geste collectif reste pour les dossiers où les trois se relisent d'un coup.
   */
  const { dossier, document } = await validerCorps(
    z.object({ dossier: schemas.identifiant, document: schemas.identifiant.optional() }),
    requete
  );

  if (document) {
    const { publie } = await mettreUnActeADisposition(utilisateur, document);
    return NextResponse.json({ publies: 1, publie });
  }

  const { publies } = await mettreLesActesADisposition(utilisateur, dossier);
  return NextResponse.json({ publies });
});

/**
 * Le geste inverse : retirer de l'espace du client ce qu'on vient d'y mettre.
 *
 * Publier n'avait pas d'envers. Un acte mis à disposition par erreur - le mauvais
 * dossier, une coquille vue une seconde trop tard - restait chez le client, qui pouvait
 * le signer. Les actes repassent en relecture, et il en est prévenu.
 */
export const DELETE = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(z.object({ dossier: schemas.identifiant }), requete);

  const { retires } = await retirerLesActesDeLEspaceClient(utilisateur, dossier);
  return NextResponse.json({ retires });
});
