import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { listerDossiers } from "@/infrastructure/db/depots/dossiers";
import { supprimerBrouillon } from "@/infrastructure/db/depots/brouillons";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

export const GET = route(async () => {
  const utilisateur = await exigerUtilisateur();
  return NextResponse.json({ dossiers: await listerDossiers(utilisateur) });
});

const SUPPRESSION = z.object({ dossier: schemas.identifiant });

/**
 * Retirer un brouillon jamais transmis.
 *
 * La route ne décide de rien : le dépôt revérifie la règle sur les lignes réelles et
 * refuse par un 403 si le dossier a été réglé ou confié entre-temps.
 */
export const DELETE = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(SUPPRESSION, requete);
  return NextResponse.json(await supprimerBrouillon(utilisateur, dossier));
});
