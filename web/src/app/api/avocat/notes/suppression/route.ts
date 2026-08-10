import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { supprimerNote } from "@/infrastructure/db/depots/avocat";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({ note: schemas.identifiant });

export const DELETE = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { note } = await validerCorps(SCHEMA, requete);
  return NextResponse.json(await supprimerNote(utilisateur, note));
});
