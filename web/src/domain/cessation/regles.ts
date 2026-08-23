/**
 * Fermer une auto-entreprise, ou la mettre en pause.
 *
 * C'est la formalité la plus simple de la plateforme, et celle où l'on se trompe le
 * plus souvent - parce qu'elle est gratuite et qu'on la croit sans conséquence. Deux
 * erreurs reviennent :
 *
 *   - radier son SIRET pour une pause de six mois. La cessation définitive est
 *     irréversible : reprendre suppose une nouvelle immatriculation, un nouveau SIRET,
 *     et la perte de l'ancienneté acquise. La suspension existe pour cela, et presque
 *     personne ne la connaît ;
 *   - croire que déclarer la cessation solde tout. Il reste une dernière déclaration
 *     de chiffre d'affaires - même à zéro - une déclaration de TVA quand on y est
 *     assujetti, une case à remplir au printemps suivant, et une CFE due pour l'année
 *     entière dont le dégrèvement se demande.
 *
 * Ce module tient ces règles et calcule les dates. Rien n'y est facturé : la formalité
 * elle-même ne coûte rien au guichet unique.
 */

export type Nature = "definitive" | "temporaire";

/** Comment l'auto-entrepreneur déclare son chiffre d'affaires à l'URSSAF. */
export type Periodicite = "mensuelle" | "trimestrielle";

export interface Situation {
  nature: Nature;
  /** La date d'arrêt effectif de l'activité, en ISO. */
  dateCessation: string | null;
  periodicite: Periodicite;
  /** L'activité est-elle commerciale ? Elle seule peut suspendre deux ans. */
  commerciale: boolean;
  /** Redevable de la TVA : la franchise en base a été dépassée. */
  assujettiTva: boolean;
  /** Agent commercial : il faut aussi sortir du registre spécial. */
  agentCommercial: boolean;
}

/* ------------------------------------------------------------- Les délais */

/** La formalité se déclare dans les trente jours de l'arrêt. */
export const JOURS_POUR_DECLARER = 30;

/**
 * La suspension ne dure pas indéfiniment.
 *
 * Un an, deux pour une activité commerciale. Au terme, il faut reprendre ou fermer :
 * une entreprise laissée en sommeil au-delà est radiée d'office.
 */
export function dureeMaximaleDeSuspension(commerciale: boolean): number {
  return commerciale ? 2 : 1;
}

function versDate(iso: string | null | undefined): Date | null {
  const brut = (iso ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(brut)) return null;
  const date = new Date(brut + "T00:00:00Z");
  return Number.isNaN(date.getTime()) ? null : date;
}

function enIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function apres(depart: Date, jours: number): Date {
  const suite = new Date(depart);
  suite.setUTCDate(suite.getUTCDate() + jours);
  return suite;
}

/**
 * Le mois suivant, en gardant le quantième.
 *
 * Un 31 janvier plus un mois tombe au 28 février, non au 3 mars : on recule au dernier
 * jour du mois quand le quantième n'existe pas.
 */
function moisApres(depart: Date, mois: number): Date {
  const cible = new Date(
    Date.UTC(depart.getUTCFullYear(), depart.getUTCMonth() + mois, depart.getUTCDate())
  );
  if (cible.getUTCMonth() !== (depart.getUTCMonth() + mois) % 12) cible.setUTCDate(0);
  return cible;
}

/** Le dernier jour du trimestre civil qui contient cette date. */
function finDuTrimestre(date: Date): Date {
  const trimestre = Math.floor(date.getUTCMonth() / 3);
  return new Date(Date.UTC(date.getUTCFullYear(), trimestre * 3 + 3, 0));
}

/* ---------------------------------------------------------- Les échéances */

export interface Echeance {
  cle: string;
  /**
   * Qui s'en charge.
   *
   * La déclaration au guichet est la nôtre : la lister parmi « ce qu'il vous reste à
   * faire » sur la feuille que le client emporte lui donnerait une tâche déjà réglée,
   * et ferait douter du reste.
   */
  pourNous?: boolean;
  intitule: string;
  /** Ce qu'il faut faire, et où. */
  explication: string;
  /** La date limite en ISO, ou null quand elle ne se calcule pas. */
  limite: string | null;
  /** Quand la date ne se calcule pas, ce qu'on peut en dire. */
  quand?: string;
  fondement: string;
}

/**
 * Tout ce qui reste à faire après la déclaration, avec ses dates.
 *
 * C'est la valeur de ce parcours : la formalité est gratuite et se fait en dix minutes,
 * mais personne ne dit à l'auto-entrepreneur qu'il lui reste quatre échéances, dont
 * deux qui se comptent en jours.
 */
export function echeancesDe(situation: Situation): Echeance[] {
  const cessation = versDate(situation.dateCessation);
  const echeances: Echeance[] = [];

  echeances.push({
    cle: "declaration",
    pourNous: true,
    intitule: "Déclarer la cessation au guichet unique",
    explication:
      situation.nature === "temporaire"
        ? "La suspension se déclare au guichet des formalités des entreprises, qui prévient l'URSSAF, l'INSEE et le registre."
        : "La cessation se déclare au guichet des formalités des entreprises. La démarche est gratuite : elle entraîne la radiation des registres et la fermeture du SIRET.",
    limite: cessation ? enIso(apres(cessation, JOURS_POUR_DECLARER)) : null,
    fondement: "Article R. 123-51 du code de commerce",
  });

  /*
   * La dernière déclaration de chiffre d'affaires, même à zéro.
   *
   * C'est l'oubli le plus fréquent : on croit que fermer dispense de déclarer. L'URSSAF
   * attend une dernière déclaration, et son absence entretient un compte ouvert avec
   * des mises en demeure à la clé.
   */
  const limiteCa = !cessation
    ? null
    : situation.periodicite === "mensuelle"
      ? enIso(apres(cessation, 30))
      : enIso(moisApres(finDuTrimestre(cessation), 1));

  echeances.push({
    cle: "chiffre-affaires",
    intitule: "Dernière déclaration de chiffre d'affaires",
    explication:
      situation.periodicite === "mensuelle"
        ? "Sur autoentrepreneur.urssaf.fr, dans les trente jours de la fermeture. Elle est due même si le chiffre d'affaires est nul : on déclare alors « néant »."
        : "Sur autoentrepreneur.urssaf.fr, dans le mois qui suit le trimestre civil de la fermeture. Elle est due même si le chiffre d'affaires est nul.",
    limite: limiteCa,
    fondement: "Article R. 613-4 du code de la sécurité sociale",
  });

  if (situation.assujettiTva) {
    echeances.push({
      cle: "tva",
      intitule: "Déclaration de TVA de cessation",
      explication:
        "Formulaire 3517-S-SD, par voie dématérialisée, dans les soixante jours. Elle ne concerne que ceux qui ont dépassé la franchise en base.",
      limite: cessation ? enIso(apres(cessation, 60)) : null,
      fondement: "Article 287, 4 du code général des impôts",
    });
  }

  if (situation.agentCommercial) {
    echeances.push({
      cle: "rsac",
      intitule: "Radiation du registre des agents commerciaux",
      explication:
        "Elle se demande au guichet unique, séparément de la cessation. Deux mois pour le faire.",
      limite: cessation ? enIso(moisApres(cessation, 2)) : null,
      fondement: "Article R. 134-6 du code de commerce",
    });
  }

  echeances.push({
    cle: "revenus",
    intitule: "Déclaration de revenus",
    explication:
      "Le chiffre d'affaires réalisé du 1er janvier à la date de cessation se reporte sur le formulaire 2042-C-PRO, avec la déclaration de revenus.",
    limite: null,
    quand: "au printemps suivant, avec votre déclaration de revenus",
    fondement: "Article 50-0 du code général des impôts",
  });

  /*
   * La CFE reste due pour l'année entière.
   *
   * Le dégrèvement au prorata n'est pas automatique : il se demande, et seulement une
   * fois l'avis reçu - donc en fin d'année, quand plus personne n'y pense.
   */
  echeances.push({
    cle: "cfe",
    intitule: "Dégrèvement de cotisation foncière des entreprises",
    explication:
      "La CFE reste due pour l'année entière. Un dégrèvement au prorata des mois sans activité se demande au service des impôts des entreprises, après réception de l'avis d'imposition.",
    limite: null,
    quand: "à réception de l'avis d'imposition, en décembre",
    fondement: "Article 1478 du code général des impôts",
  });

  return echeances;
}

/* --------------------------------------------------- Ce qu'il faut savoir */

export const CESSATION_EST_DEFINITIVE =
  "Une cessation définitive ne se défait pas. Le SIRET est fermé, l'immatriculation radiée, et reprendre suppose une nouvelle inscription : nouveau numéro, ancienneté perdue, et la franchise en base repart de zéro. Si l'arrêt n'est peut-être pas définitif, la suspension existe pour cela.";

export function suspensionExpliquee(commerciale: boolean): string {
  const duree = dureeMaximaleDeSuspension(commerciale);
  return (
    "La suspension met l'activité en sommeil sans fermer le SIRET : " +
    (duree > 1 ? "deux ans au plus pour une activité commerciale" : "un an au plus") +
    ". Vous restez inscrit, vous continuez à déclarer votre chiffre d'affaires - à zéro - et vous reprenez quand vous voulez, ou vous fermez au terme."
  );
}

export const RADIATION_D_OFFICE =
  "Attention pendant la suspension : deux années civiles consécutives de chiffre d'affaires nul, ou huit trimestres, entraînent une radiation d'office. Elle se conteste dans le mois en justifiant de la poursuite de l'activité.";

export const FORMALITE_GRATUITE =
  "La déclaration elle-même ne coûte rien : ni annonce légale, ni frais de greffe. Vous ne payez que notre intervention.";
