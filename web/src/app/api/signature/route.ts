import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { demandesDuDossier, demanderSignatures } from "@/infrastructure/db/depots/signatures";
import { validerCorps, validerParametres, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const LECTURE = z.object({ dossier: schemas.identifiant });

const OUVERTURE = z.object({
  dossier: schemas.identifiant,
  signataires: z
    .array(
      z.object({
        nom: schemas.nom,
        email: schemas.email,
        role: z.string().trim().max(30).optional(),
      })
    )
    .min(1, "Indiquez au moins un signataire")
    .max(100),
});

export const GET = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = validerParametres(LECTURE, new URL(requete.url));
  return NextResponse.json({ demandes: await demandesDuDossier(utilisateur, dossier) });
});

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier, signataires } = await validerCorps(OUVERTURE, requete);
  const creees = await demanderSignatures(utilisateur, dossier, signataires);

  // Les jetons ne sortent pas d'ici : ils partent par email, pas dans une réponse
  // que le navigateur conserve.
  return NextResponse.json(
    { ok: true, demandes: creees.map((d) => ({ id: d.id, nom: d.nom })) },
    { status: 201 }
  );
});
