import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { seDessaisirDuDossier } from "@/infrastructure/db/depots/avocat";
import { LONGUEUR_COMMENTAIRE } from "@/domain/formalite/avocat";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * L'avocat se retire d'un dossier.
 *
 * Prendre un dossier n'avait pas d'envers : un avocat qui découvrait un conflit
 * d'intérêts, une matière qui n'est pas la sienne, ou qui part trois semaines, ne
 * pouvait que le garder. Le dossier lui restait assigné, disparaissait de la file des
 * autres, et le client attendait quelqu'un qui ne travaillait pas.
 */
export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier, motif } = await validerCorps(
    z.object({
      dossier: schemas.identifiant,
      /* Le motif reste interne : il va au journal, non au client. */
      motif: z.string().trim().max(LONGUEUR_COMMENTAIRE).optional(),
    }),
    requete
  );

  return NextResponse.json(await seDessaisirDuDossier(utilisateur, dossier, motif));
});
