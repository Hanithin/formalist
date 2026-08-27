import { natureDeLaForme, NATURES_PROPOSEES } from "@/domain/formalite/formes";

/**
 * L'approbation des comptes annuels : ce que la loi impose, et ce qui se calcule.
 *
 * Une formalité annuelle, répétitive, et pourtant celle où les modèles en
 * circulation se trompent le plus : ils dotent une réserve légale dans une société
 * civile qui n'en doit aucune, oublient d'imputer les pertes antérieures avant le
 * prélèvement, ou proposent une affectation qui ne tombe pas juste.
 *
 * Les montants sont en centimes, partout dans ce module. L'affectation doit
 * s'équilibrer au centime près, et une addition d'euros à décimales dérive : on
 * répartirait 10 000,00 € en postes dont la somme ferait 9 999,99 €, et l'écart
 * n'apparaîtrait qu'au dépôt. La conversion se fait aux bords.
 */

/* ------------------------------------------------------------- Les formes */

/**
 * Les formes que le parcours sait traiter.
 *
 * Il n'en connaissait que sept, écrites ici. Une société d'exercice libéral, une
 * commandite, une société civile de moyens n'y figuraient pas : elles déposent pourtant
 * leurs comptes comme les autres. La liste vient désormais des formes déclarées, une
 * fois, dans le domaine.
 */
export const FORMES_COMPTES = NATURES_PROPOSEES;

/** Une seule personne décide : il n'y a pas d'assemblée, mais une décision. */
export function estUnipersonnelle(forme: string | null | undefined): boolean {
  return natureDeLaForme(forme).unipersonnelle;
}

/**
 * Une société civile.
 *
 * Elle relève du code civil, non du code de commerce, et cela commande presque tout
 * ce qui suit : ni réserve légale, ni dépôt au greffe, ni confidentialité à demander
 * puisqu'il n'y a rien de publié.
 */
export function estCivile(forme: string | null | undefined): boolean {
  /*
   * Le test portait sur les deux premières lettres du sigle. Il rangeait donc parmi les
   * sociétés civiles la SCA et la SCS, qui sont des commandites commerciales : elles
   * auraient perdu leur réserve légale et leur dépôt au greffe sur la foi d'un préfixe.
   */
  const categorie = natureDeLaForme(forme).categorie;
  return categorie === "civile" || categorie === "civile-agricole";
}

/* ------------------------------------------------------------- Les délais */

export interface Delais {
  /** Mois dont on dispose après la clôture pour approuver, ou null si les statuts seuls le disent. */
  approbationMois: number | null;
  fondementApprobation: string;
  /** La société dépose-t-elle ses comptes au greffe ? */
  depotAuGreffe: boolean;
  fondementDepot: string;
}

/**
 * Les délais de l'exercice écoulé.
 *
 * Six mois pour approuver, puis un mois pour déposer - deux si le dépôt se fait en
 * ligne, ce qui est le cas ici. Une société civile ne dépose rien : aucun texte ne
 * l'y oblige, quel que soit son régime fiscal, et l'affirmation contraire revient
 * assez souvent pour mériter d'être écrite noir sur blanc.
 */
export function delaisDe(forme: string | null | undefined): Delais {
  if (estCivile(forme)) {
    return {
      approbationMois: null,
      fondementApprobation:
        "Le gérant rend compte de sa gestion au moins une fois par an (article 1856 du code civil). Le délai précis est celui que fixent vos statuts.",
      depotAuGreffe: false,
      fondementDepot:
        "Une société civile ne dépose pas ses comptes au greffe : aucun texte ne l'y oblige, quel que soit son régime fiscal. Ses comptes ne sont donc pas publics, et il n'y a pas de confidentialité à demander.",
    };
  }

  return {
    approbationMois: 6,
    fondementApprobation:
      "Les comptes s'approuvent dans les six mois de la clôture de l'exercice (article L. 223-26 du code de commerce pour la SARL, L. 225-100 pour la société anonyme, et les statuts pour la société par actions simplifiée).",
    depotAuGreffe: true,
    fondementDepot:
      "Les comptes se déposent au greffe dans le mois qui suit leur approbation, porté à deux mois pour un dépôt par voie électronique (articles L. 232-21 à L. 232-23 du code de commerce).",
  };
}

/** Le dernier jour pour approuver, ou null quand seuls les statuts le disent. */
export function dateLimiteApprobation(
  forme: string | null | undefined,
  clotureIso: string | null | undefined
): string | null {
  const mois = delaisDe(forme).approbationMois;
  if (mois === null || !clotureIso) return null;

  const cloture = new Date(clotureIso);
  if (Number.isNaN(cloture.getTime())) return null;

  /*
   * On avance de six mois en gardant le quantième, et l'on recule au dernier jour du
   * mois quand il n'existe pas : un exercice clos le 31 août se juge au 28 février,
   * non au 3 mars comme le donnerait une addition naïve.
   */
  const cible = new Date(
    Date.UTC(cloture.getUTCFullYear(), cloture.getUTCMonth() + mois, cloture.getUTCDate())
  );
  if (cible.getUTCMonth() !== (cloture.getUTCMonth() + mois) % 12) {
    cible.setUTCDate(0);
  }
  return cible.toISOString().slice(0, 10);
}

/**
 * La date limite de dépôt au greffe.
 *
 * Un mois après l'approbation, deux par voie électronique - et c'est par voie
 * électronique que nous déposons. On retient donc le délai d'un mois, qui est le plus
 * court : annoncer deux mois à un client qui déposerait au guichet le mettrait en
 * retard sans qu'il le sache.
 */
export function dateLimiteDepot(approbationIso: string | null | undefined): string | null {
  if (!approbationIso) return null;

  const approbation = new Date(approbationIso);
  if (Number.isNaN(approbation.getTime())) return null;

  const cible = new Date(
    Date.UTC(
      approbation.getUTCFullYear(),
      approbation.getUTCMonth() + 1,
      approbation.getUTCDate()
    )
  );
  if (cible.getUTCMonth() !== (approbation.getUTCMonth() + 1) % 12) cible.setUTCDate(0);
  return cible.toISOString().slice(0, 10);
}

/* -------------------------------------------------------- La réserve légale */

/** La part du bénéfice prélevée, et le plafond auquel le prélèvement s'arrête. */
export const RESERVE_TAUX = 0.05;
export const RESERVE_PLAFOND_DU_CAPITAL = 0.1;

export interface DotationLegale {
  /** La société en doit-elle une ? */
  applicable: boolean;
  /** Le montant à doter cette année, en centimes. */
  dotationCentimes: number;
  /** Ce qui manque encore pour atteindre le dixième du capital, avant dotation. */
  manquantCentimes: number;
  /** Le plafond lui-même : le dixième du capital. */
  plafondCentimes: number;
  /** La réserve une fois dotée. */
  apresDotationCentimes: number;
  explication: string;
}

/**
 * Ce que la loi oblige à mettre en réserve légale.
 *
 * « Il est fait sur le bénéfice de l'exercice, diminué le cas échéant des pertes
 * antérieures, un prélèvement d'un vingtième au moins » (article L. 232-10 du code de
 * commerce). Deux pièges s'y trouvent, et les modèles tombent dans les deux.
 *
 * Le premier est l'assiette : c'est le bénéfice diminué du report à nouveau débiteur,
 * non le bénéfice brut. Une société qui gagne 10 000 € après avoir perdu 4 000 €
 * l'an dernier prélève sur 6 000 €, non sur 10 000 €.
 *
 * Le second est le champ d'application : l'article vise « les sociétés à
 * responsabilité limitée et les sociétés par actions ». Une société civile n'y est
 * pas, même à l'impôt sur les sociétés - contrairement à ce qu'affirment beaucoup de
 * sites. Lui faire doter une réserve légale serait inventer une obligation.
 *
 * Le prélèvement s'arrête au dixième du capital, et redevient dû si le capital
 * augmente.
 */
export function dotationDeLaReserveLegale(args: {
  forme: string | null | undefined;
  /** Le résultat de l'exercice : positif s'il s'agit d'un bénéfice. */
  resultatCentimes: number;
  /** Le report à nouveau d'avant l'affectation : négatif s'il est débiteur. */
  reportAnterieurCentimes: number;
  capitalCentimes: number;
  reserveExistanteCentimes: number;
}): DotationLegale {
  const { resultatCentimes, reportAnterieurCentimes, capitalCentimes } = args;
  const reserveExistanteCentimes = Math.max(0, args.reserveExistanteCentimes);
  const plafondCentimes = Math.round(capitalCentimes * RESERVE_PLAFOND_DU_CAPITAL);
  const manquantCentimes = Math.max(0, plafondCentimes - reserveExistanteCentimes);

  if (estCivile(args.forme)) {
    return {
      applicable: false,
      dotationCentimes: 0,
      manquantCentimes: 0,
      plafondCentimes: 0,
      apresDotationCentimes: reserveExistanteCentimes,
      explication:
        "Une société civile ne dote pas de réserve légale : l'article L. 232-10 du code de commerce ne vise que les sociétés à responsabilité limitée et les sociétés par actions. Cela vaut aussi à l'impôt sur les sociétés.",
    };
  }

  if (resultatCentimes <= 0) {
    return {
      applicable: true,
      dotationCentimes: 0,
      manquantCentimes,
      plafondCentimes,
      apresDotationCentimes: reserveExistanteCentimes,
      explication:
        "L'exercice se solde par une perte : il n'y a pas de bénéfice sur lequel prélever. La dotation reprendra sur le premier exercice bénéficiaire.",
    };
  }

  if (manquantCentimes === 0) {
    return {
      applicable: true,
      dotationCentimes: 0,
      manquantCentimes: 0,
      plafondCentimes,
      apresDotationCentimes: reserveExistanteCentimes,
      explication:
        "La réserve légale atteint déjà le dixième du capital social : le prélèvement cesse d'être obligatoire. Il redeviendra dû si le capital augmente.",
    };
  }

  // L'assiette : le bénéfice, diminué des pertes antérieures reportées.
  const pertesAnterieures = Math.max(0, -reportAnterieurCentimes);
  const assiette = Math.max(0, resultatCentimes - pertesAnterieures);

  if (assiette === 0) {
    return {
      applicable: true,
      dotationCentimes: 0,
      manquantCentimes,
      plafondCentimes,
      apresDotationCentimes: reserveExistanteCentimes,
      explication:
        "Les pertes antérieures absorbent le bénéfice de l'exercice : l'assiette du prélèvement est nulle. La loi prélève sur le bénéfice diminué des pertes reportées, non sur le bénéfice brut.",
    };
  }

  const dotationCentimes = Math.min(Math.ceil(assiette * RESERVE_TAUX), manquantCentimes);

  return {
    applicable: true,
    dotationCentimes,
    manquantCentimes,
    plafondCentimes,
    apresDotationCentimes: reserveExistanteCentimes + dotationCentimes,
    explication:
      pertesAnterieures > 0
        ? "Un vingtième du bénéfice diminué des pertes antérieures reportées, plafonné à ce qui manque pour atteindre le dixième du capital."
        : "Un vingtième du bénéfice, plafonné à ce qui manque pour atteindre le dixième du capital.",
  };
}

/* ------------------------------------------------------- L'affectation */

export interface Affectation {
  reserveLegaleCentimes: number;
  autresReservesCentimes: number;
  dividendesCentimes: number;
  reportANouveauCentimes: number;
}

export interface VerdictAffectation {
  /** Ce qu'il y a à répartir : résultat de l'exercice et report antérieur. */
  aRepartirCentimes: number;
  /** Ce que l'affectation saisie répartit. */
  reparti: number;
  /** L'écart, nul quand l'affectation tombe juste. */
  ecartCentimes: number;
  equilibre: boolean;
  anomalies: string[];
}

/**
 * L'affectation tombe-t-elle juste, et respecte-t-elle la loi ?
 *
 * Le montant à répartir n'est pas le seul résultat de l'exercice : le report à
 * nouveau antérieur s'y ajoute, créditeur comme débiteur. Une société qui gagne
 * 10 000 € en traînant 4 000 € de pertes n'a que 6 000 € à répartir, et l'oublier
 * fait distribuer un dividende que la loi interdit.
 */
export function verifierAffectation(args: {
  forme: string | null | undefined;
  resultatCentimes: number;
  reportAnterieurCentimes: number;
  capitalCentimes: number;
  reserveExistanteCentimes: number;
  affectation: Affectation;
}): VerdictAffectation {
  const { affectation } = args;
  const aRepartirCentimes = args.resultatCentimes + args.reportAnterieurCentimes;
  const reparti =
    affectation.reserveLegaleCentimes +
    affectation.autresReservesCentimes +
    affectation.dividendesCentimes +
    affectation.reportANouveauCentimes;

  const anomalies: string[] = [];
  const ecartCentimes = aRepartirCentimes - reparti;

  if (ecartCentimes !== 0) {
    anomalies.push(
      "L'affectation ne tombe pas juste : il reste " +
        (ecartCentimes > 0 ? "" : "un excédent de ") +
        Math.abs(ecartCentimes / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2 }) +
        " € à répartir."
    );
  }

  const due = dotationDeLaReserveLegale(args);
  if (due.applicable && affectation.reserveLegaleCentimes < due.dotationCentimes) {
    anomalies.push(
      "La dotation à la réserve légale est inférieure au minimum légal. Une résolution qui l'ignore est nulle (article L. 232-10 du code de commerce)."
    );
  }

  if (affectation.reserveLegaleCentimes > 0 && !due.applicable) {
    anomalies.push(
      "Cette forme de société ne dote pas de réserve légale : le poste devrait être à zéro."
    );
  }

  /*
   * Le bénéfice distribuable, au sens de l'article L. 232-11.
   *
   * Un dividende ne peut sortir que du bénéfice de l'exercice diminué des pertes
   * antérieures et des dotations obligatoires, augmenté du report bénéficiaire. En
   * distribuer davantage, c'est un dividende fictif - une infraction, et une somme
   * que les associés doivent rendre.
   */
  const distribuable = Math.max(
    0,
    aRepartirCentimes - Math.max(due.dotationCentimes, affectation.reserveLegaleCentimes)
  );
  if (affectation.dividendesCentimes > distribuable) {
    anomalies.push(
      "Le dividende dépasse le bénéfice distribuable : la loi n'autorise à distribuer que le résultat diminué des pertes antérieures et de la dotation à la réserve légale (article L. 232-11 du code de commerce)."
    );
  }

  for (const [poste, valeur] of Object.entries(affectation)) {
    if (poste !== "reportANouveauCentimes" && valeur < 0) {
      anomalies.push("Un poste d'affectation ne peut pas être négatif.");
      break;
    }
  }

  return { aRepartirCentimes, reparti, ecartCentimes, equilibre: ecartCentimes === 0, anomalies };
}

/**
 * L'affectation que le parcours propose d'emblée.
 *
 * La plus courante et la plus sûre : on dote ce que la loi exige, on ne distribue
 * rien, et le reste va au report à nouveau. Distribuer se décide, cela ne se propose
 * pas par défaut - un dividende engage la trésorerie et déclenche l'imposition des
 * associés.
 */
export function affectationProposee(args: {
  forme: string | null | undefined;
  resultatCentimes: number;
  reportAnterieurCentimes: number;
  capitalCentimes: number;
  reserveExistanteCentimes: number;
}): Affectation {
  const due = dotationDeLaReserveLegale(args);
  const aRepartir = args.resultatCentimes + args.reportAnterieurCentimes;

  return {
    reserveLegaleCentimes: due.dotationCentimes,
    autresReservesCentimes: 0,
    dividendesCentimes: 0,
    reportANouveauCentimes: aRepartir - due.dotationCentimes,
  };
}
