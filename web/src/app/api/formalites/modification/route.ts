import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  commencerModification,
  completerModification,
} from "@/infrastructure/db/depots/modifications";
import { CODES_MODIFICATION } from "@/domain/modification/types";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Le dossier de modification : son ouverture, et son enregistrement au fil du parcours.
 *
 * L'enregistrement est partiel : chaque étape écrit ce qu'elle connaît sans écraser le
 * reste. Envoyer le dossier entier à chaque étape ferait perdre les statuts au moment
 * où l'on change une date.
 */

const SOCIETE = z.object({
  denomination: z.string().trim().max(200).optional(),
  forme: z.string().trim().max(20).optional(),
  siren: z.string().trim().max(20).optional(),
  adresse: z.string().trim().max(300).optional(),
  codePostal: z.string().trim().max(10).optional(),
  ville: z.string().trim().max(120).optional(),
  capital: z.number().nonnegative().max(1_000_000_000).nullable().optional(),
  dateStatuts: z.string().trim().max(40).nullable().optional(),
  villeRcs: z.string().trim().max(120).optional(),
});

/*
 * Un associé peut être une société : une SCI détenue par une holding, une SAS dont un
 * fonds est associé. L'acte la désigne alors par sa forme, son capital, son siège et
 * son numéro, non par un prénom.
 */
const ASSOCIE = z.object({
  nature: z.enum(["physique", "morale"]).nullable().optional(),
  parts: z.number().int().nonnegative().max(100_000_000).nullable().optional(),

  civilite: z.string().trim().max(20).optional(),
  prenom: z.string().trim().max(120).optional(),
  nom: z.string().trim().max(120).optional(),

  denomination: z.string().trim().max(200).optional(),
  forme: z.string().trim().max(20).optional(),
  siren: z.string().trim().max(20).optional(),
  siege: z.string().trim().max(300).optional(),
  capital: z.number().nonnegative().max(1_000_000_000).nullable().optional(),
  representant: z.string().trim().max(200).optional(),
  qualiteRepresentant: z.string().trim().max(80).optional(),
});

const ENREGISTREMENT = z.object({
  dossier: schemas.identifiant,
  codes: z.array(z.enum(CODES_MODIFICATION as [string, ...string[]])).max(8).optional(),
  societe: SOCIETE.optional(),
  valeurs: z.record(z.string(), z.union([z.string().max(4000), z.number()])).optional(),
  assemblee: z
    .object({
      date: z.string().trim().max(40).nullable().optional(),
      // Au-delà de vingt associés présents, l'assemblée passe par un avocat : la
      // liste sert à nommer les signataires du procès-verbal, pas à tenir un registre.
      associes: z.array(ASSOCIE).max(20).optional(),
    })
    .optional(),
});

export const POST = route(async () => {
  const utilisateur = await exigerUtilisateur();
  const dossier = await commencerModification(utilisateur);
  return NextResponse.json({ dossier }, { status: 201 });
});

export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier, ...changement } = await validerCorps(ENREGISTREMENT, requete);

  const modification = await completerModification(utilisateur, dossier, changement);
  return NextResponse.json({ modification });
});
