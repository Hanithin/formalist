import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { commencerComptes, completerComptes } from "@/infrastructure/db/depots/comptes";
import { NATURES_DE_CONVENTION } from "@/domain/comptes/conventions";
import { EXCLUSIONS } from "@/domain/comptes/confidentialite";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Le dossier d'approbation des comptes : son ouverture, et son enregistrement.
 *
 * L'enregistrement est partiel : chaque étape écrit ce qu'elle connaît sans écraser le
 * reste. Envoyer le dossier entier à chaque étape ferait perdre les conventions au
 * moment où l'on corrige un chiffre.
 */

const SOCIETE = z.object({
  denomination: z.string().trim().max(200).optional(),
  forme: z.string().trim().max(20).optional(),
  siren: z.string().trim().max(20).optional(),
  adresse: z.string().trim().max(300).optional(),
  codePostal: z.string().trim().max(10).optional(),
  ville: z.string().trim().max(120).optional(),
  capital: z.number().nonnegative().max(1_000_000_000).nullable().optional(),
  villeRcs: z.string().trim().max(120).optional(),
});

const ASSOCIE = z.object({
  civilite: z.string().trim().max(20).optional(),
  prenom: z.string().trim().max(120).optional(),
  nom: z.string().trim().max(120).optional(),
  denomination: z.string().trim().max(200).optional(),
  parts: z.number().nonnegative().max(100_000_000).nullable().optional(),
});

/*
 * Les montants d'affectation sont en centimes, et entiers.
 *
 * Le report à nouveau est le seul qui puisse être négatif : c'est lui qui porte les
 * pertes. Une réserve ou un dividende négatif serait une saisie forgée.
 */
const AFFECTATION = z.object({
  reserveLegaleCentimes: z.number().int().min(0).max(1_000_000_000_00),
  autresReservesCentimes: z.number().int().min(0).max(1_000_000_000_00),
  dividendesCentimes: z.number().int().min(0).max(1_000_000_000_00),
  reportANouveauCentimes: z.number().int().min(-1_000_000_000_00).max(1_000_000_000_00),
});

const CONVENTION = z.object({
  nature: z.enum(NATURES_DE_CONVENTION as unknown as [string, ...string[]]),
  partie: z.string().trim().max(300),
  objet: z.string().trim().max(1000),
  montantCentimes: z.number().int().min(0).max(1_000_000_000_00),
  modalites: z.string().trim().max(1000),
  poursuivie: z.boolean(),
});

const CLES_EXCLUSION = EXCLUSIONS.map((e) => e.cle);

const ENREGISTREMENT = z.object({
  dossier: schemas.identifiant,
  societe: SOCIETE.optional(),
  // Une assemblée de plus de vingt associés passe par un avocat : la liste sert à
  // nommer les signataires du procès-verbal, pas à tenir un registre.
  associes: z.array(ASSOCIE).max(20).optional(),
  valeurs: z.record(z.string(), z.union([z.string().max(4000), z.number()])).optional(),
  affectation: AFFECTATION.optional(),
  conventions: z.array(CONVENTION).max(30).optional(),
  exclusions: z.array(z.enum(CLES_EXCLUSION as unknown as [string, ...string[]])).optional(),
  demandeLaConfidentialite: z.boolean().optional(),
});

export const POST = route(async () => {
  const utilisateur = await exigerUtilisateur();
  const dossier = await commencerComptes(utilisateur);
  return NextResponse.json({ dossier }, { status: 201 });
});

export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier, ...changement } = await validerCorps(ENREGISTREMENT, requete);

  const comptes = await completerComptes(
    utilisateur,
    dossier,
    changement as Parameters<typeof completerComptes>[2]
  );
  return NextResponse.json({ comptes });
});
