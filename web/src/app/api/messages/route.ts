import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { messagesDuDossier, envoyerMessage } from "@/infrastructure/db/depots/messages";
import { LONGUEUR_MAXIMALE } from "@/domain/messagerie/messages";
import { validerCorps, validerParametres, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const LECTURE = z.object({ dossier: schemas.identifiant });

const ENVOI = z.object({
  dossier: schemas.identifiant,
  contenu: z.string().trim().min(1, "Message vide").max(LONGUEUR_MAXIMALE, "Message trop long"),
  type: z.string().optional(),
});

export const GET = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = validerParametres(LECTURE, new URL(requete.url));
  return NextResponse.json({ messages: await messagesDuDossier(utilisateur, dossier) });
});

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier, contenu, type } = await validerCorps(ENVOI, requete);
  const message = await envoyerMessage(utilisateur, dossier, contenu, type);
  return NextResponse.json({ message }, { status: 201 });
});
