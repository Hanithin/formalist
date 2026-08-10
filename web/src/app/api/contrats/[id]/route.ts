import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  exigerContrat,
  enregistrerContrat,
  changerEtat,
  ContratRefuse,
} from "@/infrastructure/db/depots/contrats";
import { validerCorps } from "@/lib/valider";
import { route } from "@/lib/reponses";

const MISE_A_JOUR = z.object({
  valeurs: z.record(z.string(), z.union([z.string().max(2000), z.number()])).optional(),
  etat: z.string().trim().max(20).optional(),
});

type Contexte = { params: Promise<{ id: string }> };

export const GET = route(async (_requete: Request, contexte: Contexte) => {
  const utilisateur = await exigerUtilisateur();
  const { id } = await contexte.params;
  return NextResponse.json({ contrat: await exigerContrat(utilisateur, Number(id)) });
});

export const PUT = route(async (requete: Request, contexte: Contexte) => {
  const utilisateur = await exigerUtilisateur();
  const { id } = await contexte.params;
  const { valeurs, etat } = await validerCorps(MISE_A_JOUR, requete);

  try {
    if (valeurs) await enregistrerContrat(utilisateur, Number(id), valeurs);
    if (etat) await changerEtat(utilisateur, Number(id), etat);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ContratRefuse) {
      return NextResponse.json({ error: e.message, anomalies: e.anomalies }, { status: 400 });
    }
    throw e;
  }
});
