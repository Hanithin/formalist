import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  mesDisponibilites,
  ajouterPlage,
  retirerPlage,
  ajouterAbsence,
  retirerAbsence,
} from "@/infrastructure/db/depots/consultations";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const HEURE = z.string().regex(/^\d{1,2}:\d{2}$/, "Heure attendue au format 09:30");
const JOUR = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format 2026-09-01");

const AJOUT = z.discriminatedUnion("quoi", [
  z.object({
    quoi: z.literal("plage"),
    jourSemaine: z.coerce.number().int().min(0).max(6),
    debut: HEURE,
    fin: HEURE,
    dureeCreneauMinutes: z.coerce.number().int().min(15).max(240),
  }),
  z.object({
    quoi: z.literal("absence"),
    debut: JOUR,
    fin: JOUR,
    motif: z.string().trim().max(200).optional(),
  }),
]);

const RETRAIT = z.object({
  quoi: z.enum(["plage", "absence"]),
  identifiant: schemas.identifiant,
});

export const GET = route(async () => {
  const utilisateur = await exigerUtilisateur();
  return NextResponse.json(await mesDisponibilites(utilisateur));
});

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const demande = await validerCorps(AJOUT, requete);

  if (demande.quoi === "plage") {
    const plage = await ajouterPlage(utilisateur, demande);
    return NextResponse.json({ plage: { id: plage.id } }, { status: 201 });
  }

  const absence = await ajouterAbsence(utilisateur, demande);
  return NextResponse.json({ absence: { id: absence.id } }, { status: 201 });
});

export const DELETE = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { quoi, identifiant } = await validerCorps(RETRAIT, requete);

  return NextResponse.json(
    quoi === "plage"
      ? await retirerPlage(utilisateur, identifiant)
      : await retirerAbsence(utilisateur, identifiant)
  );
});
