import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { creerContrat, ContratRefuse } from "@/infrastructure/db/depots/contrats";
import { listerContrats } from "@/infrastructure/db/depots/documents";
import { validerCorps } from "@/lib/valider";
import { route } from "@/lib/reponses";

const CREATION = z.object({
  type: z.string().trim().min(1, "Choisissez un type de contrat"),
  titre: z.string().trim().max(150).optional(),
});

export const GET = route(async () => {
  const utilisateur = await exigerUtilisateur();
  return NextResponse.json({ contrats: await listerContrats(utilisateur) });
});

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { type, titre } = await validerCorps(CREATION, requete);

  try {
    const contrat = await creerContrat(utilisateur, type, titre ?? "");
    return NextResponse.json({ contrat: { id: contrat.id } }, { status: 201 });
  } catch (e) {
    if (e instanceof ContratRefuse) {
      return NextResponse.json({ error: e.message, anomalies: e.anomalies }, { status: 400 });
    }
    throw e;
  }
});
