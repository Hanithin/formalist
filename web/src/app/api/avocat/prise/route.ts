import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { prendreLeDossier, DejaPris } from "@/infrastructure/db/depots/avocat";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({ dossier: schemas.identifiant });

/**
 * Un avocat prend un dossier qui attendait.
 *
 * Le dossier est proposé à tous à la fois : le premier qui accepte le prend. Celui
 * qui arrive après reçoit un 409 - le conflit est la réponse juste, et le message
 * nomme celui qui a été plus rapide plutôt que de dire « refusé ».
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(SCHEMA, requete);

  try {
    return NextResponse.json(await prendreLeDossier(utilisateur, dossier));
  } catch (e) {
    if (e instanceof DejaPris) {
      return NextResponse.json({ error: e.message, pris: true }, { status: 409 });
    }
    throw e;
  }
});
