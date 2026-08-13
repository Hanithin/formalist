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
import { ecrirePieceJointe } from "@/infrastructure/documents/depot";
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

/** Les formats qu'une conversation accepte, ceux de l'input d'origine. */
const FORMATS = [".pdf", ".jpg", ".jpeg", ".png", ".docx"];

/**
 * Écrit au support, avec ou sans pièce jointe.
 *
 * Comme pour les fils de dossier, le même point d'entrée sert les deux : un envoi avec
 * fichier arrive en multipart/form-data, un envoi de texte en JSON.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();

  const format = requete.headers.get("content-type") ?? "";
  if (!format.includes("multipart/form-data")) {
    const { contenu, client } = await validerCorps(ENVOI, requete);
    const message = await ecrireAuSupport(utilisateur, contenu, client);
    return NextResponse.json({ message }, { status: 201 });
  }

  const formulaire = await requete.formData();
  const fichier = formulaire.get("fichier");
  if (!(fichier instanceof File)) {
    return NextResponse.json({ error: "Pièce jointe manquante" }, { status: 400 });
  }

  const nom = await ecrirePieceJointe(fichier, FORMATS);
  const contenu = String(formulaire.get("contenu") ?? "").trim() || fichier.name;

  const message = await ecrireAuSupport(utilisateur, contenu, undefined, nom);
  return NextResponse.json({ message }, { status: 201 });
});

/** Ouvrir la conversation vaut lecture, sans avoir à recharger tout le fil. */
export const PUT = route(async () => {
  const utilisateur = await exigerUtilisateur();
  return NextResponse.json({ lus: await marquerLus(utilisateur) });
});
