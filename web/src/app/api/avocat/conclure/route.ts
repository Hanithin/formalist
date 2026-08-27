import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { conclureSansDocumentFinal } from "@/infrastructure/db/depots/avocat";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Conclure un dossier qu'aucun document du greffe ne viendra clore.
 *
 * La dernière étape attend le document délivré par le greffe et le refuse tant qu'il
 * n'est pas au dossier. Or le greffe ne délivre pas toujours de récépissé : le dossier
 * restait alors en suspens, et le client guettait une remise qui ne viendrait jamais.
 */
export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(z.object({ dossier: schemas.identifiant }), requete);

  const { conclu } = await conclureSansDocumentFinal(utilisateur, dossier);
  return NextResponse.json({ conclu });
});
