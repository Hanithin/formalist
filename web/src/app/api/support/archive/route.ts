import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { archiver } from "@/infrastructure/db/depots/support";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({ client: schemas.identifiant, archivee: z.boolean().default(true) });

export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { client, archivee } = await validerCorps(SCHEMA, requete);
  return NextResponse.json(await archiver(utilisateur, client, archivee));
});
