import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { commencerCessation, completerCessation } from "@/infrastructure/db/depots/cessation";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/** Le dossier de cessation : son ouverture, et son enregistrement au fil des étapes. */

const ENTREPRISE = z.object({
  denomination: z.string().trim().max(200).optional(),
  siren: z.string().trim().max(20).optional(),
  activite: z.string().trim().max(300).optional(),
  adresse: z.string().trim().max(300).optional(),
  codePostal: z.string().trim().max(10).optional(),
  ville: z.string().trim().max(120).optional(),
});

const ENTREPRENEUR = z.object({
  civilite: z.string().trim().max(20).optional(),
  prenom: z.string().trim().max(120).optional(),
  nom: z.string().trim().max(120).optional(),
  adresse: z.string().trim().max(300).optional(),
});

const ENREGISTREMENT = z.object({
  dossier: schemas.identifiant,
  nature: z.enum(["definitive", "temporaire"]).optional(),
  entreprise: ENTREPRISE.optional(),
  entrepreneur: ENTREPRENEUR.optional(),
  valeurs: z.record(z.string(), z.union([z.string().max(2000), z.number()])).optional(),
});

export const POST = route(async () => {
  const utilisateur = await exigerUtilisateur();
  const dossier = await commencerCessation(utilisateur);
  return NextResponse.json({ dossier }, { status: 201 });
});

export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier, ...changement } = await validerCorps(ENREGISTREMENT, requete);

  const cessation = await completerCessation(
    utilisateur,
    dossier,
    changement as Parameters<typeof completerCessation>[2]
  );
  return NextResponse.json({ cessation });
});
