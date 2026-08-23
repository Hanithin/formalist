/**
 * Les avis à publier, rédigés.
 *
 * Une fermeture amiable en demande deux, et le second doit paraître dans le même support
 * que le premier - le greffe le vérifie. La dissolution sans liquidation n'en demande
 * aucun depuis le décret n° 2024-751 : sa publicité se fait au BODACC, à l'inscription
 * au registre.
 *
 * Le texte se copie tel quel dans le formulaire du support habilité. Il est au forfait
 * depuis 2022 : sa longueur ne coûte rien, mais une mention manquante fait republier.
 *
 * Deux mentions ne se devinent pas et manquent presque toujours :
 *
 *   - le siège de la liquidation, où les créanciers écrivent ;
 *   - le greffe auprès duquel le dépôt sera fait, dans l'avis de clôture.
 */

import { dateEnFrancais } from "@/domain/formalite/lettres";
import { formeEnToutesLettres, sirenLisible } from "@/domain/modification/annonce";

export interface SocieteFermee {
  denomination?: string;
  forme?: string;
  siren?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
  capital?: number | null;
  villeRcs?: string;
}

export interface Avis {
  /** Ce que l'avis annonce, pour le distinguer de l'autre. */
  objet: string;
  /** Quand il doit paraître. */
  quand: string;
  /** Le texte à copier. */
  texte: string;
}

function texte(valeur: unknown): string {
  if (typeof valeur === "number") return String(valeur);
  return typeof valeur === "string" ? valeur.trim() : "";
}

function montant(valeur: number): string {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/[  ]/g, " ");
}

function adresseDe(rue: string, codePostal: string, ville: string): string {
  const fin = [codePostal, ville].filter(Boolean).join(" ");
  return [rue, fin].filter(Boolean).join(", ");
}

/** L'en-tête, identique dans les deux avis : qui est la société. */
function enTete(societe: SocieteFermee): string {
  const lignes = [texte(societe.denomination).toUpperCase()];

  const forme = formeEnToutesLettres(societe.forme);
  const capital = typeof societe.capital === "number" ? montant(societe.capital) : "";
  lignes.push(capital ? forme + " au capital de " + capital + " euros" : forme);

  const siege = adresseDe(texte(societe.adresse), texte(societe.codePostal), texte(societe.ville));
  if (siege) lignes.push("Siège social : " + siege);

  const siren = sirenLisible(societe.siren);
  const rcs = texte(societe.villeRcs) || texte(societe.ville);
  if (siren) lignes.push(siren + (rcs ? " RCS " + rcs : ""));

  return lignes.join("\n");
}

export interface ContexteAvis {
  societe: SocieteFermee;
  valeurs: Record<string, string | number | undefined>;
  /** Le nom du liquidateur, recomposé par l'appelant. */
  liquidateur: string;
  /** L'organe qui a décidé, tel que l'acte le nomme. */
  organe: string;
  /** Y a-t-il un boni, un mali, ou rien ? */
  soldeDeLaLiquidation?: { boniEuros: number; maliEuros: number };
}

/** L'avis de dissolution, à publier dans le mois de la décision. */
export function avisDeDissolution(contexte: ContexteAvis): Avis {
  const { societe, valeurs } = contexte;

  const date = dateEnFrancais(texte(valeurs.dateDissolution));
  const siegeLiquidation =
    texte(valeurs.siegeDeLaLiquidation) ||
    adresseDe(texte(societe.adresse), texte(societe.codePostal), texte(societe.ville));
  const greffe = texte(societe.villeRcs) || texte(societe.ville);

  const corps = [
    "Aux termes d'une décision en date du " +
      date +
      ", " +
      contexte.organe.toLowerCase() +
      " a décidé la dissolution anticipée de la société et sa mise en liquidation amiable à compter de cette date.",
    contexte.liquidateur +
      ", demeurant " +
      texte(valeurs.liquidateurAdresse) +
      ", a été nommé liquidateur, avec les pouvoirs les plus étendus pour réaliser l'actif et apurer le passif.",
    "Le siège de la liquidation est fixé " +
      siegeLiquidation +
      ". C'est à cette adresse que la correspondance doit être envoyée et que les actes et documents relatifs à la liquidation doivent être notifiés.",
    "Les actes et pièces relatifs à la liquidation seront déposés au greffe du tribunal de commerce de " +
      greffe +
      ", en annexe au registre du commerce et des sociétés.",
  ];

  return {
    objet: "Dissolution et nomination du liquidateur",
    quand: "Dans le mois de la décision, avant le dépôt au guichet unique",
    texte: [enTete(societe), "", "AVIS DE DISSOLUTION", "", ...corps, "", "Pour avis, le Liquidateur."].join(
      "\n"
    ),
  };
}

/** L'avis de clôture, à publier dans le même support que le premier. */
export function avisDeCloture(contexte: ContexteAvis): Avis {
  const { societe, valeurs } = contexte;

  const date = dateEnFrancais(texte(valeurs.dateCloture));
  const greffe = texte(societe.villeRcs) || texte(societe.ville);
  const solde = contexte.soldeDeLaLiquidation;

  /*
   * Le solde se dit, et il se dit juste.
   *
   * Un avis qui annonce un boni là où il y a un mali n'est pas une maladresse : c'est
   * une information fausse donnée aux créanciers, sur un support opposable.
   */
  const ligneDuSolde = !solde
    ? ""
    : solde.boniEuros > 0
      ? " Un boni de liquidation de " + montant(solde.boniEuros) + " euros a été réparti entre les associés."
      : solde.maliEuros > 0
        ? " La liquidation fait apparaître un mali de " + montant(solde.maliEuros) + " euros."
        : " La liquidation ne dégage ni boni ni mali.";

  const corps = [
    "Aux termes d'une décision en date du " +
      date +
      ", " +
      contexte.organe.toLowerCase() +
      ", après avoir entendu le rapport du liquidateur, a approuvé les comptes définitifs de liquidation, donné quitus au liquidateur " +
      contexte.liquidateur +
      " de sa gestion, l'a déchargé de son mandat et a prononcé la clôture des opérations de liquidation à compter de cette date." +
      ligneDuSolde,
    "Les comptes de liquidation seront déposés au greffe du tribunal de commerce de " +
      greffe +
      ", en annexe au registre du commerce et des sociétés.",
    "La société sera radiée du registre du commerce et des sociétés de " + greffe + ".",
  ];

  return {
    objet: "Clôture de la liquidation et radiation",
    quand: "Après la décision de clôture, dans le même support que l'avis de dissolution",
    texte: [enTete(societe), "", "AVIS DE CLÔTURE DE LIQUIDATION", "", ...corps, "", "Pour avis, le Liquidateur."].join(
      "\n"
    ),
  };
}

/**
 * Les avis d'une fermeture, selon la voie et l'avancement.
 *
 * La dissolution sans liquidation n'en produit aucun : le rappeler explicitement évite
 * qu'un client paie une annonce dont personne n'a besoin.
 */
export function avisDeLaFermeture(args: {
  voie: "liquidation-amiable" | "tup";
  phase: "dissolution" | "cloture";
  contexte: ContexteAvis;
}): Avis[] {
  if (args.voie === "tup") return [];
  if (args.phase === "dissolution") return [avisDeDissolution(args.contexte)];
  return [avisDeDissolution(args.contexte), avisDeCloture(args.contexte)];
}

export const PAS_D_ANNONCE_EN_TUP =
  "La dissolution sans liquidation ne se publie pas dans un journal d'annonces légales. Depuis le 1er octobre 2024, sa publicité se fait au BODACC, à l'inscription de la dissolution au registre : elle est comprise dans les frais de greffe, et c'est elle qui fait courir le délai d'opposition des créanciers.";

export const MEME_SUPPORT =
  "L'avis de clôture doit paraître dans le même support que l'avis de dissolution. Publié ailleurs, il est refusé au dépôt, et il faut le republier - au tarif plein.";
