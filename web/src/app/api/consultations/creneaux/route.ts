import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { creneauxDe } from "@/infrastructure/db/depots/consultations";
import { validerParametres, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({
  avocat: schemas.identifiant,
  jours: z.coerce.number().int().min(1).max(60).optional(),
});

export const GET = route(async (requete: Request) => {
  await exigerUtilisateur();
  const { avocat, jours } = validerParametres(SCHEMA, new URL(requete.url));

  const depuis = new Date();
  const jusqua = new Date();
  // Deux semaines par défaut : au-delà, la liste devient illisible et les
  // disponibilités changent de toute façon.
  jusqua.setDate(jusqua.getDate() + (jours ?? 14));

  const creneaux = await creneauxDe(avocat, depuis, jusqua);
  return NextResponse.json({
    creneaux: creneaux.map((c) => ({ debut: c.debut.toISOString(), fin: c.fin.toISOString() })),
  });
});
