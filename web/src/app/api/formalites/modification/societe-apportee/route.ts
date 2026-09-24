import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirLeDossierDeLaSocieteApportee } from "@/infrastructure/db/depots/modifications";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Ouvre le dossier de la société dont les titres sont apportés.
 *
 * L'apport laissait une société derrière lui : la holding voyait son capital augmenter,
 * et l'autre gardait des registres qui nommaient toujours l'apporteur. Ce geste ouvre
 * son dossier, rempli de ce que l'apport sait déjà.
 *
 * Rien n'est pris du corps que l'identifiant du dossier d'origine : la société, les
 * titres et l'apporteur se lisent en base. Les envoyer depuis l'écran laisserait
 * ouvrir un dossier sur une société qu'on n'a pas.
 */

const SCHEMA = z.object({ dossier: schemas.identifiant });

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(SCHEMA, requete);

  const ouvert = await ouvrirLeDossierDeLaSocieteApportee(utilisateur, dossier);

  /*
   * 200 quand il existait déjà, 201 quand il vient d'être ouvert.
   *
   * Deux clics ne font pas deux dossiers, et l'écran doit pouvoir dire lequel des deux
   * s'est produit - « Ouvrir » puis « Reprendre » ne se disent pas de la même façon.
   */
  return NextResponse.json(ouvert, { status: ouvert.deja ? 200 : 201 });
});
