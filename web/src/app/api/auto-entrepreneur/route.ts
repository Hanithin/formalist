import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  commencerDeclaration,
  enregistrerDeclaration,
} from "@/infrastructure/db/depots/auto-entrepreneur";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * La déclaration s'enregistre au fil de la saisie, sans exiger d'être complète :
 * c'est le passage d'étape qui contrôle. Refuser une saisie partielle ferait
 * perdre le travail en cours.
 */
const DECLARATION = z
  .object({
    civilite: z.string().trim().max(20),
    // Quinze chiffres, espaces tolérés : c'est le domaine qui en juge la forme.
    numeroSecuriteSociale: z.string().trim().max(25),
    nomNaissance: z.string().trim().max(80),
    nomUsage: z.string().trim().max(80),
    prenoms: z.string().trim().max(120),
    dateNaissance: z.string().trim().max(10),
    villeNaissance: z.string().trim().max(100),
    paysNaissance: z.string().trim().max(60),
    nationalite: z.string().trim().max(60),
    adresseVoie: z.string().trim().max(200),
    adresseComplement: z.string().trim().max(200),
    codePostal: z.string().trim().max(5),
    ville: z.string().trim().max(100),
    situationMatrimoniale: z.string().trim().max(30),
    adresseEntrepriseDistincte: z.boolean(),
    entrepriseVoie: z.string().trim().max(200),
    entrepriseComplement: z.string().trim().max(200),
    entrepriseCodePostal: z.string().trim().max(5),
    entrepriseVille: z.string().trim().max(100),
    natureActivite: z.string().trim().max(20),
    descriptionActivite: z.string().trim().max(1000),
    codeApe: z.string().trim().max(10),
    dateDebut: z.string().trim().max(10),
    lieuExercice: z.string().trim().max(60),
    // Trois valeurs seulement : « oui », « non », « je ne sais pas ». Le domaine en
    // juge, la route se contente d'en borner la forme.
    reponseReglementation: z.string().trim().max(12),
    categorieReglementee: z.string().trim().max(20),
    versementLiberatoire: z.boolean(),
    acre: z.boolean(),
    filiationMere: z.string().trim().max(120),
    filiationPere: z.string().trim().max(120),
    certifie: z.boolean(),
  })
  .partial();

const ENREGISTREMENT = z.object({
  dossier: schemas.identifiant,
  modifications: DECLARATION,
});

export const POST = route(async () => {
  const utilisateur = await exigerUtilisateur();
  const dossier = await commencerDeclaration(utilisateur);
  return NextResponse.json({ dossier }, { status: 201 });
});

export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier, modifications } = await validerCorps(ENREGISTREMENT, requete);
  const declaration = await enregistrerDeclaration(utilisateur, dossier, modifications);
  return NextResponse.json({ declaration });
});
