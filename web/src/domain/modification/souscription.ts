import { natureDeLaForme } from "@/domain/formalite/formes";
import type { Valeurs } from "./types";

/**
 * Qui souscrit les titres nouveaux, et ce que le droit en tire.
 *
 * Une augmentation de capital en numéraire ne se joue pas de la même façon selon qui
 * met l'argent. Si les associés souscrivent à proportion de ce qu'ils détiennent,
 * personne n'est dilué et il n'y a rien à écarter. Dès qu'un tiers entre, ou qu'un
 * associé prend plus que sa part, il faut écarter le droit de préférence des autres -
 * et la façon de l'écarter décide du reste de la procédure.
 *
 * Le formulaire ne demandait rien de tout cela : le procès-verbal sortait sans un mot
 * sur une décision qui, dans ce cas, est obligatoire.
 */

/** Ce que le client répond à « qui souscrit ? ». */
export const SOUSCRIPTEURS = [
  "Les associés actuels, à proportion de leurs droits",
  "Un ou plusieurs associés, au-delà de leur part",
  "Une personne qui n'est pas encore associée",
] as const;

/** Les deux façons d'écarter le droit préférentiel, dans une société par actions. */
export const VOIES_DU_DROIT_PREFERENTIEL = [
  "Les associés y renoncent individuellement, au profit du souscripteur",
  "L'assemblée le supprime au profit de personnes dénommées",
] as const;

export type RegimeDuDroitPreferentiel =
  /* Société de personnes : le code n'organise aucun droit de préférence. */
  | "sans-objet"
  /* Chacun souscrit à proportion : le droit s'exerce, rien ne l'écarte. */
  | "exerce"
  /* Chaque associé renonce pour lui-même, au profit d'un bénéficiaire nommé. */
  | "renonciation"
  /* L'assemblée l'écarte pour tous, au profit de personnes dénommées. */
  | "suppression";

export interface Regime {
  regime: RegimeDuDroitPreferentiel;
  /** Le texte qui le fonde, pour l'acte. */
  article: string;
  /** Un rapport spécial du commissaire aux comptes est-il exigé ? */
  commissaireRequis: boolean;
  /** Le dirigeant doit-il présenter un rapport sur l'opération ? */
  rapportDuDirigeant: boolean;
  /** Ce qu'on en dit au client, à l'écran. */
  explication: string;
}

/**
 * Une société de personnes n'a pas de droit préférentiel de souscription.
 *
 * Le code ne l'organise que pour les sociétés par actions - « les actionnaires ont,
 * proportionnellement au montant de leurs actions, un droit de préférence à la
 * souscription des actions de numéraire ». En SARL, ce qui commande l'entrée d'un
 * tiers est l'agrément des associés, non un droit de préférence à écarter.
 */
export function parActions(forme: string | null | undefined): boolean {
  return natureDeLaForme(forme).titres === "actions";
}

export function regimeDuDroitPreferentiel(args: {
  forme: string | null | undefined;
  souscripteurs: string;
  voie: string;
}): Regime {
  const tousAProportion = args.souscripteurs === SOUSCRIPTEURS[0];

  if (!parActions(args.forme)) {
    return {
      regime: "sans-objet",
      article: "",
      commissaireRequis: false,
      /*
       * Pas de rapport là où il n'y a pas de droit à écarter.
       *
       * Ce qui doit figurer au procès-verbal d'une SARL, c'est l'agrément du nouvel
       * associé - une autre décision, qui a ses propres règles.
       */
      rapportDuDirigeant: false,
      explication: tousAProportion
        ? "Les associés souscrivent à proportion de leurs parts : la répartition ne change pas."
        : "Une société à responsabilité limitée n'a pas de droit préférentiel de souscription : c'est l'agrément des associés qui commande l'entrée d'un nouvel associé.",
    };
  }

  if (tousAProportion) {
    return {
      regime: "exerce",
      article: "L. 225-132 du code de commerce",
      commissaireRequis: false,
      rapportDuDirigeant: false,
      explication:
        "Chacun souscrit à proportion de ce qu'il détient : le droit préférentiel s'exerce, personne n'est dilué, et il n'y a rien à écarter.",
    };
  }

  if (args.voie === VOIES_DU_DROIT_PREFERENTIEL[1]) {
    return {
      regime: "suppression",
      article: "L. 225-135 et L. 225-138 du code de commerce",
      /*
       * Le rapport du commissaire est la contrepartie de la suppression.
       *
       * L'assemblée écarte le droit de tous, y compris de ceux qui ne votent pas avec
       * elle : un tiers indépendant se prononce alors sur le prix d'émission et sur
       * l'incidence de l'émission pour ceux qui restent. Une société qui n'a pas de
       * commissaire doit en désigner un pour cette seule opération.
       */
      commissaireRequis: true,
      rapportDuDirigeant: true,
      explication:
        "L'assemblée écarte le droit de tous les associés. Un rapport spécial du commissaire aux comptes est exigé : si la société n'en a pas, elle doit en désigner un pour cette seule opération.",
    };
  }

  return {
    regime: "renonciation",
    article: "L. 225-132 du code de commerce",
    /*
     * La renonciation individuelle n'appelle aucun commissaire.
     *
     * Le droit n'est pas supprimé : il est maintenu, et chacun décide pour lui-même de
     * ne pas s'en servir. Rien n'est imposé à personne, et aucun texte ne prévoit
     * l'intervention d'un commissaire. C'est la voie ordinaire des petites sociétés,
     * et l'ignorer envoie chercher un commissaire dont on n'a pas besoin.
     */
    commissaireRequis: false,
    rapportDuDirigeant: true,
    explication:
      "Chaque associé qui ne souscrit pas renonce pour lui-même, au profit du souscripteur. Le droit n'est pas supprimé mais maintenu : aucun commissaire aux comptes n'est requis.",
  };
}

/** Le régime d'un dossier, lu dans ses valeurs. */
export function regimeDeLAugmentation(
  forme: string | null | undefined,
  valeurs: Valeurs
): Regime {
  const lire = (cle: string) => String(valeurs[cle] ?? "").trim();
  return regimeDuDroitPreferentiel({
    forme,
    souscripteurs: lire("souscripteursAugm"),
    voie: lire("voieDuDroitPreferentiel"),
  });
}

/**
 * L'augmentation appelle-t-elle une souscription ?
 *
 * Une incorporation de réserves n'en appelle aucune - rien n'est versé, les titres se
 * distribuent aux associés existants. Un apport en nature se rémunère par des titres
 * attribués à l'apporteur, et le droit préférentiel n'y joue pas : il ne vise que les
 * actions de numéraire.
 */
export function augmentationSouscrite(mode: string | null | undefined): boolean {
  const dit = String(mode ?? "");
  return dit.startsWith("Apport en numéraire") || dit.startsWith("Compensation");
}
