import {
  estUnipersonnelle,
  natureDeLaForme,
  regle,
  verifierAssocies,
  verifierCapital,
  verifierRepartition,
  type Anomalie,
} from "./formes";
import { conjointRequis, nomDeLaPartie, type PersonneMorale, type PersonnePhysique } from "./etat-civil";
import { elider } from "./lettres";
import { valeursParDefaut } from "./valeurs-par-defaut";
import { apportsDe, valeurNominale } from "./capital";

/**
 * Le parcours de création, étape par étape.
 *
 * Le formulaire d'origine gardait son brouillon dans le navigateur
 * (localStorage). Trois conséquences : le travail se perd en changeant d'appareil,
 * il disparaît avec l'historique de navigation, et le nom des pièces déposées
 * n'existait nulle part côté serveur - c'est précisément ce qui rendait impossible
 * de savoir à qui appartenait un fichier, et qui a laissé /api/file ouvert.
 *
 * Le brouillon vit désormais dans le dossier. Ce module décrit les étapes et dit,
 * pour un brouillon donné, ce qui manque encore.
 *
 * Les sept étapes sont celles du parcours d'origine (public/creation.html), dans
 * son ordre : société, associés, dirigeants, capital, documents, offres, puis les
 * actes produits.
 */

export interface Etape {
  numero: number;
  identifiant: string;
  titre: string;
  description: string;
  /** Le mot du fil d'étapes, court : « Société », « Capital ». */
  libelleCourt: string;
}

export const ETAPES: Etape[] = [
  {
    numero: 1,
    identifiant: "societe",
    titre: "Informations de la société",
    description: "Renseignez les informations générales de votre future société.",
    libelleCourt: "Société",
  },
  {
    numero: 2,
    identifiant: "associes",
    titre: "Associés",
    description: "Ajoutez les associés de votre société. Minimum 2 pour une SAS, SARL ou SCI.",
    libelleCourt: "Associés",
  },
  {
    numero: 3,
    identifiant: "dirigeants",
    titre: "Dirigeants",
    description: "Désignez le ou les dirigeants de la société.",
    libelleCourt: "Dirigeants",
  },
  {
    numero: 4,
    identifiant: "capital",
    titre: "Répartition du capital",
    description:
      // L'ordre des gestes, et non le seul but : l'étape posait deux graphiques avant
      // les champs qui les alimentent, et rien ne disait par où commencer.
      "Indiquez le nombre de titres émis et le capital, puis répartissez-les entre les associés.",
    libelleCourt: "Capital",
  },
  {
    numero: 5,
    identifiant: "documents",
    titre: "Pièces justificatives",
    description:
      "Téléversez les documents nécessaires à la constitution de votre dossier. Formats acceptés : PDF, JPG, PNG (max 10 Mo).",
    libelleCourt: "Documents",
  },
  {
    numero: 6,
    identifiant: "offres",
    titre: "Choisissez votre offre",
    description: "Sélectionnez l'offre qui correspond à vos besoins.",
    libelleCourt: "Offres",
  },
  {
    numero: 7,
    identifiant: "actes",
    titre: "Mes documents",
    description: "Les actes produits, à relire et à signer.",
    libelleCourt: "Mes documents",
  },
];

/**
 * Le mot qui désigne les porteurs de parts, et les libellés de l'étape 2.
 *
 * Une société par actions a des actionnaires, les autres des associés : le mot
 * change le libellé de l'étape, son titre et sa description. C'est ce que faisait
 * updateAssocieLabel() dans associes.js, et le fil d'étapes d'origine portait pour
 * cela un identifiant sur ce seul libellé.
 */
export function motAssocie(forme: string | null | undefined): "Actionnaire" | "Associé" {
  /*
   * Cet ensemble listait sept formes et oubliait la SELAFA, la SELCA et les holdings de
   * profession libérale, qui ont pourtant des actionnaires. La nature de la forme est
   * déclarée une fois, dans formes.ts.
   */
  return natureDeLaForme(forme).titres === "actions" ? "Actionnaire" : "Associé";
}

/**
 * Le mot qui désigne une fraction du capital.
 *
 * Une société par actions émet des actions, les autres des parts sociales. Le mot
 * figure dans les statuts et dans la liste des souscripteurs : il ne s'invente pas.
 */
export function motPart(forme: string | null | undefined, pluriel = false): string {
  const mot = natureDeLaForme(forme).titres === "actions" ? "action" : "part";
  return pluriel ? mot + "s" : mot;
}

export function libellesDesAssocies(
  forme: string | null | undefined,
  nombre: number
): { libelleCourt: string; titre: string; description: string } {
  const mot = motAssocie(forme);
  const unique = estUnipersonnelle(forme, nombre);
  // Au singulier tant qu'il n'y en a qu'un : « Associé » puis « Associés ».
  const pluriel = mot + (unique || nombre < 2 ? "" : "s");

  return {
    libelleCourt: pluriel,
    titre: pluriel,
    description: unique
      ? "Renseignez l'" + mot.toLowerCase() + " unique de votre société."
      : "Ajoutez les " +
        mot.toLowerCase() +
        "s de votre société. Minimum 2 pour une SAS, SARL ou SCI.",
  };
}

/* ---------- Les listes de choix de l'étape 1 ---------- */

export const MODES_DOMICILIATION = [
  "Bail commercial ou professionnel",
  "Société de domiciliation",
  "Domicile personnel du dirigeant",
] as const;
export type ModeDomiciliation = (typeof MODES_DOMICILIATION)[number];

/** À quel titre le dirigeant occupe le logement qu'il met à disposition. */
export const OCCUPATIONS_DOMICILE = ["propriétaire", "locataire", "hébergé"] as const;
export type OccupationDomicile = (typeof OCCUPATIONS_DOMICILE)[number];

/** Les banques proposées, « Autre » ouvrant la saisie libre. */
export const BANQUES = ["Qonto", "Shine", "Revolut Business", "Autre"] as const;
export type Banque = (typeof BANQUES)[number];

export const OPTIONS_FISCALES = ["IS", "IR"] as const;
export type OptionFiscale = (typeof OPTIONS_FISCALES)[number];

export const REGIMES_TVA = [
  "Je ne sais pas",
  "Franchise en base de TVA",
  "Régime réel simplifié",
  "Régime réel normal",
] as const;
export type RegimeTva = (typeof REGIMES_TVA)[number];

export const REMUNERATIONS = ["Déterminée ultérieurement", "Fixe", "Variable"] as const;
export type Remuneration = (typeof REMUNERATIONS)[number];

export const REGIMES_SOCIAUX = ["Assimilé salarié", "Travailleur non salarié"] as const;
export type RegimeSocial = (typeof REGIMES_SOCIAUX)[number];

/* ---------- Les parties au dossier ---------- */

/**
 * Un associé : une personne physique ou une société.
 *
 * Les montants de l'étape « Capital » vivent sur l'associé et non dans une table
 * à part : c'est ce qui garantit qu'une part ne survit pas à l'associé qu'on
 * retire, ce qui arrivait dans le formulaire d'origine.
 */
export interface Associe {
  type?: "physique" | "morale";
  personne?: PersonnePhysique;
  societe?: PersonneMorale;

  /** MONTANT_SOUSCRIT_ : ce que l'associé s'engage à apporter, en euros. */
  apport?: number;
  /** MONTANT_VERSE_ : ce qu'il a effectivement versé. */
  versement?: number;
  /** NB_PARTS_ */
  parts?: number;
  /** DESC_APPORT_NATURE_ et APPORTS_NATURE_ */
  apportEnNature?: { description?: string; montant?: number };
}

export interface Dirigeant {
  /**
   * L'associé repris, par son rang dans la liste. Absent : une autre personne,
   * dont l'état civil est saisi ici. C'est le select « Sélectionner… / Autre
   * personne » du formulaire d'origine.
   */
  associe?: number;
  personne?: PersonnePhysique;
  /** REMUNERATION_DG_ */
  remuneration?: Remuneration;
  /** REGIME_SOCIAL_DG_ */
  regimeSocial?: RegimeSocial;
}

/** Le brouillon, tel qu'il est stocké dans le dossier. */
export interface Brouillon {
  /* Étape 1 - la société */
  forme?: string;
  denomination?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
  modeDomiciliation?: ModeDomiciliation;
  /**
   * Le domiciliataire, quand le siège est chez une société de domiciliation.
   *
   * Le greffe ne se contente pas de l'adresse. Le domicilié « déclare le contrat de
   * domiciliation au registre du commerce et des sociétés, avec l'indication du nom ou
   * de la dénomination sociale et des références de l'immatriculation principale » du
   * domiciliataire (obligations du domicilié, greffe du tribunal des activités
   * économiques de Paris ; articles L.123-10 et R.123-166-1 du code de commerce). Et le
   * domiciliataire « est titulaire d'un agrément dont les références sont mentionnées
   * dans tous les contrats de domiciliation qu'il conclut » : sans ce numéro,
   * l'attestation est refusée.
   */
  domiciliataire?: { denomination?: string; siren?: string; agrement?: string };
  /**
   * Le domicile personnel du dirigeant : à quel titre il l'occupe, et si quelque chose
   * s'oppose à la domiciliation.
   *
   * L'attestation écrivait « propriétaire » pour tout le monde, locataires compris, et
   * annonçait une domiciliation bornée à cinq ans tout en certifiant que rien ne s'y
   * opposait - deux affirmations qui se contredisent. L'article L. 123-11-1 du code de
   * commerce ne borne à cinq ans que le cas où un bail ou un règlement de copropriété
   * l'interdit ; ailleurs, la domiciliation est libre et sans terme.
   */
  occupationDomicile?: OccupationDomicile;
  /** Un bail ou un règlement de copropriété s'y oppose-t-il ? */
  domiciliationRestreinte?: boolean;
  capital?: number;
  /** Nom de la banque du dépôt. La clé de gabarit reste NOM_BANQUE. */
  banque?: Banque;
  banqueAutre?: { nom?: string; adresse?: string; ville?: string; codePostal?: string };
  dateDebutActivite?: string;
  dateCloturePremierExercice?: string;
  /** En années. 99 par défaut dans les statuts. */
  dureeDeVie?: number;
  optionFiscale?: OptionFiscale;
  regimeTva?: RegimeTva;
  /** OBJET_SOCIAL_ : le texte retenu, généré ou écrit à la main. */
  activite?: string;
  /** La description saisie pour la génération, gardée pour pouvoir la reprendre. */
  descriptionActivite?: string;
  associes?: Associe[];

  /* Étape 2 */
  dirigeants?: Dirigeant[];

  /* Étape 3 */
  /** Le total des parts émises, réparties entre les associés. */
  partsTotales?: number;
  capitalLibere?: number;

  /* Étape 4 */
  /** Paraphes portés sur les actes. */
  paraphes?: string;

  /* Étape 5 */
  offre?: string;

  /*
   * Le règlement, écrit par le serveur seul.
   *
   * Le schéma de l'API n'accepte pas ces deux clés : elles ne se saisissent pas, elles
   * se constatent. Un brouillon qui pourrait s'annoncer payé depuis le navigateur
   * ferait partir un dossier chez l'avocat sans encaissement.
   */
  /** La session Stripe ouverte pour ce dossier. */
  paiementRef?: string;
  /** Posé à la confirmation de l'encaissement, jamais avant. */
  paye?: boolean;
  /**
   * Le cabinet a fait paraître l'annonce légale.
   *
   * Une déclaration, non un dépôt : c'est lui qui porte l'avis au journal habilité, et
   * le client n'a pas d'attestation de parution à fournir. Le suivi la lit par
   * `avisDeclares`, quel que soit le parcours.
   */
  avisPublies?: boolean;

  /* Étape 6 */
  noteAvocat?: string;
}

const CODE_POSTAL = /^\d{5}$/;

/** Le nom d'un associé pour un message d'anomalie : son nom, ou son rang. */
function designer(associe: Associe, rang: number): string {
  return nomDeLaPartie(associe) || "l'associé " + (rang + 1);
}

/** Ce qui manque à l'étape 1 : la société elle-même. */
function verifierSociete(brouillon: Brouillon): Anomalie[] {
  const anomalies: Anomalie[] = [];

  if (!regle(brouillon.forme)) {
    anomalies.push({ champ: "forme", message: "Choisissez une forme juridique" });
  }
  if (!brouillon.denomination?.trim()) {
    anomalies.push({ champ: "denomination", message: "Indiquez le nom de la société" });
  }
  if (!brouillon.activite?.trim()) {
    anomalies.push({ champ: "activite", message: "Décrivez l'activité" });
  }
  if (!brouillon.adresse?.trim()) {
    anomalies.push({ champ: "adresse", message: "Indiquez l'adresse du siège" });
  }
  if (!CODE_POSTAL.test(brouillon.codePostal ?? "")) {
    anomalies.push({ champ: "codePostal", message: "Le code postal comporte cinq chiffres" });
  }
  if (!brouillon.ville?.trim()) {
    anomalies.push({ champ: "ville", message: "Indiquez la ville" });
  }

  /*
   * La banque décide du texte d'un article des statuts, pas seulement d'une mention.
   *
   * L'article des apports est écrit en quatre versions, une par dépositaire. Sans banque
   * choisie, les quatre conditions sont fausses et l'article sort entièrement vide - pas
   * un tiret ni un blanc à compléter, mais un article de statuts sans une ligne, déposé
   * au greffe. La liste des souscripteurs, elle, annonçait « déposé auprès de - ».
   *
   * Rien ne l'exigeait : seul le nom libre l'était, et seulement si l'on avait choisi
   * « Autre ».
   */
  if (!brouillon.banque) {
    anomalies.push({ champ: "banque", message: "Choisissez la banque qui recevra le capital" });
  }

  // « Autre » ouvre la saisie : sans nom, l'attestation de dépôt reste en blanc.
  if (brouillon.banque === "Autre" && !brouillon.banqueAutre?.nom?.trim()) {
    anomalies.push({ champ: "banqueAutre.nom", message: "Indiquez le nom de la banque" });
  }

  anomalies.push(...verifierDomiciliation(brouillon));

  return anomalies;
}

const SIREN = /^\d{9}$/;

/**
 * Ce que le greffe exige d'un siège chez une société de domiciliation.
 *
 * Trois informations, et elles ne sont pas de confort : la dénomination et les
 * références d'immatriculation du domiciliataire sont déclarées au registre par le
 * domicilié lui-même, et le numéro d'agrément préfectoral doit figurer au contrat -
 * une attestation qui ne le porte pas est refusée. Les demander au moment où le mode
 * est choisi évite de les découvrir au dépôt du dossier.
 */
function verifierDomiciliation(brouillon: Brouillon): Anomalie[] {
  if (brouillon.modeDomiciliation !== "Société de domiciliation") return [];

  const anomalies: Anomalie[] = [];
  const chez = brouillon.domiciliataire ?? {};

  if (!chez.denomination?.trim()) {
    anomalies.push({
      champ: "domiciliataire.denomination",
      message: "Indiquez le nom de la société de domiciliation",
    });
  }

  const siren = (chez.siren ?? "").replace(/\s/g, "");
  if (!SIREN.test(siren)) {
    anomalies.push({
      champ: "domiciliataire.siren",
      message: "Le SIREN de la société de domiciliation comporte neuf chiffres",
    });
  }

  if (!chez.agrement?.trim()) {
    anomalies.push({
      champ: "domiciliataire.agrement",
      message: "Indiquez le numéro d'agrément préfectoral, qui figure sur votre contrat",
    });
  }

  return anomalies;
}

/** Ce qui manque à l'étape 2 : les porteurs de parts. */
function verifierLesAssocies(brouillon: Brouillon): Anomalie[] {
  const anomalies: Anomalie[] = [];
  const associes = brouillon.associes ?? [];
  const mot = motAssocie(brouillon.forme).toLowerCase();

  // Sans associé, l'étape n'est pas faite - même si la forme n'est pas encore
  // choisie. Se reposer sur les règles de forme rendait l'étape vide « complète ».
  if (associes.length === 0) {
    anomalies.push({ champ: "associes", message: "Ajoutez au moins un " + mot });
    return anomalies;
  }

  if (brouillon.forme) anomalies.push(...verifierAssocies(brouillon.forme, associes.length));

  associes.forEach((a, i) => {
    if (a.type === "morale") {
      if (!a.societe?.denomination?.trim()) {
        anomalies.push({
          champ: "associes." + i,
          message: "Indiquez la dénomination de l'" + mot + " " + (i + 1),
        });
      }
      return;
    }

    const personne = a.personne ?? {};
    if (!personne.prenom?.trim() || !personne.nom?.trim()) {
      anomalies.push({
        champ: "associes." + i,
        message: "Renseignez le prénom et le nom de l'" + mot + " " + (i + 1),
      });
    }
    if (!personne.dateDeNaissance) {
      anomalies.push({
        champ: "associes." + i + ".dateDeNaissance",
        message: "Indiquez la date de naissance de " + designer(a, i),
      });
    }
    // Le conjoint n'est exigé que quand la situation l'implique : les statuts
    // mentionnent son consentement pour un apport de bien commun.
    if (conjointRequis(personne.situationMatrimoniale) && !personne.conjoint?.nom?.trim()) {
      anomalies.push({
        champ: "associes." + i + ".conjoint",
        message: "Renseignez le conjoint de " + designer(a, i),
      });
    }
  });

  return anomalies;
}

/** Ce qui manque à une étape donnée. Une liste vide vaut « étape complète ». */
export function verifierEtape(numero: number, brouillon: Brouillon): Anomalie[] {
  const anomalies: Anomalie[] = [];

  if (numero === 1) return verifierSociete(brouillon);
  if (numero === 2) return verifierLesAssocies(brouillon);

  if (numero === 3) {
    const dirigeants = brouillon.dirigeants ?? [];
    const associes = brouillon.associes ?? [];

    if (dirigeants.length === 0) {
      const titre = regle(brouillon.forme)?.titreDirigeant ?? "dirigeant";
      anomalies.push({ champ: "dirigeants", message: "Désignez le " + titre.toLowerCase() });
      return anomalies;
    }

    dirigeants.forEach((d, i) => {
      // Un dirigeant repris d'un associé n'a pas d'état civil propre : il suffit
      // que le rang désigne encore quelqu'un.
      if (d.associe !== undefined) {
        if (!associes[d.associe]) {
          anomalies.push({
            champ: "dirigeants." + i,
            message: "L'associé choisi pour le dirigeant " + (i + 1) + " n'existe plus",
          });
        }
        return;
      }

      const personne = d.personne ?? {};
      if (!personne.prenom?.trim() || !personne.nom?.trim()) {
        anomalies.push({
          champ: "dirigeants." + i,
          message: "Renseignez le prénom et le nom du dirigeant " + (i + 1),
        });
      }
    });
    return anomalies;
  }

  if (numero === 4) {
    const capital = brouillon.capital ?? 0;

    if (capital <= 0) {
      anomalies.push({ champ: "capital", message: "Indiquez le montant du capital" });
      return anomalies;
    }

    const associes = brouillon.associes ?? [];
    const nominale = valeurNominale(brouillon);
    const apports = associes.map((a) => apportsDe(a, nominale));

    /*
     * Ce qui est libéré se compte sur les associés, non dans un champ à part.
     *
     * `capitalLibere` n'est écrit par aucun écran : il valait donc zéro sur tous les
     * dossiers, et toute forme qui exige une libération minimale - la moitié pour une
     * SAS, le cinquième pour une SARL - restait bloquée à cette étape par « exige de
     * libérer au moins 50 % du capital », sur un dossier où la carte annonçait
     * pourtant « Versé 2 000 €, reste à libérer 0 € ».
     *
     * C'est la même règle que pour le souscrit, deux lignes plus bas : l'écran saisit
     * des parts et des pourcentages de libération, jamais un total en euros. Le total
     * se déduit, et il ne peut pas diverger de ce qu'on lit sur les cartes.
     */
    const libere = apports.reduce((somme, a) => somme + a.verse, 0);

    /*
     * La répartition d'abord, le reste ensuite.
     *
     * Sur un capital de 30 000 euros dont aucune part n'est encore attribuée, l'étape
     * levait trois anomalies pour une seule cause : « exige de libérer au moins 20 % »,
     * « il reste 30 000 euros à répartir », et le décompte des parts. L'écran annonçait
     * « il reste 3 points à régler », dont le premier - le plus alarmant - était le
     * moins actionnable : le montant libéré se déduit des versements des associés, qui
     * n'existent pas tant qu'ils n'ont pas de parts.
     *
     * Le nombre de titres et leur attribution gouvernent donc tout le reste : tant
     * qu'ils ne tombent pas juste, on ne dit qu'eux.
     */
    const total = brouillon.partsTotales ?? 0;
    const distribuees = associes.reduce((somme, a) => somme + (a.parts ?? 0), 0);
    const partsJustes = total > 0 && distribuees === total;

    if (total <= 0) {
      anomalies.push({
        champ: "partsTotales",
        message: "Indiquez le nombre total " + elider(motPart(brouillon.forme, true)),
      });
    } else if (!partsJustes) {
      anomalies.push({
        champ: "partsTotales",
        message:
          "Les parts réparties (" + distribuees + ") ne font pas le total annoncé (" + total + ")",
      });
    }

    /*
     * Le capital minimum d'une forme ne dépend pas des parts : il se dit tout de suite.
     * La libération minimale, elle, se compte sur des versements qui n'existent pas
     * encore - elle attend que les parts tombent juste.
     */
    if (brouillon.forme) {
      const surLeCapital = verifierCapital(brouillon.forme, capital, libere);
      anomalies.push(...surLeCapital.filter((a) => partsJustes || a.champ !== "libere"));
    }

    // Le montant souscrit se déduit des parts, comme dans les actes : l'écran
    // saisit des parts, pas des euros. Lire `apport` ici rendait l'étape
    // impossible à franchir dès qu'on répartissait en parts.
    const souscrits = apports.map((a) => a.souscrit);
    if (partsJustes && souscrits.length) {
      anomalies.push(...verifierRepartition(capital, souscrits));
    }

    /*
     * Une valeur nominale sous le centime ne s'écrit dans aucun acte.
     *
     * Trois mille milliards d'actions pour deux mille euros passaient l'étape : chacune
     * valait six dix-milliardièmes d'euro, un nombre que ni les statuts, ni la liste
     * des souscripteurs, ni l'attestation de dépôt ne peuvent porter. L'écran affichait
     * « à 0 € l'une », et le dossier partait ainsi chez l'avocat.
     */
    if (nominale > 0 && nominale < 0.01) {
      anomalies.push({
        champ: "partsTotales",
        message:
          "Une " +
          motPart(brouillon.forme) +
          " vaudrait moins d'un centime : réduisez leur nombre, ou augmentez le capital",
      });
    }

    associes.forEach((a, i) => {
      const souscrit = apportsDe(a, nominale).souscrit;
      const verse = a.versement ?? 0;
      if (verse > souscrit) {
        anomalies.push({
          champ: "associes." + i + ".versement",
          message: "Le versement de " + designer(a, i) + " dépasse ce qu'il a souscrit",
        });
      }
    });
    return anomalies;
  }

  if (numero === 6 && !brouillon.offre) {
    anomalies.push({ champ: "offre", message: "Choisissez une offre" });
  }

  // Étape 5 : les pièces sont vérifiées à leur dépôt, pas ici. Elle ne bloque
  // donc jamais le parcours, et compte comme faite dès le départ.
  // Étape 7 : les actes sont produits par le dossier, il n'y a rien à saisir.
  return anomalies;
}

/**
 * Les associés qu'un dirigeant peut reprendre.
 *
 * Ceux déjà désignés par un autre dirigeant sont écartés : la même personne ne
 * peut pas être à la fois présidente et directrice générale. Celui du dirigeant
 * courant reste dans la liste, sans quoi son propre choix disparaîtrait du menu.
 */
export function associesProposables(
  associes: Associe[],
  dirigeants: Dirigeant[],
  rangDuDirigeant: number
): { rang: number; nom: string }[] {
  const pris = new Set(
    dirigeants
      .filter((d, i) => i !== rangDuDirigeant && d.associe !== undefined)
      .map((d) => d.associe as number)
  );

  return associes
    .map((a, i) => ({ rang: i, nom: nomDeLaPartie(a) || "Associé " + (i + 1) }))
    .filter((a) => !pris.has(a.rang));
}

/** La première étape encore incomplète, ou null si tout est renseigné. */
export function premiereEtapeIncomplete(brouillon: Brouillon): number | null {
  for (const etape of ETAPES) {
    if (verifierEtape(etape.numero, brouillon).length > 0) return etape.numero;
  }
  return null;
}

/**
 * Jusqu'où la personne peut aller.
 *
 * On laisse revenir en arrière librement, mais pas sauter par-dessus une étape
 * incomplète : les étapes suivantes s'appuient sur ce qui précède - la
 * répartition du capital n'a pas de sens sans les associés.
 */
export function etapeAccessible(demandee: number, brouillon: Brouillon): number {
  const bloquante = premiereEtapeIncomplete(brouillon);
  if (bloquante === null) return Math.min(Math.max(demandee, 1), ETAPES.length);
  return Math.min(Math.max(demandee, 1), bloquante);
}

/**
 * L'avancement ne compte que ce qu'il y a à saisir.
 *
 * Deux étapes ne demandent rien : les pièces se vérifient à leur dépôt, les actes sont
 * produits par le dossier. Les compter au dénominateur affichait « 29 % renseigné » sur
 * un dossier entièrement vide - un chiffre qui promet un travail déjà commencé alors
 * que rien ne l'est.
 *
 * Le dénominateur se déduit donc du parcours lui-même : une étape compte si un
 * brouillon neuf la déclare incomplète. Une étape ajoutée plus tard s'y range seule.
 *
 * Neuf, et non vide : les réponses courantes sont écrites d'avance - la formule, la
 * durée de vie, l'option fiscale, la clôture du premier exercice. L'étape des offres
 * était donc faite dès l'ouverture, et le même « 20 % renseigné » revenait sur un
 * formulaire où personne n'avait rien tapé. Ce qui est répondu d'avance n'est pas à
 * saisir : cela ne compte ni au numérateur ni au dénominateur.
 */
function etapesASaisir(maintenant: Date): Etape[] {
  const neuf = valeursParDefaut({}, maintenant);
  return ETAPES.filter((e) => verifierEtape(e.numero, neuf).length > 0);
}

export function avancementParcours(
  brouillon: Brouillon,
  maintenant: Date = new Date()
): number {
  const aSaisir = etapesASaisir(maintenant);
  if (aSaisir.length === 0) return 100;

  const faites = aSaisir.filter((e) => verifierEtape(e.numero, brouillon).length === 0).length;
  return Math.round((faites / aSaisir.length) * 100);
}
