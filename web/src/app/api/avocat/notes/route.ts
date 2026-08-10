import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ajouterNote } from "@/infrastructure/db/depots/avocat";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({
  dossier: schemas.identifiant,
  contenu: z.string().trim().min(1, "La note est vide").max(5000, "La note est trop longue"),
});

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier, contenu } = await validerCorps(SCHEMA, requete);
  const note = await ajouterNote(utilisateur, dossier, contenu);
  return NextResponse.json({ note: { id: note.id } }, { status: 201 });
});
