import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { commencerFormalite, enregistrerBrouillon } from "@/infrastructure/db/depots/brouillons";
import {
  BANQUES,
  MODES_DOMICILIATION,
  OPTIONS_FISCALES,
  REGIMES_SOCIAUX,
  REGIMES_TVA,
  REMUNERATIONS,
} from "@/domain/formalite/parcours";
import {
  REGIMES_MATRIMONIAUX,
  SITUATIONS_MATRIMONIALES,
} from "@/domain/formalite/etat-civil";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Le brouillon est validé champ par champ, mais sans exiger qu'il soit complet :
 * on enregistre au fil de la saisie, et c'est le passage d'étape qui contrôle
 * l'ensemble. Refuser un brouillon incomplet ferait perdre la saisie en cours.
 */
const CIVILITE = z.enum(["Monsieur", "Madame"]);

const CONJOINT = z.object({
  civilite: CIVILITE.optional(),
  prenom: z.string().trim().max(60).optional(),
  nom: z.string().trim().max(60).optional(),
  nomDeNaissance: z.string().trim().max(60).optional(),
  regimeMatrimonial: z.enum(REGIMES_MATRIMONIAUX).optional(),
  dateMariage: z.string().trim().max(10).optional(),
  villeMariage: z.string().trim().max(100).optional(),
  contratDeMariage: z.boolean().optional(),
});

const PERSONNE = z.object({
  civilite: CIVILITE.optional(),
  prenom: z.string().trim().max(60).optional(),
  nom: z.string().trim().max(60).optional(),
  nomDeNaissance: z.string().trim().max(60).optional(),
  email: z.string().trim().max(150).optional(),
  adresse: z.string().trim().max(200).optional(),
  codePostal: z.string().trim().max(5).optional(),
  ville: z.string().trim().max(100).optional(),
  dateDeNaissance: z.string().trim().max(10).optional(),
  villeDeNaissance: z.string().trim().max(100).optional(),
  codePostalDeNaissance: z.string().trim().max(5).optional(),
  paysDeNaissance: z.string().trim().max(60).optional(),
  nomDuPere: z.string().trim().max(120).optional(),
  nomDeLaMere: z.string().trim().max(120).optional(),
  nationalite: z.string().trim().max(60).optional(),
  situationMatrimoniale: z.enum(SITUATIONS_MATRIMONIALES).optional(),
  conjoint: CONJOINT.optional(),
});

const SOCIETE_ASSOCIEE = z.object({
  denomination: z.string().trim().max(150).optional(),
  adresse: z.string().trim().max(200).optional(),
  codePostal: z.string().trim().max(5).optional(),
  ville: z.string().trim().max(100).optional(),
  capital: z.number().nonnegative().optional(),
  numeroRcs: z.string().trim().max(30).optional(),
  villeImmatriculation: z.string().trim().max(100).optional(),
  forme: z.string().trim().max(20).optional(),
  siret: z.string().trim().max(20).optional(),
  representant: z
    .object({
      civilite: CIVILITE.optional(),
      prenom: z.string().trim().max(60).optional(),
      nom: z.string().trim().max(60).optional(),
    })
    .optional(),
});

const ASSOCIE = z.object({
  type: z.enum(["physique", "morale"]).optional(),
  personne: PERSONNE.optional(),
  societe: SOCIETE_ASSOCIEE.optional(),
  apport: z.number().nonnegative().optional(),
  versement: z.number().nonnegative().optional(),
  parts: z.number().int().nonnegative().optional(),
  apportEnNature: z
    .object({
      description: z.string().trim().max(500).optional(),
      montant: z.number().nonnegative().optional(),
    })
    .optional(),
});

const DIRIGEANT = z.object({
  associe: z.number().int().nonnegative().max(99).optional(),
  personne: PERSONNE.optional(),
  remuneration: z.enum(REMUNERATIONS).optional(),
  regimeSocial: z.enum(REGIMES_SOCIAUX).optional(),
});

const BROUILLON = z.object({
  forme: z.string().trim().max(10).optional(),
  denomination: z.string().trim().max(150).optional(),
  /*
   * L'objet social d'une holding tient rarement en deux mille caractères.
   *
   * La borne les refusait : chaque enregistrement répondait « Entrée invalide », le
   * formulaire l'ignorait, et l'étape ne passait pas - sans que rien ne le dise. Un
   * objet de trois mille caractères est une clause ordinaire de société de tête, huit
   * paragraphes qui énumèrent les participations, l'animation du groupe, les
   * prestations aux filiales. Dix mille laissent la place à la plus longue sans ouvrir
   * la porte à un roman dans un acte.
   */
  activite: z.string().trim().max(10_000).optional(),
  descriptionActivite: z.string().trim().max(500).optional(),
  adresse: z.string().trim().max(200).optional(),
  codePostal: z.string().trim().max(5).optional(),
  ville: z.string().trim().max(100).optional(),
  modeDomiciliation: z.enum(MODES_DOMICILIATION).optional(),
  // Le domiciliataire, quand le siège est chez une société de domiciliation : sa
  // dénomination et son immatriculation sont déclarées au registre par le domicilié,
  // et son agrément préfectoral est la mention qui rend le contrat recevable.
  domiciliataire: z
    .object({
      denomination: z.string().trim().max(150).optional(),
      siren: z.string().trim().max(9).optional(),
      agrement: z.string().trim().max(60).optional(),
    })
    .optional(),
  capital: z.number().nonnegative().optional(),
  capitalLibere: z.number().nonnegative().optional(),
  banque: z.enum(BANQUES).optional(),
  banqueAutre: z
    .object({
      nom: z.string().trim().max(120).optional(),
      adresse: z.string().trim().max(200).optional(),
      ville: z.string().trim().max(100).optional(),
      codePostal: z.string().trim().max(5).optional(),
    })
    .optional(),
  dateDebutActivite: z.string().trim().max(10).optional(),
  dateCloturePremierExercice: z.string().trim().max(10).optional(),
  dureeDeVie: z.number().int().positive().max(99).optional(),
  optionFiscale: z.enum(OPTIONS_FISCALES).optional(),
  regimeTva: z.enum(REGIMES_TVA).optional(),
  associes: z.array(ASSOCIE).max(100).optional(),
  dirigeants: z.array(DIRIGEANT).max(20).optional(),
  partsTotales: z.number().int().nonnegative().optional(),
  paraphes: z.string().trim().max(10).optional(),
  offre: z.string().trim().max(30).optional(),
  noteAvocat: z.string().trim().max(2000).optional(),
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
