import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  commencerModification,
  enregistrerModification,
} from "@/infrastructure/db/depots/modifications";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const OUVERTURE = z.object({
  societe: schemas.identifiant,
  typeModification: z.string().trim().min(1, "Choisissez le type de modification"),
});

const ENREGISTREMENT = z.object({
  dossier: schemas.identifiant,
  valeurs: z.record(z.string(), z.union([z.string().max(500), z.number()])),
});

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { societe, typeModification } = await validerCorps(OUVERTURE, requete);
  const dossier = await commencerModification(utilisateur, societe, typeModification);
  return NextResponse.json({ dossier }, { status: 201 });
});

export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier, valeurs } = await validerCorps(ENREGISTREMENT, requete);
  const brouillon = await enregistrerModification(utilisateur, dossier, valeurs);
  return NextResponse.json({ brouillon });
});
