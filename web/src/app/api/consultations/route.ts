import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  mesConsultations,
  reserver,
  annuler,
  avocatsDisponibles,
  CreneauIndisponible,
} from "@/infrastructure/db/depots/consultations";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const RESERVATION = z.object({
  avocat: schemas.identifiant,
  debut: z.string().datetime({ offset: true }),
  sujet: z.string().trim().min(1, "Indiquez le sujet").max(200),
  description: z.string().trim().max(2000).optional(),
});

const ANNULATION = z.object({ consultation: schemas.identifiant });

export const GET = route(async () => {
  const utilisateur = await exigerUtilisateur();
  const [consultations, avocats] = await Promise.all([
    mesConsultations(utilisateur),
    avocatsDisponibles(),
  ]);
  return NextResponse.json({ consultations, avocats });
});

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { avocat, debut, sujet, description } = await validerCorps(RESERVATION, requete);

  try {
    const rendezVous = await reserver(utilisateur, avocat, new Date(debut), sujet, description);
    return NextResponse.json({ ok: true, consultation: { id: rendezVous.id } }, { status: 201 });
  } catch (e) {
    if (e instanceof CreneauIndisponible) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }
});

export const DELETE = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { consultation } = await validerCorps(ANNULATION, requete);
  await annuler(utilisateur, consultation);
  return NextResponse.json({ ok: true });
});
