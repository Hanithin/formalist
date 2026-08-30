import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { cloturerLeDossier } from "@/infrastructure/db/depots/avocat";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Clore un dossier dont le travail est fini.
 *
 * Aucune route ne le faisait : les seuls états que l'interface posait étaient
 * « corrections demandées » et « en attente de validation ». Un dossier déposé,
 * document du greffe remis, restait « en attente » indéfiniment - sa date de fin
 * n'était jamais écrite, et son client le voyait à vie parmi ses formalités en cours.
 *
 * Le geste reste celui de l'avocat : c'est lui qui constate que tout est en ordre.
 */
export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(z.object({ dossier: schemas.identifiant }), requete);

  return NextResponse.json(await cloturerLeDossier(utilisateur, dossier));
});
