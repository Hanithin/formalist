import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  commencerModification,
  completerModification,
} from "@/infrastructure/db/depots/modifications";
import { CODES_MODIFICATION, type TypeModification } from "@/domain/modification/types";
import { valider, validerCorps, schemas } from "@/lib/valider";
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

/*
 * Une cession désigne des associés par leur rang dans la liste, non par un nom : c'est
 * ce qui empêche de céder les parts de quelqu'un qui n'est pas associé.
 */
const CESSION = z.object({
  cedant: z.number().int().min(0).max(19).nullable(),
  parts: z.number().int().min(0).max(100_000_000).nullable(),
  prix: z.number().min(0).max(1_000_000_000).nullable(),
  date: z.string().trim().max(40).nullable().optional(),
  vers: z.enum(["associe", "tiers"]),
  cessionnaire: z.number().int().min(0).max(19).nullable().optional(),
  nom: z.string().trim().max(200).nullable().optional(),
  adresse: z.string().trim().max(300).nullable().optional(),
});

const ENREGISTREMENT = z.object({
  dossier: schemas.identifiant,
  // Le plafond est le nombre de changements connus : au-delà, la liste est forgée.
  codes: z
    .array(z.enum(CODES_MODIFICATION as [string, ...string[]]))
    .max(CODES_MODIFICATION.length)
    .optional(),
  societe: SOCIETE.optional(),
  valeurs: z.record(z.string(), z.union([z.string().max(4000), z.number()])).optional(),
  // Une assemblée décide rarement plus de quelques cessions ; au-delà, c'est un
  // registre de mouvements, qui n'a pas sa place dans un formulaire.
  cessions: z.array(CESSION).max(20).optional(),
  assemblee: z
    .object({
      date: z.string().trim().max(40).nullable().optional(),
      // Au-delà de vingt associés présents, l'assemblée passe par un avocat : la
      // liste sert à nommer les signataires du procès-verbal, pas à tenir un registre.
      associes: z.array(ASSOCIE).max(20).optional(),
    })
    .optional(),
});

/*
 * L'ouverture accepte les changements déjà choisis.
 *
 * L'écran d'entrée les fait cocher ; le dossier s'ouvre avec la réponse de l'étape 2
 * déjà donnée. Le corps est facultatif - on ouvre alors un dossier sans changement,
 * pour qui ne sait pas encore ce qu'il modifie.
 *
 * Le plafond est celui de l'enregistrement : tous les changements connus, pas un de plus.
 */
const OUVERTURE = z.object({
  codes: z
    .array(z.enum(CODES_MODIFICATION as [TypeModification, ...TypeModification[]]))
    .max(CODES_MODIFICATION.length)
    .optional(),
});

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();

  // Le corps est facultatif : ouvrir un dossier sans rien préciser reste valable.
  // Il passe quand même par le schéma - ce qui vient du réseau n'est jamais lu tel quel.
  const { codes } = valider(OUVERTURE, await requete.json().catch(() => ({})));

  const dossier = await commencerModification(utilisateur, codes);
  return NextResponse.json({ dossier }, { status: 201 });
});

export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier, ...changement } = await validerCorps(ENREGISTREMENT, requete);

  const modification = await completerModification(utilisateur, dossier, changement);
  return NextResponse.json({ modification });
});
