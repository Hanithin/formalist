/**
 * Ce que les actes d'approbation ont besoin de savoir.
 *
 * Trois documents s'alimentent ici : le procès-verbal, le rapport spécial sur les
 * conventions, et la déclaration de confidentialité. Ils partagent la société et
 * l'exercice ; chacun a ses propres chiffres.
 *
 * Tout ce qui se calcule est calculé : la dotation à la réserve légale, ce qu'il y a
 * à répartir, la taille de l'entreprise et ce qu'elle ouvre. Le modèle dont ces
 * gabarits sont tirés laissait ces valeurs entre crochets, à remplir à la main - avec
 * une mention « si applicable » qui ne disait jamais quand.
 */

import { dateEnFrancais, nombreEnFrancais } from "@/domain/formalite/lettres";
import { formeEnToutesLettres } from "@/domain/modification/annonce";
import { avecElision } from "@/domain/modification/gabarit";
import {
  dotationDeLaReserveLegale,
  estCivile,
  estUnipersonnelle,
  type Affectation,
} from "./regles";
import { confidentialitePossible, type CleExclusion, type Chiffres } from "./confidentialite";
import { regimeDesConventions, type Convention } from "./conventions";

const TIRET = "-";

export interface SocieteApprouvante {
  denomination?: string;
  forme?: string;
  siren?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
  capital?: number | null;
  villeRcs?: string;
}

export interface AssociePresent {
  civilite?: string;
  prenom?: string;
  nom?: string;
  denomination?: string;
  parts?: number | null;
}

export interface ContexteComptes {
  societe: SocieteApprouvante;
  associes: AssociePresent[];
  /** Les valeurs saisies, telles que le formulaire les porte. */
  valeurs: Record<string, string | number | undefined>;
  affectation: Affectation;
  conventions: Convention[];
  exclusions: CleExclusion[];
}

function texte(valeur: unknown): string {
  if (typeof valeur === "number") return String(valeur);
  return typeof valeur === "string" ? valeur.trim() : "";
}

function ou(valeur: string, defaut = TIRET): string {
  return valeur.trim() || defaut;
}

/** « 15 000 » : un montant se relit avec ses espaces. */
function montant(valeur: number): string {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/[  ]/g, " ");
}

function nombre(valeur: unknown): number {
  const lu = Number(texte(valeur).replace(",", "."));
  return Number.isFinite(lu) ? lu : 0;
}

/** Les euros du formulaire deviennent des centimes, où l'arithmétique est exacte. */
function centimes(valeur: unknown): number {
  return Math.round(nombre(valeur) * 100);
}

function euros(valeurCentimes: number): number {
  return valeurCentimes / 100;
}

function adresseSurUneLigne(societe: SocieteApprouvante): string {
  const fin = [texte(societe.codePostal), texte(societe.ville)].filter(Boolean).join(" ");
  return [texte(societe.adresse), fin].filter(Boolean).join(", ") || TIRET;
}

/** « L'an deux mille vingt-six » : un acte écrit l'année en lettres. */
function anneeEnLettres(iso: string): string {
  const annee = Number(iso.slice(0, 4));
  return Number.isFinite(annee) && annee > 0 ? nombreEnFrancais(annee) : TIRET;
}

export function donneesDesComptes(contexte: ContexteComptes): Record<string, unknown> {
  const { societe, associes, valeurs, affectation, conventions } = contexte;

  const forme = ou(texte(societe.forme), "SAS");
  const unipersonnelle = estUnipersonnelle(forme) || associes.length === 1;
  const civile = estCivile(forme);

  const capitalCentimes = Math.round((societe.capital ?? 0) * 100);
  const resultatCentimes = centimes(valeurs.resultat);
  const reportAnterieurCentimes = centimes(valeurs.reportAnterieur);
  const reserveExistanteCentimes = centimes(valeurs.reserveLegale);

  const dotation = dotationDeLaReserveLegale({
    forme,
    resultatCentimes,
    reportAnterieurCentimes,
    capitalCentimes,
    reserveExistanteCentimes,
  });

  const chiffres: Chiffres = {
    totalBilanCentimes: centimes(valeurs.totalBilan),
    chiffreAffairesCentimes: centimes(valeurs.chiffreAffaires),
    effectif: nombre(valeurs.effectif),
  };
  const confidentialite = confidentialitePossible({
    forme,
    chiffres,
    exclusions: contexte.exclusions,
  });

  const regime = regimeDesConventions({
    forme,
    avecCommissaire: texte(valeurs.commissaireAuxComptes) === "Oui",
  });

  const aRepartirCentimes = resultatCentimes + reportAnterieurCentimes;
  const depensesNonDeductiblesCentimes = centimes(valeurs.depensesNonDeductibles);

  const organe = unipersonnelle ? "L'associé unique" : "L'Assemblée Générale";
  const nomsDesAssocies = associes.map((a) =>
    texte(a.denomination) ||
    [texte(a.civilite), texte(a.prenom), texte(a.nom)].filter(Boolean).join(" ")
  );

  return {
    /* --------------------------------------------------------- La société */
    SOCIETE: ou(texte(societe.denomination)),
    FORME_JURIDIQUE: forme,
    FORME_EN_CLAIR: formeEnToutesLettres(forme).toLowerCase(),
    SIREN: ou(texte(societe.siren)),
    SIEGE_SOCIAL: adresseSurUneLigne(societe),
    CAPITAL_FORMATE: montant(societe.capital ?? 0),
    CAPITAL_LETTRES: nombreEnFrancais(societe.capital ?? 0),
    RCS_VILLE: ou(texte(societe.villeRcs) || texte(societe.ville)),
    RCS_DE: avecElision(texte(societe.villeRcs) || texte(societe.ville)),
    /* Une société par actions a des actions, les autres des parts sociales. */
    MOT_TITRES: forme === "SAS" || forme === "SASU" || forme === "SA" ? "actions" : "parts sociales",

    /* -------------------------------------------------------- L'exercice */
    DATE_OUVERTURE_FR: dateEnFrancais(texte(valeurs.dateOuverture)),
    DATE_CLOTURE_FR: dateEnFrancais(texte(valeurs.dateCloture)),
    DATE_ASSEMBLEE_FR: dateEnFrancais(texte(valeurs.dateAssemblee)),
    ANNEE_LETTRES: anneeEnLettres(texte(valeurs.dateAssemblee)),
    HEURE_ASSEMBLEE: ou(texte(valeurs.heureAssemblee), "14 heures"),
    LIEU_ASSEMBLEE: ou(texte(valeurs.lieuAssemblee), "au siège social"),
    /*
     * La ville de signature, pour la formule « Fait à … ».
     *
     * Elle est distincte du lieu de réunion, qui se dit « au siège social » et ne peut
     * pas suivre un « à ». La forme importe au-delà du style : la production d'actes
     * dessine le trait de signature au-dessus du nom quand elle reconnaît « Fait à »,
     * et retire les lignes de tirets qu'on écrirait à la main.
     */
    VILLE_SIGNATURE: ou(texte(societe.ville)),

    /* -------------------------------------------------------- Qui décide */
    IS_UNIPERSONNELLE: unipersonnelle,
    IS_ASSEMBLEE: !unipersonnelle,
    ORGANE: organe,
    DIRIGEANT_NOM: ou(texte(valeurs.dirigeantNom)),
    DIRIGEANT_FONCTION: ou(texte(valeurs.dirigeantFonction), "Président"),
    ASSOCIE_UNIQUE: ou(nomsDesAssocies[0] ?? ""),
    ASSOCIE_UNIQUE_NE_LE_FR: dateEnFrancais(texte(valeurs.associeUniqueNeLe)),
    ASSOCIE_UNIQUE_NE_A: ou(texte(valeurs.associeUniqueNeA)),
    ASSOCIE_UNIQUE_ADRESSE: ou(texte(valeurs.associeUniqueAdresse)),
    ASSOCIES: associes.map((a, rang) => ({
      NOM: nomsDesAssocies[rang] || "Associé " + (rang + 1),
      PARTS: montant(a.parts ?? 0),
    })),
    NB_ASSOCIES: associes.length,

    /* -------------------------------------------------------- Le résultat */
    IS_BENEFICE: resultatCentimes >= 0,
    IS_PERTE: resultatCentimes < 0,
    /* Le mot et le montant s'accordent : « une perte de 3 000 € », non « - 3 000 € ». */
    RESULTAT_MOT: resultatCentimes >= 0 ? "un bénéfice" : "une perte",
    RESULTAT_FORMATE: montant(Math.abs(euros(resultatCentimes))),
    RESULTAT_LETTRES: nombreEnFrancais(Math.abs(euros(resultatCentimes))),
    /*
     * Le report antérieur, dit comme un acte le dit.
     *
     * Un report nul ne se mentionne pas - « augmenté du report de 0 euro » est du
     * bruit. Un report débiteur ne s'écrit pas non plus « augmenté de -6 000 euros » :
     * il diminue, et le signe se lit dans le verbe, non devant le chiffre.
     */
    IS_REPORT_ANTERIEUR: reportAnterieurCentimes !== 0,
    REPORT_ANTERIEUR_VERBE: reportAnterieurCentimes < 0 ? "diminué du" : "augmenté du",
    REPORT_ANTERIEUR_QUALITE: reportAnterieurCentimes < 0 ? "débiteur" : "créditeur",
    REPORT_ANTERIEUR_FORMATE: montant(Math.abs(euros(reportAnterieurCentimes))),
    A_REPARTIR_FORMATE: montant(euros(aRepartirCentimes)),

    IS_DEPENSES_NON_DEDUCTIBLES: depensesNonDeductiblesCentimes > 0,
    DEPENSES_NON_DEDUCTIBLES_FORMATE: montant(euros(depensesNonDeductiblesCentimes)),

    /* ------------------------------------------------------ L'affectation */
    /*
     * Les postes retenus, et eux seuls.
     *
     * Une ligne par poste chiffré, dans une boucle : les rendre par des sections
     * conditionnelles laissait un paragraphe vide à la place de chaque poste absent,
     * et l'acte s'aérait de trous au milieu de la résolution.
     */
    POSTES: [
      {
        LIBELLE: "à la réserve légale",
        MONTANT: montant(euros(affectation.reserveLegaleCentimes)),
        SUITE: ", la portant à " + montant(euros(dotation.apresDotationCentimes)) + " euros",
        RETENU: affectation.reserveLegaleCentimes > 0,
      },
      {
        LIBELLE: "aux autres réserves",
        MONTANT: montant(euros(affectation.autresReservesCentimes)),
        SUITE: "",
        RETENU: affectation.autresReservesCentimes > 0,
      },
      {
        LIBELLE: "aux associés, à titre de dividende",
        MONTANT: montant(euros(affectation.dividendesCentimes)),
        SUITE: "",
        RETENU: affectation.dividendesCentimes > 0,
      },
      {
        LIBELLE: "au compte « report à nouveau »",
        MONTANT: montant(euros(affectation.reportANouveauCentimes)),
        SUITE: "",
        RETENU: resultatCentimes >= 0,
      },
    ].filter((poste) => poste.RETENU),

    IS_RESERVE_LEGALE: affectation.reserveLegaleCentimes > 0,
    IS_AUTRES_RESERVES: affectation.autresReservesCentimes > 0,
    IS_DIVIDENDES: affectation.dividendesCentimes > 0,
    AFF_RESERVE_LEGALE: montant(euros(affectation.reserveLegaleCentimes)),
    AFF_AUTRES_RESERVES: montant(euros(affectation.autresReservesCentimes)),
    AFF_DIVIDENDES: montant(euros(affectation.dividendesCentimes)),
    AFF_REPORT: montant(euros(affectation.reportANouveauCentimes)),
    RESERVE_APRES_FORMATE: montant(euros(dotation.apresDotationCentimes)),
    RESERVE_PLAFOND_FORMATE: montant(euros(dotation.plafondCentimes)),

    /* ---------------------------------------------------- Les conventions */
    IS_CONVENTIONS: conventions.length > 0,
    IS_AUCUNE_CONVENTION: conventions.length === 0,
    IS_MENTION_AU_REGISTRE: regime.regime === "mention-au-registre",
    IS_CONVENTIONS_SANS_OBJET: regime.regime === "sans-objet",
    ARTICLE_CONVENTIONS: regime.article,
    RAPPORT_PAR: regime.rapportPar ?? "",
    CONVENTIONS: conventions.map((convention, rang) => ({
      RANG: rang + 1,
      NATURE: ou(convention.nature),
      PARTIE: ou(convention.partie),
      OBJET: ou(convention.objet),
      MONTANT: montant(euros(convention.montantCentimes)),
      IS_MONTANT: convention.montantCentimes > 0,
      MODALITES: texte(convention.modalites),
      IS_MODALITES: texte(convention.modalites).length > 0,
      CONCLUSION: convention.poursuivie
        ? "poursuivie au cours de l'exercice"
        : "conclue au cours de l'exercice",
    })),

    /* ------------------------------------------------- La confidentialité */
    IS_CONFIDENTIALITE_TOTALE: confidentialite.portee === "tout",
    IS_CONFIDENTIALITE_RESULTAT: confidentialite.portee === "compte-de-resultat",
    TAILLE_ENTREPRISE: confidentialite.taille,
    IS_DEPOT_AU_GREFFE: !civile,
    IS_SOCIETE_CIVILE: civile,
  };
}
