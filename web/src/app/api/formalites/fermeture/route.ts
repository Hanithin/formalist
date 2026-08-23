import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  commencerFermeture,
  completerFermeture,
  passerALaCloture,
} from "@/infrastructure/db/depots/fermeture";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Le dossier de fermeture : son ouverture, son enregistrement, son passage en clôture.
 *
 * L'enregistrement est partiel, comme ailleurs : chaque étape écrit ce qu'elle connaît.
 * La voie, elle, ne se laisse pas poser depuis le navigateur - elle se déduit de la
 * situation, côté serveur. Un client qui poserait « tup » sans associé unique personne
 * morale obtiendrait des actes fondés sur un article qui ne lui est pas applicable.
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

const SITUATION = z.object({
  dettesImpayables: z.boolean(),
  associeUniquePersonneMorale: z.boolean(),
});

const JALONS = z.object({
  annonceDissolutionPubliee: z.boolean().optional(),
  dissolutionDeposee: z.boolean().optional(),
  attestationFiscale: z.boolean().optional(),
  attestationSociale: z.boolean().optional(),
});

const ENREGISTREMENT = z.object({
  dossier: schemas.identifiant,
  situation: SITUATION.optional(),
  societe: SOCIETE.optional(),
  associes: z.array(ASSOCIE).max(20).optional(),
  valeurs: z.record(z.string(), z.union([z.string().max(4000), z.number()])).optional(),
  jalons: JALONS.optional(),
});

const PASSAGE = z.object({ dossier: schemas.identifiant });

export const POST = route(async () => {
  const utilisateur = await exigerUtilisateur();
  const dossier = await commencerFermeture(utilisateur);
  return NextResponse.json({ dossier }, { status: 201 });
});

export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier, ...changement } = await validerCorps(ENREGISTREMENT, requete);

  const fermeture = await completerFermeture(
    utilisateur,
    dossier,
    changement as Parameters<typeof completerFermeture>[2]
  );
  return NextResponse.json({ fermeture });
});

/** Le franchissement vers la clôture, déclaré par le client. */
export const PATCH = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(PASSAGE, requete);

  try {
    const fermeture = await passerALaCloture(utilisateur, dossier);
    return NextResponse.json({ fermeture });
  } catch {
    return NextResponse.json(
      { error: "Une dissolution sans liquidation n'a pas de phase de clôture" },
      { status: 400 }
    );
  }
});
