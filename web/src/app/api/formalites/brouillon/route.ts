import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { commencerFormalite, enregistrerBrouillon } from "@/infrastructure/db/depots/brouillons";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Le brouillon est validé champ par champ, mais sans exiger qu'il soit complet :
 * on enregistre au fil de la saisie, et c'est le passage d'étape qui contrôle
 * l'ensemble. Refuser un brouillon incomplet ferait perdre la saisie en cours.
 */
const ASSOCIE = z.object({
  prenom: z.string().trim().max(60).optional(),
  nom: z.string().trim().max(60).optional(),
  apport: z.number().nonnegative().optional(),
});

const BROUILLON = z.object({
  forme: z.string().trim().max(10).optional(),
  denomination: z.string().trim().max(150).optional(),
  activite: z.string().trim().max(500).optional(),
  adresse: z.string().trim().max(200).optional(),
  codePostal: z.string().trim().max(5).optional(),
  ville: z.string().trim().max(100).optional(),
  capital: z.number().nonnegative().optional(),
  capitalLibere: z.number().nonnegative().optional(),
  associes: z.array(ASSOCIE).max(100).optional(),
  dirigeants: z.array(ASSOCIE.omit({ apport: true })).max(20).optional(),
  offre: z.string().trim().max(30).optional(),
});

const ENREGISTREMENT = z.object({
  dossier: schemas.identifiant,
  modifications: BROUILLON,
});

export const POST = route(async () => {
  const utilisateur = await exigerUtilisateur();
  const dossier = await commencerFormalite(utilisateur);
  return NextResponse.json({ dossier }, { status: 201 });
});

export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier, modifications } = await validerCorps(ENREGISTREMENT, requete);
  const brouillon = await enregistrerBrouillon(utilisateur, dossier, modifications);
  return NextResponse.json({ brouillon });
});
