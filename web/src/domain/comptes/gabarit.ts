import { adresseSurUneLigne as adresseDuSiege, adresseLisible } from "@/domain/modification/gabarit";
import { sirenLisible } from "@/domain/modification/annonce";
import { natureDeLaForme, fonctionsDuDirigeant } from "@/domain/formalite/formes";
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
import { formeEnToutesLettres, avecMajusculeInitiale } from "@/domain/modification/annonce";
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

/*
 * L'adresse du registre porte déjà son code postal et sa commune.
 *
 * On les recollait derrière : le siège s'écrivait « 34 RUE LAUGIER 75017 PARIS, 75017
 * PARIS » en tête d'un acte déposé au greffe. Le parcours modification avait résolu ce
 * cas, et sa fonction est exportée - trois autres la recopiaient sans sa garde.
 */
function adresseSurUneLigne(societe: SocieteApprouvante): string {
  return adresseDuSiege(societe.adresse, societe.codePostal, societe.ville);
}

/**
 * « 14 heures », « 14 heures 30 » : l'heure d'une assemblée s'écrit en toutes lettres.
 *
 * La saisie est libre et vaut ce qu'elle vaut - « 14 », « 14h », « 14h30 », « 14:30 »,
 * ou déjà « 14 heures ». Un acte ne peut pas porter « à 14, ».
 */
function heureEnFrancais(saisie: string): string {
  const nette = saisie.trim();
  if (!nette) return "14 heures";
  /* Déjà écrite en lettres : on n'y touche pas. */
  if (/heures?/i.test(nette)) return nette;

  const lu = nette.match(/^(\d{1,2})\s*(?:[h:.]\s*(\d{1,2}))?$/);
  if (!lu) return nette;

  const heures = Number(lu[1]);
  const minutes = lu[2] ? Number(lu[2]) : 0;
  if (!Number.isFinite(heures) || heures > 23 || minutes > 59) return nette;

  const mot = heures <= 1 ? " heure" : " heures";
  return heures + mot + (minutes > 0 ? " " + minutes : "");
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
    /*
     * La même chose, mais en tête de ligne.
     *
     * L'en-tête d'un acte annonçait « société par actions simplifiée au capital de 500
     * euros » : une ligne d'identification qui commence en minuscule sous le nom de la
     * société. La forme reste en bas de casse partout ailleurs, où elle suit une
     * virgule - « La société X, société par actions simplifiée… ».
     */
    FORME_EN_CLAIR_CAPITALE: avecMajusculeInitiale(formeEnToutesLettres(forme).toLowerCase()),
    /*
     * Le SIREN se lit par groupes de trois, comme le cabinet l'écrit.
     *
     * Il partait d'un bloc - « 899979934 » - dans une déclaration signée sur l'honneur
     * et déposée au greffe, là où tous les autres actes du cabinet le groupent.
     */
    SIREN: ou(sirenLisible(societe.siren)),
    SIEGE_SOCIAL: adresseSurUneLigne(societe),
    CAPITAL_FORMATE: montant(societe.capital ?? 0),
    CAPITAL_LETTRES: nombreEnFrancais(societe.capital ?? 0),
    RCS_VILLE: ou(texte(societe.villeRcs) || texte(societe.ville)),
    RCS_DE: avecElision(texte(societe.villeRcs) || texte(societe.ville)),
    /*
     * Une société par actions a des actions, les autres des parts sociales.
     *
     * Trois formes étaient nommées ici, et le procès-verbal d'approbation d'une SELAS
     * parlait donc de parts sociales. La nature de la forme est déclarée une fois.
     */
    MOT_TITRES: natureDeLaForme(forme).titres,

    /* -------------------------------------------------------- L'exercice */
    DATE_OUVERTURE_FR: dateEnFrancais(texte(valeurs.dateOuverture)),
    DATE_CLOTURE_FR: dateEnFrancais(texte(valeurs.dateCloture)),
    DATE_ASSEMBLEE_FR: dateEnFrancais(texte(valeurs.dateAssemblee)),
    ANNEE_LETTRES: anneeEnLettres(texte(valeurs.dateAssemblee)),
    /*
     * L'heure s'écrit en toutes lettres, quoi qu'on ait tapé.
     *
     * Le champ annonce « 14 heures par défaut » et se saisit librement : qui tape « 14 »
     * obtenait « le 30 août 2026 à 14, » dans un acte déposé au greffe, et qui tape
     * « 14h30 » obtenait « à 14h30, ». La valeur est mise en forme ici plutôt que de
     * compter sur ce que le client aura écrit.
     */
    HEURE_ASSEMBLEE: heureEnFrancais(texte(valeurs.heureAssemblee)),
    LIEU_ASSEMBLEE: ou(texte(valeurs.lieuAssemblee), "au siège social"),
    /*
     * La ville de signature, pour la formule « Fait à … ».
     *
     * Elle est distincte du lieu de réunion, qui se dit « au siège social » et ne peut
     * pas suivre un « à ». La forme importe au-delà du style : la production d'actes
     * dessine le trait de signature au-dessus du nom quand elle reconnaît « Fait à »,
     * et retire les lignes de tirets qu'on écrirait à la main.
     */
    /*
     * La ville de signature s'écrit comme un nom propre.
     *
     * Le registre la rend en capitales - « PARIS » - et l'acte se datait « Fait à
     * PARIS ». Une adresse lisible suit la même règle ailleurs dans le document.
     */
    VILLE_SIGNATURE: ou(adresseLisible(texte(societe.ville))),

    /* -------------------------------------------------------- Qui décide */
    IS_UNIPERSONNELLE: unipersonnelle,
    IS_ASSEMBLEE: !unipersonnelle,
    ORGANE: organe,
    /*
     * Le dirigeant se saisit en trois champs ; l'acte l'écrit sur une ligne. Les
     * dossiers commencés avant le découpage gardent leur ligne libre : elle sert de
     * repli, sans quoi leur procès-verbal sortirait sans dirigeant.
     */
    DIRIGEANT_NOM: ou(
      [
        texte(valeurs.dirigeantCivilite),
        texte(valeurs.dirigeantPrenom),
        texte(valeurs.dirigeantNomFamille),
      ]
        .filter(Boolean)
        .join(" ") || texte(valeurs.dirigeantNom)
    ),
    /*
     * Un titre que la forme ne connaît pas ne part pas dans l'acte.
     *
     * L'écran restreint désormais les choix et la vérification refuse un titre qui ne
     * va pas avec la forme - mais un dossier déjà réglé garde le sien, et une société
     * d'exercice libéral par actions simplifiée s'est ainsi déposée « en qualité
     * d'associé unique et de Gérant ». Un tel titre n'existe pas chez elle : le sien
     * est certain, et c'est lui qu'on écrit.
     *
     * Le repli n'est pas une correction silencieuse d'un choix possible : il ne joue
     * que sur un titre impossible, où l'ancienne valeur ne pouvait qu'être fausse.
     */
    DIRIGEANT_FONCTION: fonctionsDuDirigeant(forme).includes(texte(valeurs.dirigeantFonction))
      ? texte(valeurs.dirigeantFonction)
      : natureDeLaForme(forme).titreDirigeant,
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
