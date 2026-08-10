import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { marquerFait, annuler } from "@/infrastructure/db/depots/consultations";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({
  consultation: schemas.identifiant,
  decision: z.enum(["fait", "annuler"]),
});

export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { consultation, decision } = await validerCorps(SCHEMA, requete);

  if (decision === "fait") {
    await marquerFait(utilisateur, consultation);
  } else {
    await annuler(utilisateur, consultation);
  }
  return NextResponse.json({ ok: true });
});
