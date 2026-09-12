import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { resoudreIncident, rouvrirIncident } from "@/infrastructure/db/depots/incidents";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Classer un incident, ou le rouvrir.
 *
 * Rien ne se supprime : la ligne porte la date de première apparition et le compteur,
 * qui disent après coup si la correction a tenu. Le droit se vérifie dans le dépôt -
 * c'est lui qui écrit, c'est à lui de refuser.
 */
const GESTE = z.object({
  incident: schemas.identifiant,
  action: z.enum(["resoudre", "rouvrir"]),
});

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { incident, action } = await validerCorps(GESTE, requete);

  if (action === "resoudre") await resoudreIncident(utilisateur, incident);
  else await rouvrirIncident(utilisateur, incident);

  return NextResponse.json({ ok: true });
});
