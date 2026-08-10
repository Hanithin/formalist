import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { statuerSurDocument } from "@/infrastructure/db/depots/avocat";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({
  document: schemas.identifiant,
  decision: z.enum(["valider", "refuser"]),
  motif: z.string().trim().max(500).optional(),
});

export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { document, decision, motif } = await validerCorps(SCHEMA, requete);
  const misAJour = await statuerSurDocument(utilisateur, document, decision, motif);
  return NextResponse.json({ document: { id: misAJour.id, status: misAJour.status } });
});
