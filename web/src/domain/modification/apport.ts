/**
 * L'apport de titres à une holding, et ce qui en découle.
 *
 * Un associé apporte les titres qu'il détient dans une société à une autre société -
 * en général une holding qu'il vient de créer - et reçoit en échange des titres de
 * celle-ci, émis par une augmentation de capital. La plus-value qu'il réalise n'est
 * pas imposée tout de suite : c'est tout l'intérêt de l'opération.
 *
 * Trois sociétés se croisent là où le reste du parcours n'en connaît qu'une : la
 * société modifiée est la bénéficiaire, dont le capital augmente ; la société dont
 * les titres sont apportés ne change pas, mais l'acte doit la décrire entièrement ;
 * et l'apporteur est une personne physique, décrite avec son état civil.
 *
 * Ce module ne contient que les règles. Ce qui relève de la saisie est dans types.ts,
 * ce qui relève du document dans gabarit.ts.
 */

import { natureDeLaForme } from "@/domain/formalite/formes";
import type { Valeurs } from "./types";

/* ------------------------------------------------------------ Régime fiscal */

export type RegimeApport = "report" | "sursis";

export interface Regime {
  regime: RegimeApport;
  article: string;
  libelle: string;
  explication: string;
}

/**
 * Report ou sursis : c'est le contrôle qui décide, non le choix des parties.
 *
 * Les deux régimes sont couramment confondus, y compris dans des actes rédigés par
 * des professionnels. Ils n'ont pourtant ni la même base ni les mêmes suites :
 *
 *   - l'apporteur contrôle la bénéficiaire : report de l'article 150-0 B ter, avec
 *     un suivi déclaratif annuel, et une obligation de remploi si la holding revend
 *     les titres apportés dans les trois ans ;
 *   - il ne la contrôle pas : sursis de l'article 150-0 B, sans suivi ni remploi.
 *
 * Écrire « sursis » dans un acte qui relève du report, ou l'inverse, expose à un
 * redressement sur une opération par ailleurs régulière. Le régime se déduit donc,
 * il ne se coche pas.
 */
export function regimeApport(controleLaBeneficiaire: boolean): Regime {
  if (controleLaBeneficiaire) {
    return {
      regime: "report",
      article: "150-0 B ter du code général des impôts",
      libelle: "Report d'imposition",
      explication:
        "L'apporteur contrôle la société bénéficiaire : la plus-value est placée en report, de plein droit et sans option à exercer. Le report se suit d'année en année et prend fin dans les cas prévus par la loi.",
    };
  }

  return {
    regime: "sursis",
    article: "150-0 B du code général des impôts",
    libelle: "Sursis d'imposition",
    explication:
      "L'apporteur ne contrôle pas la société bénéficiaire : la plus-value bénéficie du sursis, automatique et sans suivi déclaratif particulier. Ni obligation de remploi, ni durée de conservation à tenir.",
  };
}

/**
 * Le remploi, tel que la loi de finances pour 2026 l'a durci.
 *
 * Les valeurs d'avant - 60 %, vingt-quatre mois, conservation de douze mois - se
 * retrouvent encore dans des modèles d'actes en circulation. Elles ne valent plus
 * pour les cessions réalisées à compter du 21 février 2026, et un acte qui les
 * annonce trompe celui qui le signe sur ce qu'il devra faire.
 *
 * Elles sont ici, en un seul endroit : le prochain texte les déplacera d'une ligne.
 */
export const REMPLOI = {
  /** Part du produit de cession à réinvestir pour maintenir le report. */
  quota: 0.7,
  /** Délai pour réinvestir, à compter de la cession. */
  delaiMois: 36,
  /** Durée de conservation des biens acquis en remploi. */
  conservationAns: 5,
  /** Délai au-delà duquel la cession par la holding ne remet plus le report en cause. */
  franchiseAns: 3,
  /** Depuis quand ces valeurs s'appliquent, pour le dire dans l'acte. */
  applicableDepuis: "21 février 2026",
} as const;

/** Ce qui met fin au report, dans l'ordre où cela se produit en pratique. */
export const FINS_DU_REPORT = [
  "La cession, le rachat, le remboursement ou l'annulation des titres reçus en rémunération de l'apport.",
  "La cession par la société bénéficiaire des titres apportés, moins de " +
    REMPLOI.franchiseAns +
    " ans après l'apport, sauf remploi d'au moins " +
    Math.round(REMPLOI.quota * 100) +
    " % du produit de cession dans les " +
    REMPLOI.delaiMois +
    " mois.",
  "Le transfert du domicile fiscal de l'apporteur hors de France, qui déclenche l'imposition prévue à l'article 167 bis du code général des impôts, un sursis de paiement restant possible.",
  "La dissolution de la société bénéficiaire, ou l'apport des titres reçus à une société non soumise à l'impôt sur les sociétés.",
] as const;

/** Ce qui ne peut pas servir de remploi depuis la loi de finances pour 2026. */
export const REMPLOI_EXCLU = [
  "l'immobilier - marchand de biens, promotion, gestion patrimoniale",
  "les activités financières - banque, assurance, courtage",
  "les installations solaires à tarif de rachat garanti",
] as const;

/* -------------------------------------------- Évaluation et commissaire aux apports */

/** Au-delà, un apport en nature ne peut jamais échapper au commissaire. */
export const SEUIL_APPORT_CENTIMES = 30_000_00;

export interface VerdictEvaluation {
  /** Le commissaire aux apports est-il imposé ? */
  commissaireRequis: boolean;
  /** Les deux seuils de la dispense sont-ils tenus ? */
  seuilsTenus: boolean;
  /** Pourquoi, dans les termes du dossier. */
  motifs: string[];
  /**
   * Ce que la dispense a de fragile pour cette forme, quand elle en a.
   *
   * Vide pour une SARL, où le texte l'accorde sans détour.
   */
  reserve: string | null;
}

/** Les formes où la dispense vaut expressément pour une augmentation de capital. */
function dispenseEcriteAuTexte(forme: string | null | undefined): boolean {
  /* Le préfixe du sigle laissait de côté la SELARL, qui relève pourtant du même régime. */
  return natureDeLaForme(forme).regime === "sarl";
}

/**
 * Ce que la dispense a de fragile pour cette forme, ou rien.
 *
 * La réserve ne tient pas aux montants mais au texte : l'article L. 223-33 étend
 * expressément la dispense aux augmentations de capital des SARL, là où l'article
 * L. 227-1 ne parle que des « futurs associés » et de la constitution. Elle vaut donc
 * dès qu'une société par actions se dispense, quels que soient les chiffres.
 */
export function reserveSurLaDispense(forme: string | null | undefined): string | null {
  if (dispenseEcriteAuTexte(forme)) return null;

  return (
    "Attention : dans une société par actions, cette dispense n'est prévue par la loi " +
    "que pour la création de la société, pas pour une augmentation de capital. Elle est " +
    "couramment admise en pratique, mais certains greffes la refusent. Votre avocat " +
    "tranchera à la relecture (articles L. 227-1 et L. 225-147 du code de commerce)."
  );
}

/**
 * Faut-il un commissaire aux apports, et la dispense tient-elle debout ?
 *
 * Deux seuils cumulatifs : aucun apport en nature au-dessus de trente mille euros, et
 * l'ensemble des apports non évalués sous la moitié du capital.
 *
 * Là où le sol se dérobe, c'est sur le champ d'application. L'article L. 223-33 étend
 * expressément aux augmentations de capital la dispense que L. 223-9 accorde aux SARL.
 * Rien de tel pour les sociétés par actions : l'article L. 227-1 vise « les futurs
 * associés » et « la valeur attribuée aux apports en nature lors de la constitution de
 * la société ». Il est écrit pour la constitution. Une augmentation de capital en SAS
 * relève de L. 225-147, qui ne prévoit aucune dispense.
 *
 * La pratique est partagée et les greffes ne réagissent pas tous de la même façon. On
 * propose donc la dispense, en disant ce qu'elle a d'incertain - plutôt que de la
 * refuser à qui la pratique couramment, ou de l'accorder sans prévenir.
 */
export function evaluationDesApports(args: {
  formeBeneficiaire: string | null | undefined;
  valeurApportCentimes: number;
  capitalFinalCentimes: number;
  /** L'utilisateur a-t-il choisi de recourir à un commissaire malgré la dispense ? */
  commissaireVolontaire?: boolean;
}): VerdictEvaluation {
  const { formeBeneficiaire, valeurApportCentimes, capitalFinalCentimes } = args;

  const motifs: string[] = [];
  const sousLeSeuil = valeurApportCentimes > 0 && valeurApportCentimes <= SEUIL_APPORT_CENTIMES;
  const sousLaMoitie =
    capitalFinalCentimes > 0 && valeurApportCentimes * 2 <= capitalFinalCentimes;

  motifs.push(
    sousLeSeuil
      ? "La valeur de l'apport ne dépasse pas 30 000 €."
      : "La valeur de l'apport dépasse 30 000 € : le commissaire aux apports est imposé, sans exception."
  );
  motifs.push(
    sousLaMoitie
      ? "L'apport représente moins de la moitié du capital après l'opération."
      : "L'apport représente plus de la moitié du capital après l'opération."
  );

  const seuilsTenus = sousLeSeuil && sousLaMoitie;

  const reserve = seuilsTenus ? reserveSurLaDispense(formeBeneficiaire) : null;

  return {
    commissaireRequis: !seuilsTenus || args.commissaireVolontaire === true,
    seuilsTenus,
    motifs,
    reserve,
  };
}

/* ------------------------------------------------------ Le plan de capital */

export interface PlanDeCapital {
  capitalActuelCentimes: number;
  /** Augmentation en numéraire décidée avant l'apport, s'il y en a une. */
  numeraireCentimes: number;
  valeurApportCentimes: number;
  /** La part de la valeur apportée qui va en prime, non au capital. */
  primeCentimes: number;
  capitalApresNumeraireCentimes: number;
  capitalFinalCentimes: number;
  /** Part de l'apport dans le capital final, en pourcentage. */
  partDeLApport: number;
  /**
   * Le numéraire qu'il faudrait pour passer sous la moitié du capital.
   *
   * L'apport passe sous la moitié dès que le capital qui le précède l'égale : la
   * condition `A <= (C + N + A) / 2` se réduit à `N >= A - C`. C'est la raison d'être
   * de la double augmentation, et elle se calcule au lieu de se tâtonner.
   */
  numeraireMinimalCentimes: number;
}

export function planDeCapital(args: {
  capitalActuelCentimes: number;
  numeraireCentimes: number;
  valeurApportCentimes: number;
  /**
   * La prime d'apport, quand les titres émis valent moins que ce qui est apporté.
   *
   * Elle ne monte pas au capital : elle va en réserve. Un plan qui l'ignorerait
   * annoncerait un capital final que les statuts ne porteraient pas, et le greffe
   * verrait l'écart avant nous.
   */
  primeCentimes?: number;
}): PlanDeCapital {
  const capitalActuelCentimes = Math.max(0, args.capitalActuelCentimes || 0);
  const numeraireCentimes = Math.max(0, args.numeraireCentimes || 0);
  const valeurApportCentimes = Math.max(0, args.valeurApportCentimes || 0);
  const primeCentimes = Math.min(
    Math.max(0, args.primeCentimes || 0),
    valeurApportCentimes
  );

  const capitalApresNumeraireCentimes = capitalActuelCentimes + numeraireCentimes;
  const capitalFinalCentimes =
    capitalApresNumeraireCentimes + valeurApportCentimes - primeCentimes;

  return {
    capitalActuelCentimes,
    numeraireCentimes,
    valeurApportCentimes,
    primeCentimes,
    capitalApresNumeraireCentimes,
    capitalFinalCentimes,
    partDeLApport:
      capitalFinalCentimes > 0
        ? Math.round((valeurApportCentimes / capitalFinalCentimes) * 10000) / 100
        : 0,
    numeraireMinimalCentimes: Math.max(0, valeurApportCentimes - capitalActuelCentimes),
  };
}

/* ------------------------------------------------------------ Vérifications */

export interface AnomalieDApport {
  champ: string;
  message: string;
}

function nombre(valeur: unknown): number {
  if (typeof valeur === "number") return valeur;
  const n = Number(String(valeur ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function rempli(valeur: unknown): boolean {
  return String(valeur ?? "").trim().length > 0;
}

/**
 * Ce qui manque ou ne tient pas debout dans un apport de titres.
 *
 * Les incohérences visées ici sont celles qu'un formulaire laisse passer sans
 * broncher et que le greffe renvoie des semaines plus tard : apporter plus de titres
 * qu'il n'en existe, une valeur nominale qui ne divise pas le montant de
 * l'augmentation, un capital annoncé qui ne correspond pas à ce qui est apporté.
 */
/**
 * La valeur nominale d'un titre de la société apportée, quand elle se déduit.
 *
 * Capital, nombre de titres et nominale sont liés : le capital est le produit des deux
 * autres. Le registre rend le capital, le client compte ses titres - la nominale n'a
 * plus à se taper, et une case de moins dans le bloc le plus long de l'application.
 *
 * Elle ne se déduit que si le compte tombe juste au centime : `10 000 / 3` ne fait pas
 * une nominale, il fait une division qu'il faut trancher soi-même. Dans ce cas la case
 * reparaît, et le contrôle dit pourquoi.
 */
export function nominaleDeduite(valeurs: Valeurs): number | null {
  const capital = nombre(valeurs.apporteeCapital);
  const titres = nombre(valeurs.apporteeNbTitres);
  if (capital <= 0 || titres <= 0) return null;

  const nominale = Math.round((capital / titres) * 100) / 100;
  return Math.abs(nominale * titres - capital) < 0.005 ? nominale : null;
}

export function verifierApport(valeurs: Valeurs): AnomalieDApport[] {
  const anomalies: AnomalieDApport[] = [];

  const exiger = (champ: string, message: string) => {
    if (!rempli(valeurs[champ])) anomalies.push({ champ, message });
  };

  exiger("apporteeDenomination", "Cherchez la société dont les titres sont apportés");
  exiger("apporteeSiren", "Le SIREN de la société dont les titres sont apportés est requis");
  /*
   * Le nom de l'apporteur, en trois champs depuis qu'ils tiennent sur une ligne.
   *
   * Un dossier ouvert avant porte encore `apporteurNomComplet` : le réclamer en trois
   * morceaux le renverrait vers des cases qui n'existaient pas quand il a été rempli.
   */
  if (!rempli(valeurs.apporteurNomComplet)) {
    exiger("apporteurCivilite", "La civilité de l'apporteur est requise");
    exiger("apporteurPrenom", "Le prénom de l'apporteur est requis");
    exiger("apporteurNom", "Le nom de l'apporteur est requis");
  }
  exiger("apporteurAdresse", "L'adresse de l'apporteur est requise");
  exiger("apporteurNeLe", "La date de naissance de l'apporteur est requise");
  exiger("apporteurNeA", "Le lieu de naissance de l'apporteur est requis");
  exiger("apportMethodeValorisation", "Dites comment les titres ont été valorisés");
  exiger("apportDateEffet", "La date d'effet de l'apport est requise");

  /*
   * Le compte de la société apportée doit tomber juste.
   *
   * Capital, titres et nominale se répondent : le traité les écrit tous les trois, et
   * un lecteur - un commissaire, un greffe - fait la multiplication. Trois nombres qui
   * ne s'accordent pas dans un acte enregistré valent une reprise du dossier.
   *
   * La nominale se déduit des deux autres quand elle tombe ronde, et l'écran ne la
   * demande plus alors. Le contrôle reste, pour les dossiers d'avant et pour les cas où
   * elle a été saisie à la main.
   */
  const capitalCible = nombre(valeurs.apporteeCapital);
  const titresCible = nombre(valeurs.apporteeNbTitres);
  const nominaleCible = nombre(valeurs.apporteeNominale);
  if (capitalCible > 0 && titresCible > 0 && nominaleCible > 0) {
    const produit = Math.round(titresCible * nominaleCible * 100) / 100;
    if (Math.abs(produit - capitalCible) >= 0.005) {
      anomalies.push({
        champ: "apporteeNominale",
        message:
          titresCible +
          " titres à " +
          nominaleCible +
          " euros font " +
          produit +
          " euros, non le capital de " +
          capitalCible +
          " euros déclaré",
      });
    }
  }

  const titresApportes = nombre(valeurs.apportNbTitres);
  const titresTotal = nombre(valeurs.apporteeNbTitres);
  const valeurApport = nombre(valeurs.apportValeur);
  const nominale = nombre(valeurs.apportNominaleBeneficiaire);

  if (titresApportes <= 0) {
    anomalies.push({ champ: "apportNbTitres", message: "Indiquez le nombre de titres apportés" });
  }
  if (titresTotal <= 0) {
    anomalies.push({
      champ: "apporteeNbTitres",
      message: "Indiquez le nombre total de titres de la société apportée",
    });
  }
  if (titresApportes > 0 && titresTotal > 0 && titresApportes > titresTotal) {
    anomalies.push({
      champ: "apportNbTitres",
      message:
        "On ne peut pas apporter " +
        titresApportes +
        " titres d'une société qui n'en compte que " +
        titresTotal,
    });
  }

  if (valeurApport <= 0) {
    anomalies.push({ champ: "apportValeur", message: "Indiquez la valeur retenue pour l'apport" });
  }

  if (nominale <= 0) {
    anomalies.push({
      champ: "apportNominaleBeneficiaire",
      message: "Indiquez la valeur nominale des titres émis par la société bénéficiaire",
    });
  } else if (valeurApport > 0 && !rempli(valeurs.apportActionsEmises)) {
    /*
     * L'apport doit se diviser en titres entiers, tant que rien ne dit combien en émettre.
     *
     * Une valeur de 15 000 € rémunérée par des titres de 40 € donnerait 375 titres et
     * tomberait juste ; la même par des titres de 700 € donne 21,43 titres. Le reliquat
     * appelle une prime d'apport - et c'est précisément ce que le champ « Nombre de
     * titres émis » permet de décider. Dès qu'il est rempli, le reste n'est plus un
     * reliquat mais une prime, que le traité chiffre : le contrôle n'a plus lieu d'être.
     */
    const titresEmis = (valeurApport * 100) / (nominale * 100);
    if (Math.abs(titresEmis - Math.round(titresEmis)) > 1e-9) {
      anomalies.push({
        champ: "apportNominaleBeneficiaire",
        message:
          "La valeur de l'apport ne se divise pas en titres entiers : " +
          valeurApport +
          " € pour une valeur nominale de " +
          nominale +
          " €. Ajustez l'une ou l'autre, ou indiquez le nombre de titres émis - l'écart deviendra une prime d'apport.",
      });
    }
  }

  return anomalies;
}
