import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  messagesDe,
  ecrireAuSupport,
  marquerLus,
  conversations,
  LONGUEUR_MAXIMALE,
} from "@/infrastructure/db/depots/support";
import { validerCorps, validerParametres, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const LECTURE = z.object({ client: schemas.identifiant.optional() });

const ENVOI = z.object({
  contenu: z.string().trim().min(1, "Message vide").max(LONGUEUR_MAXIMALE, "Message trop long"),
  client: schemas.identifiant.optional(),
});

export const GET = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { client } = validerParametres(LECTURE, new URL(requete.url));

  const messages = await messagesDe(utilisateur, client);

  // Ouvrir sa conversation vaut lecture : les messages reçus sont marqués lus.
  if (!client) await marquerLus(utilisateur);

  const liste = utilisateur.roles.includes("admin") ? await conversations(utilisateur) : [];
  return NextResponse.json({ messages, conversations: liste });
});

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { contenu, client } = await validerCorps(ENVOI, requete);
  const message = await ecrireAuSupport(utilisateur, contenu, client);
  return NextResponse.json({ message }, { status: 201 });
});
