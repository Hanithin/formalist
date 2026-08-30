import { adresseSurUneLigne as adresseDuSiege } from "@/domain/modification/gabarit";
import { natureDeLaForme } from "@/domain/formalite/formes";
/**
 * Ce que les actes de fermeture ont besoin de savoir.
 *
 * Dix documents s'alimentent ici, et ils partagent presque tout : la société, la
 * décision, le liquidateur. Ce qui les sépare tient en quelques valeurs - la majorité
 * applicable, le solde de la liquidation, la date de transmission du patrimoine.
 *
 * Tout ce qui se calcule est calculé. Les modèles qui circulent laissent entre crochets
 * la majorité, le boni et le droit de partage, avec une mention « le cas échéant » qui
 * ne dit jamais quel cas. Ici, la phrase sort juste ou ne sort pas.
 */

import { dateEnFrancais, nombreEnFrancais, sirenLisible } from "@/domain/formalite/lettres";
import { formeEnToutesLettres, avecMajusculeInitiale } from "@/domain/modification/annonce";
import { avecElision } from "@/domain/modification/gabarit";
import { decisionDeDissolution } from "./decision";
import { resultatDeLaLiquidation } from "./liquidation";
import { delaiDOpposition, termeDuMandat } from "./delais";
import { estUnipersonnelle } from "./voie";

const TIRET = "-";

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

export interface AssociePresent {
  civilite?: string;
  prenom?: string;
  nom?: string;
  denomination?: string;
  parts?: number | null;
}

export interface ContexteFermeture {
  voie: "liquidation-amiable" | "tup";
  societe: SocieteFermee;
  associes: AssociePresent[];
  valeurs: Record<string, string | number | undefined>;
  /** La date de référence pour le décompte du délai d'opposition. */
  aujourdHui?: Date;
}

function texte(valeur: unknown): string {
  if (typeof valeur === "number") return String(valeur);
  return typeof valeur === "string" ? valeur.trim() : "";
}

function ou(valeur: string, defaut = TIRET): string {
  return valeur.trim() || defaut;
}

function montant(valeur: number): string {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/[  ]/g, " ");
}

function nombre(valeur: unknown): number {
  const lu = Number(texte(valeur).replace(",", "."));
  return Number.isFinite(lu) ? lu : 0;
}

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
function adresseSurUneLigne(societe: SocieteFermee): string {
  return adresseDuSiege(societe.adresse, societe.codePostal, societe.ville);
}

/**
 * « le vingt novembre » : le quantième s'écrit en lettres après l'année.
 *
 * Le procès-verbal de clôture ouvrait sur « L'an deux mille vingt-six, le 20 novembre
 * 2026 » - l'année deux fois, et un chiffre au milieu d'une formule qui les écrit en
 * toutes lettres. Les procès-verbaux de modification ouvrent depuis toujours sur « le
 * dix septembre ».
 *
 * Le premier du mois fait exception, comme dans tous les actes.
 */
function jourEnLettres(iso: string): string {
  const jour = Number(iso.slice(8, 10));
  const mois = Number(iso.slice(5, 7));
  if (!Number.isFinite(jour) || jour < 1 || !Number.isFinite(mois)) return TIRET;

  const nom = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
  ][mois - 1];
  return (jour === 1 ? "premier" : nombreEnFrancais(jour)) + (nom ? " " + nom : "");
}

/** « L'an deux mille vingt-six » : un acte écrit son année en lettres. */
function anneeEnLettres(iso: string): string {
  const annee = Number(iso.slice(0, 4));
  return Number.isFinite(annee) && annee > 0 ? nombreEnFrancais(annee) : TIRET;
}

function nomComplet(personne: { civilite?: unknown; prenom?: unknown; nom?: unknown }): string {
  return [texte(personne.civilite), texte(personne.prenom), texte(personne.nom)]
    .filter(Boolean)
    .join(" ");
}

/**
 * Le motif, rédigé pour suivre « en raison de ».
 *
 * L'écran propose des intitulés qui se lisent seuls - « Cessation de l'activité » - et
 * l'acte les enchâsse dans une phrase. Recopier l'intitulé en minuscules donnait « en
 * raison de cessation de l'activité » : il manque l'article, et cela se voit à la
 * première lecture.
 */
const MOTIFS: Record<string, string> = {
  "Cessation de l'activité": "la cessation de l'activité",
  "Objet social réalisé ou épuisé": "la réalisation de l'objet social",
  "Mésentente entre associés": "la mésentente entre les associés",
  "Départ à la retraite du dirigeant": "le départ à la retraite du dirigeant",
  "Réorganisation du groupe": "la réorganisation du groupe",
  "Autre motif": "circonstances propres à la société",
};

/**
 * L'accord du liquidateur, décidé sur sa civilité.
 *
 * La passe de mise en page sait résoudre « né(e) », mais elle devine le genre en lisant
 * le paragraphe : dans un procès-verbal qui nomme un Monsieur et une Madame, elle se
 * trompe une fois sur deux. Ici la civilité est connue, et l'accord n'est pas une
 * inférence.
 */
function accord(civilite: string): {
  ne: string;
  enfantDe: string;
  nomme: string;
  soussigne: string;
} {
  const femme = /^(madame|mademoiselle|mme)$/i.test(civilite.trim());
  return {
    ne: femme ? "née" : "né",
    enfantDe: femme ? "fille de" : "fils de",
    nomme: femme ? "nommée" : "nommé",
    soussigne: femme ? "Je soussignée" : "Je soussigné",
  };
}

export function donneesDeLaFermeture(contexte: ContexteFermeture): Record<string, unknown> {
  const { societe, associes, valeurs } = contexte;

  const forme = ou(texte(societe.forme), "SAS");
  const unipersonnelle = estUnipersonnelle(forme) || associes.length <= 1;
  const capitalCentimes = Math.round((societe.capital ?? 0) * 100);

  const regle = decisionDeDissolution({
    forme,
    unipersonnelle,
    avantAout2005: texte(valeurs.sarlAvant2005) === "Oui",
    majoriteStatutaire: texte(valeurs.majoriteStatutaire),
  });

  const liquidateur = nomComplet({
    civilite: valeurs.liquidateurCivilite,
    prenom: valeurs.liquidateurPrenom,
    nom: valeurs.liquidateurNom,
  });

  const resultat = resultatDeLaLiquidation({
    actifRealiseCentimes: centimes(valeurs.actifRealise),
    passifApureCentimes: centimes(valeurs.passifApure),
    capitalCentimes,
    fraisDeLiquidationCentimes: centimes(valeurs.fraisDeLiquidation),
    unipersonnelle,
  });

  const accordDuLiquidateur = accord(texte(valeurs.liquidateurCivilite));

  /*
   * Le représentant de l'associé unique se saisit sur une ligne - « Madame Claire
   * MARTIN, présidente » - et non par un menu de civilité. L'accord se lit donc sur le
   * premier mot, qui est la civilité dans tous les cas où elle est renseignée.
   */
  const representantEstFemme = /^\s*(madame|mademoiselle|mme)\b/i.test(
    texte(valeurs.associeRepresentant)
  );

  const opposition = delaiDOpposition(texte(valeurs.publicationBodacc), contexte.aujourdHui);

  const nomsDesAssocies = associes.map(
    (associe) => texte(associe.denomination) || nomComplet(associe)
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
    SIREN: ou(sirenLisible(texte(societe.siren))),
    SIEGE_SOCIAL: adresseSurUneLigne(societe),
    CAPITAL_FORMATE: montant(societe.capital ?? 0),
    CAPITAL_LETTRES: nombreEnFrancais(societe.capital ?? 0),
    RCS_VILLE: ou(texte(societe.villeRcs) || texte(societe.ville)),
    RCS_DE: avecElision(texte(societe.villeRcs) || texte(societe.ville)),
    VILLE_SIGNATURE: ou(texte(societe.ville)),
    /* Même table que partout ailleurs : trois formes nommées ici en oubliaient douze. */
    MOT_TITRES: natureDeLaForme(forme).titres,

    /* -------------------------------------------------------- Qui décide */
    IS_UNIPERSONNELLE: unipersonnelle,
    IS_ASSEMBLEE: !unipersonnelle,
    ORGANE: regle.organe,
    /*
     * La clôture ne se décide pas en assemblée extraordinaire.
     *
     * L'extraordinaire est réservé à ce qui touche aux statuts, et la dissolution en
     * relève. Approuver des comptes de liquidation et donner quitus est un acte
     * ordinaire : le procès-verbal de clôture qui se dit « extraordinaire » se
     * contredit avec son propre ordre du jour.
     */
    ORGANE_CLOTURE: regle.organe.replace(" extraordinaire", ""),
    MAJORITE: regle.majorite,
    IS_QUORUM: Boolean(regle.quorum),
    QUORUM: regle.quorum ?? "",
    FONDEMENT_MAJORITE: regle.fondement,
    ASSOCIES: associes.map((associe, rang) => ({
      NOM: nomsDesAssocies[rang] || "Associé " + (rang + 1),
      PARTS: montant(associe.parts ?? 0),
    })),
    NB_ASSOCIES: associes.length,
    ASSOCIE_UNIQUE: ou(nomsDesAssocies[0] ?? ""),

    /* ------------------------------------------------------ La dissolution */
    DATE_DISSOLUTION_FR: dateEnFrancais(texte(valeurs.dateDissolution)),
    ANNEE_LETTRES: anneeEnLettres(texte(valeurs.dateDissolution)),
    HEURE_DECISION: ou(texte(valeurs.heureDecision), "11 heures"),
    LIEU_DECISION: ou(texte(valeurs.lieuDecision), "au siège social"),
    MOTIF_DISSOLUTION: MOTIFS[texte(valeurs.motifDissolution)] ?? "la cessation de l'activité",
    TERME_DU_MANDAT_FR: dateEnFrancais(termeDuMandat(texte(valeurs.dateDissolution))),

    /* ------------------------------------------------------ Le liquidateur */
    LIQUIDATEUR: ou(liquidateur),
    LIQUIDATEUR_NE: accordDuLiquidateur.ne,
    LIQUIDATEUR_ENFANT_DE: accordDuLiquidateur.enfantDe,
    LIQUIDATEUR_NOMME: accordDuLiquidateur.nomme,
    LIQUIDATEUR_SOUSSIGNE: accordDuLiquidateur.soussigne,
    LIQUIDATEUR_NE_LE_FR: dateEnFrancais(texte(valeurs.liquidateurNeLe)),
    LIQUIDATEUR_NE_A: ou(texte(valeurs.liquidateurNeA)),
    LIQUIDATEUR_NATIONALITE: ou(texte(valeurs.liquidateurNationalite), "française"),
    LIQUIDATEUR_PERE: ou(texte(valeurs.liquidateurPere)),
    LIQUIDATEUR_MERE: ou(texte(valeurs.liquidateurMere)),
    LIQUIDATEUR_ADRESSE: ou(texte(valeurs.liquidateurAdresse)),
    SIEGE_LIQUIDATION: ou(texte(valeurs.siegeDeLaLiquidation), adresseSurUneLigne(societe)),

    /* --------------------------------------------------------- La clôture */
    DATE_CLOTURE_FR: dateEnFrancais(texte(valeurs.dateCloture)),
    ANNEE_CLOTURE_LETTRES: anneeEnLettres(texte(valeurs.dateCloture)),
    JOUR_CLOTURE_LETTRES: jourEnLettres(texte(valeurs.dateCloture)),
    DATE_ARRETE_FR: dateEnFrancais(texte(valeurs.dateArreteDesComptes)),
    LIEU_CLOTURE: ou(texte(valeurs.lieuCloture), "au siège de la liquidation"),

    /* ---------------------------------------------- Les comptes définitifs */
    ACTIF_REALISE_FORMATE: montant(euros(centimes(valeurs.actifRealise))),
    PASSIF_APURE_FORMATE: montant(euros(centimes(valeurs.passifApure))),
    FRAIS_LIQUIDATION_FORMATE: montant(euros(centimes(valeurs.fraisDeLiquidation))),
    IS_FRAIS_LIQUIDATION: centimes(valeurs.fraisDeLiquidation) > 0,
    ACTIF_NET_FORMATE: montant(euros(resultat.actifNetCentimes)),
    CAPITAL_REMBOURSE_FORMATE: montant(euros(resultat.capitalRembourseCentimes)),

    /*
     * Le solde, dit d'une seule manière.
     *
     * Le mot et le montant s'accordent : « un boni de 4 000 euros » ou « un mali de
     * 4 000 euros », jamais « un solde de -4 000 euros ». Le signe se lit dans le mot.
     */
    IS_BONI: resultat.boniCentimes > 0,
    IS_MALI: resultat.maliCentimes > 0,
    IS_SOLDE_NUL: resultat.boniCentimes === 0 && resultat.maliCentimes === 0,
    SOLDE_MOT: resultat.boniCentimes > 0 ? "un boni" : resultat.maliCentimes > 0 ? "un mali" : "",
    BONI_FORMATE: montant(euros(resultat.boniCentimes)),
    BONI_LETTRES: nombreEnFrancais(euros(resultat.boniCentimes)),
    MALI_FORMATE: montant(euros(resultat.maliCentimes)),

    IS_DROIT_DE_PARTAGE: resultat.droitDePartageCentimes > 0,
    ASSIETTE_PARTAGE_FORMATE: montant(euros(resultat.assietteDuPartageCentimes)),
    DROIT_DE_PARTAGE_FORMATE: montant(euros(resultat.droitDePartageCentimes)),

    /* -------------------------------------- La dissolution sans liquidation */
    IS_TUP: contexte.voie === "tup",
    ASSOCIE_DENOMINATION: ou(texte(valeurs.associeDenomination)),
    ASSOCIE_FORME: ou(texte(valeurs.associeForme)),
    ASSOCIE_SIREN: ou(sirenLisible(texte(valeurs.associeSiren))),
    ASSOCIE_CAPITAL_FORMATE: montant(nombre(valeurs.associeCapital)),
    IS_ASSOCIE_CAPITAL: nombre(valeurs.associeCapital) > 0,
    ASSOCIE_SIEGE: ou(texte(valeurs.associeSiege)),
    ASSOCIE_REPRESENTANT: ou(texte(valeurs.associeRepresentant)),
    ASSOCIE_SOUSSIGNE: representantEstFemme ? "La soussignée" : "Le soussigné",
    DATE_BODACC_FR: dateEnFrancais(texte(valeurs.publicationBodacc)),
    IS_OPPOSITION_ECOULEE: Boolean(opposition?.ecoule),
    DATE_FIN_OPPOSITION_FR: dateEnFrancais(opposition?.expireLe ?? null),
    DATE_TRANSMISSION_FR: dateEnFrancais(opposition?.transmissionLe ?? null),
  };
}
