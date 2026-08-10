import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { changerDOffre } from "@/infrastructure/db/depots/brouillons";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({
  dossier: schemas.identifiant,
  offre: z.string().trim().max(20),
});

export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier, offre } = await validerCorps(SCHEMA, requete);
  return NextResponse.json(await changerDOffre(utilisateur, dossier, offre));
});
