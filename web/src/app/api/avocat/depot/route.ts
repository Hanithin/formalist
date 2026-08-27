import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { marquerLeDepotAuGuichet } from "@/infrastructure/db/depots/avocat";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Déclarer le dépôt au guichet.
 *
 * Le geste posait « Dépôt » directement, et le passage était refusé dès qu'on partait
 * de plus loin - un dossier rouvert, par exemple : l'avocat se retrouvait devant un
 * bouton qui ne faisait rien, sans autre chemin. On monte cran par cran.
 */
export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(z.object({ dossier: schemas.identifiant }), requete);

  const { sousPhase } = await marquerLeDepotAuGuichet(utilisateur, dossier);
  return NextResponse.json({ sousPhase });
});
