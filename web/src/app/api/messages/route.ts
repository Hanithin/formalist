import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { messagesDuDossier, envoyerMessage } from "@/infrastructure/db/depots/messages";
import { exigerDossier } from "@/infrastructure/db/depots/dossiers";
import { ecrirePieceJointe } from "@/infrastructure/documents/depot";
import { LONGUEUR_MAXIMALE } from "@/domain/messagerie/messages";
import { validerCorps, validerParametres, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const LECTURE = z.object({ dossier: schemas.identifiant });

const ENVOI = z.object({
  dossier: schemas.identifiant,
  contenu: z.string().trim().min(1, "Message vide").max(LONGUEUR_MAXIMALE, "Message trop long"),
  type: z.string().optional(),
  /** Le message auquel celui-ci répond, dans le même fil. */
  repondA: schemas.identifiant.nullable().optional(),
});

/** Les formats qu'une conversation accepte, ceux de l'input d'origine. */
const FORMATS = [".pdf", ".jpg", ".jpeg", ".png", ".docx"];

export const GET = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = validerParametres(LECTURE, new URL(requete.url));
  return NextResponse.json({ messages: await messagesDuDossier(utilisateur, dossier) });
});

/**
 * Envoie un message, avec ou sans pièce jointe.
 *
 * Le même point d'entrée sert les deux : un envoi avec fichier arrive en
 * multipart/form-data, un envoi de texte en JSON. Séparer les deux obligerait
 * l'interface à choisir un chemin selon la présence d'un fichier, alors que le geste
 * est le même - on écrit dans un fil.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();

  const format = requete.headers.get("content-type") ?? "";
  if (!format.includes("multipart/form-data")) {
    const { dossier, contenu, type, repondA } = await validerCorps(ENVOI, requete);
    const message = await envoyerMessage(utilisateur, dossier, contenu, type, { repondA });
    return NextResponse.json({ message }, { status: 201 });
  }

  const formulaire = await requete.formData();
  const fichier = formulaire.get("fichier");
  const dossier = Number(formulaire.get("dossier"));

  if (!(fichier instanceof File) || !Number.isInteger(dossier) || dossier <= 0) {
    return NextResponse.json({ error: "Pièce jointe ou dossier manquant" }, { status: 400 });
  }

  // L'accès au dossier avant l'écriture : un refus après coup laisserait le fichier
  // sur le disque sans message pour le désigner.
  await exigerDossier(utilisateur, dossier);

  const nom = await ecrirePieceJointe(fichier, FORMATS);
  const contenu = String(formulaire.get("contenu") ?? "").trim() || fichier.name;
  const repondA = Number(formulaire.get("repondA")) || null;

  const message = await envoyerMessage(utilisateur, dossier, contenu, "text", {
    repondA,
    fichier: nom,
  });

  return NextResponse.json({ message }, { status: 201 });
});
