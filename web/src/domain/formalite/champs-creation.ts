/**
 * Le formulaire d'une création, déclaré.
 *
 * Les quatre autres parcours décrivent leurs champs dans une table - libellé, groupe,
 * type, aide - et l'écran s'en sert pour les rendre. La création, la plus ancienne,
 * écrivait les siens à la main dans six composants : rien ne permettait de la relire
 * ailleurs, et l'avocat qui voulait corriger une valeur pour reproduire les actes
 * n'avait aucune liste à lui montrer.
 *
 * Ce que cette table couvre, c'est ce que le brouillon porte à plat : l'identité de la
 * société, son siège, son capital, son activité, son régime. Les associés et les
 * dirigeants n'y sont pas - ce sont des listes de personnes, que l'on ajoute et retire,
 * non des champs. Ils se corrigent dans le parcours, comme les autres listes des autres
 * types.
 */

import type { ChampModification } from "@/domain/modification/types";
import {
  BANQUES,
  MODES_DOMICILIATION,
  OCCUPATIONS_DOMICILE,
  OPTIONS_FISCALES,
  REGIMES_TVA,
} from "./parcours";
import { NATURES_PROPOSEES } from "./formes";
import { motAssocie, REGIMES_SOCIAUX, REMUNERATIONS } from "./parcours";
import { CIVILITES, SITUATIONS_MATRIMONIALES } from "./etat-civil";

const SOCIETE = "La société";
const SIEGE = "Le siège social";
const CAPITAL = "Le capital";
const ACTIVITE = "L'activité";
const REGIME = "Le régime fiscal";

export const CHAMPS_CREATION: ChampModification[] = [
  {
    identifiant: "denomination",
    libelle: "Dénomination sociale",
    groupe: SOCIETE,
    type: "texte",
    obligatoire: true,
  },
  {
    identifiant: "forme",
    libelle: "Forme juridique",
    groupe: SOCIETE,
    type: "choix",
    options: [...NATURES_PROPOSEES],
    obligatoire: true,
    aide: "Changer la forme après la production des actes suppose de les reproduire : les statuts, le titre du dirigeant et les mentions légales en dépendent.",
  },
  {
    identifiant: "dureeDeVie",
    libelle: "Durée de la société, en années",
    groupe: SOCIETE,
    type: "nombre",
    indication: "99 par défaut",
  },

  /* ------------------------------------------------------------ Le siège */
  {
    identifiant: "modeDomiciliation",
    libelle: "Mode de domiciliation",
    groupe: SIEGE,
    type: "choix",
    options: [...MODES_DOMICILIATION],
  },
  {
    identifiant: "adresse",
    libelle: "Adresse du siège",
    groupe: SIEGE,
    type: "adresse",
    pleineLargeur: true,
    obligatoire: true,
  },
  {
    identifiant: "codePostal",
    libelle: "Code postal",
    groupe: SIEGE,
    type: "texte",
    colonnes: 2,
    obligatoire: true,
  },
  { identifiant: "ville", libelle: "Ville", groupe: SIEGE, type: "texte", obligatoire: true },
  {
    /*
     * Le greffe ne se contente pas de l'adresse : le domicilié déclare le nom du
     * domiciliataire et les références de son immatriculation (articles L. 123-10 et
     * R. 123-166-1 du code de commerce).
     */
    identifiant: "domiciliataireDenomination",
    libelle: "Société de domiciliation",
    groupe: SIEGE,
    type: "texte",
    visibleSi: { champ: "modeDomiciliation", vaut: ["Société de domiciliation"] },
  },
  {
    identifiant: "domiciliataireSiren",
    libelle: "SIREN du domiciliataire",
    groupe: SIEGE,
    type: "texte",
    colonnes: 2,
    visibleSi: { champ: "modeDomiciliation", vaut: ["Société de domiciliation"] },
  },
  {
    identifiant: "domiciliataireAgrement",
    libelle: "Numéro d'agrément",
    groupe: SIEGE,
    type: "texte",
    colonnes: 2,
    aide: "Sans lui, l'attestation de domiciliation est refusée : le domiciliataire mentionne ses références d'agrément dans tous les contrats qu'il conclut.",
    visibleSi: { champ: "modeDomiciliation", vaut: ["Société de domiciliation"] },
  },
  {
    identifiant: "occupationDomicile",
    libelle: "Le dirigeant occupe le logement comme",
    groupe: SIEGE,
    type: "choix",
    options: [...OCCUPATIONS_DOMICILE],
    visibleSi: { champ: "modeDomiciliation", vaut: ["Domicile personnel du dirigeant"] },
  },

  /* ------------------------------------------------------------ Le capital */
  {
    identifiant: "capital",
    libelle: "Capital social, en euros",
    groupe: CAPITAL,
    type: "nombre",
    obligatoire: true,
  },
  {
    identifiant: "capitalLibere",
    libelle: "Capital libéré à la constitution, en euros",
    groupe: CAPITAL,
    type: "nombre",
    aide: "La loi impose la moitié pour une société par actions, le cinquième pour une société à responsabilité limitée.",
  },
  {
    identifiant: "partsTotales",
    libelle: "Nombre de titres émis",
    groupe: CAPITAL,
    type: "nombre",
  },
  {
    identifiant: "banque",
    libelle: "Banque du dépôt",
    groupe: CAPITAL,
    type: "choix",
    options: [...BANQUES],
  },

  /* ------------------------------------------------------------ L'activité */
  {
    identifiant: "activite",
    libelle: "Objet social",
    groupe: ACTIVITE,
    type: "long",
    pleineLargeur: true,
    obligatoire: true,
    aide: "Le texte qui figure dans les statuts. Il borne ce que la société peut faire : trop étroit, il oblige à le modifier au premier virage.",
  },
  {
    identifiant: "dateDebutActivite",
    libelle: "Début de l'activité",
    groupe: ACTIVITE,
    type: "date",
  },
  {
    identifiant: "dateCloturePremierExercice",
    libelle: "Clôture du premier exercice",
    groupe: ACTIVITE,
    type: "date",
  },

  /* ------------------------------------------------------------ Le régime */
  {
    identifiant: "optionFiscale",
    libelle: "Impôt",
    groupe: REGIME,
    type: "choix",
    options: [...OPTIONS_FISCALES],
  },
  {
    identifiant: "regimeTva",
    libelle: "Régime de TVA",
    groupe: REGIME,
    type: "choix",
    options: [...REGIMES_TVA],
  },
];

/**
 * Le domiciliataire vit dans un sous-objet, non à plat.
 *
 * Le brouillon le range sous `domiciliataire`, avec trois clés ; la table le déclare à
 * plat pour que la fenêtre le rende comme les autres. Ces deux fonctions font la
 * traduction, dans un sens et dans l'autre.
 */
const DOMICILIATAIRE: Record<string, string> = {
  domiciliataireDenomination: "denomination",
  domiciliataireSiren: "siren",
  domiciliataireAgrement: "agrement",
};

type Valeurs = Record<string, string | number | undefined>;

export function valeursDuBrouillon(brouillon: Record<string, unknown>): Valeurs {
  const valeurs: Valeurs = {};

  for (const champ of champsDeLaCreation(brouillon)) {
    const sousCle = DOMICILIATAIRE[champ.identifiant];
    const lu = sousCle
      ? (brouillon.domiciliataire as Record<string, unknown> | undefined)?.[sousCle]
      : champ.identifiant.includes(".")
        ? lireLeChemin(brouillon, champ.identifiant)
        : brouillon[champ.identifiant];

    if (typeof lu === "string" || typeof lu === "number") valeurs[champ.identifiant] = lu;
  }
  return valeurs;
}

/** Les valeurs corrigées, remises à leur place dans le brouillon. */
export function brouillonAvecValeurs(
  brouillon: Record<string, unknown>,
  valeurs: Valeurs
): Record<string, unknown> {
  const resultat = { ...brouillon };
  const domiciliataire = {
    ...((brouillon.domiciliataire as Record<string, unknown> | undefined) ?? {}),
  };

  /*
   * Les chemins d'abord, à plat ensuite.
   *
   * Une écriture par chemin recopie les niveaux qu'elle traverse et rend un nouvel
   * objet : elle doit donc repartir du résultat des précédentes, sans quoi deux
   * corrections sur le même associé s'annuleraient - la seconde repartirait d'un
   * brouillon où la première n'a pas eu lieu.
   */
  let porteur = resultat;

  for (const [identifiant, valeur] of Object.entries(valeurs)) {
    const sousCle = DOMICILIATAIRE[identifiant];
    if (sousCle) domiciliataire[sousCle] = valeur;
    else if (identifiant.includes(".") && valeur !== undefined) {
      porteur = ecrireLeChemin(porteur, identifiant, valeur);
    } else porteur[identifiant] = valeur;
  }

  porteur.domiciliataire = domiciliataire;
  return porteur;
}

/* ---------- Les personnes du dossier ---------- */

/**
 * Les associés et les dirigeants, dépliés en champs.
 *
 * Cette table ne couvrait que ce que le brouillon porte à plat, et les personnes en
 * étaient exclues : « ce sont des listes, non des champs ». C'était vrai du modèle et
 * faux de l'usage - l'avocat qui voit « DUPOND » au lieu de « DUPONT » dans les statuts
 * ne peut corriger ni le nom, ni la date de naissance, ni le domicile, c'est-à-dire
 * précisément ce qui remplit les actes. Il lui restait à reprendre le Word à la main,
 * ce que la fenêtre de correction existe pour éviter.
 *
 * Une personne se déplie donc en champs, un par valeur, sous un identifiant qui dit son
 * chemin : `associes.0.personne.nom`. Le reste de la chaîne ne bouge pas - la fenêtre
 * rend une liste de champs, la route transporte des chaînes et des nombres - et seule
 * la lecture et l'écriture apprennent à suivre un chemin.
 *
 * Ce qui n'y figure pas : ajouter ou retirer une personne. Corriger une valeur et
 * changer la composition de la société ne sont pas le même geste, et le second se fait
 * dans le parcours, où le capital se répartit.
 */

const CIVILITES_MODIFIABLES = [...CIVILITES];
const SITUATIONS_MODIFIABLES = [...SITUATIONS_MATRIMONIALES];

/**
 * L'état civil d'une personne, sous le chemin qui la désigne.
 *
 * L'adresse est en trois champs de texte plutôt qu'en champ d'adresse : le champ
 * d'adresse de cette fenêtre range la proposition entière sur une ligne, code postal
 * et commune compris, alors que le modèle les tient séparés - et les actes composent
 * eux-mêmes la ligne. Les réunir ici les écrirait deux fois dans les statuts.
 */
function champsDUnePersonne(chemin: string, groupe: string): ChampModification[] {
  return [
    { identifiant: chemin + ".civilite", libelle: "Civilité", type: "choix", options: CIVILITES_MODIFIABLES, groupe, colonnes: 2 },
    { identifiant: chemin + ".prenom", libelle: "Prénom", type: "texte", groupe },
    { identifiant: chemin + ".nom", libelle: "Nom", type: "texte", groupe },
    { identifiant: chemin + ".nomDeNaissance", libelle: "Nom de naissance", type: "texte", groupe },
    { identifiant: chemin + ".email", libelle: "Email", type: "texte", groupe },
    { identifiant: chemin + ".adresse", libelle: "Adresse", type: "texte", groupe, pleineLargeur: true },
    { identifiant: chemin + ".codePostal", libelle: "Code postal", type: "texte", groupe, colonnes: 2 },
    { identifiant: chemin + ".ville", libelle: "Ville", type: "texte", groupe },
    { identifiant: chemin + ".dateDeNaissance", libelle: "Date de naissance", type: "date", groupe },
    { identifiant: chemin + ".villeDeNaissance", libelle: "Ville de naissance", type: "texte", groupe },
    { identifiant: chemin + ".codePostalDeNaissance", libelle: "Code postal de naissance", type: "texte", groupe, colonnes: 2 },
    { identifiant: chemin + ".paysDeNaissance", libelle: "Pays de naissance", type: "texte", groupe },
    { identifiant: chemin + ".nationalite", libelle: "Nationalité", type: "texte", groupe },
    { identifiant: chemin + ".situationMatrimoniale", libelle: "Situation matrimoniale", type: "choix", options: SITUATIONS_MODIFIABLES, groupe },
    { identifiant: chemin + ".nomDuPere", libelle: "Nom et prénom du père", type: "texte", groupe },
    { identifiant: chemin + ".nomDeLaMere", libelle: "Nom de jeune fille et prénom de la mère", type: "texte", groupe },
  ];
}

/** Une société associée : sa désignation, son siège et son représentant. */
function champsDUneSocieteAssociee(chemin: string, groupe: string): ChampModification[] {
  return [
    { identifiant: chemin + ".denomination", libelle: "Dénomination", type: "texte", groupe },
    { identifiant: chemin + ".forme", libelle: "Forme juridique", type: "texte", groupe },
    { identifiant: chemin + ".siret", libelle: "SIREN ou SIRET", type: "texte", groupe },
    { identifiant: chemin + ".numeroRcs", libelle: "Numéro RCS", type: "texte", groupe },
    { identifiant: chemin + ".villeImmatriculation", libelle: "Ville d'immatriculation", type: "texte", groupe },
    { identifiant: chemin + ".capital", libelle: "Capital social", type: "nombre", groupe },
    { identifiant: chemin + ".adresse", libelle: "Siège social", type: "texte", groupe, pleineLargeur: true },
    { identifiant: chemin + ".codePostal", libelle: "Code postal", type: "texte", groupe, colonnes: 2 },
    { identifiant: chemin + ".ville", libelle: "Ville", type: "texte", groupe },
    { identifiant: chemin + ".representant.civilite", libelle: "Civilité du représentant", type: "choix", options: CIVILITES_MODIFIABLES, groupe, colonnes: 2 },
    { identifiant: chemin + ".representant.prenom", libelle: "Prénom du représentant", type: "texte", groupe },
    { identifiant: chemin + ".representant.nom", libelle: "Nom du représentant", type: "texte", groupe },
  ];
}

/** Ce qu'un associé apporte, quel que soit son type. */
function champsDeLApport(chemin: string, groupe: string): ChampModification[] {
  return [
    { identifiant: chemin + ".parts", libelle: "Nombre de parts ou d'actions", type: "nombre", groupe },
    { identifiant: chemin + ".apport", libelle: "Apport souscrit, en euros", type: "nombre", groupe },
    { identifiant: chemin + ".versement", libelle: "Montant versé, en euros", type: "nombre", groupe },
  ];
}

/**
 * Les champs d'une création, personnes comprises.
 *
 * La liste dépend du dossier : autant de groupes que d'associés, et un de plus par
 * dirigeant dont l'état civil lui est propre. Un dirigeant qui reprend un associé n'a
 * rien à corriger de son côté - c'est la même personne, et la corriger deux fois
 * ouvrirait la porte à deux vérités.
 */
export function champsDeLaCreation(brouillon: Record<string, unknown>): ChampModification[] {
  const forme = typeof brouillon.forme === "string" ? brouillon.forme : null;
  const associes = Array.isArray(brouillon.associes) ? brouillon.associes : [];
  const dirigeants = Array.isArray(brouillon.dirigeants) ? brouillon.dirigeants : [];

  const mot = motAssocie(forme);
  const champs = [...CHAMPS_CREATION];

  associes.forEach((brut, rang) => {
    const associe = (brut ?? {}) as Record<string, unknown>;
    const chemin = "associes." + rang;
    const groupe = mot + " " + (rang + 1);

    champs.push(
      ...(associe.type === "morale"
        ? champsDUneSocieteAssociee(chemin + ".societe", groupe)
        : champsDUnePersonne(chemin + ".personne", groupe)),
      ...champsDeLApport(chemin, groupe)
    );
  });

  dirigeants.forEach((brut, rang) => {
    const dirigeant = (brut ?? {}) as Record<string, unknown>;
    const groupe = "Dirigeant " + (rang + 1);
    const chemin = "dirigeants." + rang;

    /* Le dirigeant qui reprend un associé se corrige sous cet associé. */
    if (typeof dirigeant.associe !== "number") {
      champs.push(...champsDUnePersonne(chemin + ".personne", groupe));
    }

    champs.push(
      { identifiant: chemin + ".remuneration", libelle: "Rémunération", type: "choix", options: [...REMUNERATIONS], groupe },
      { identifiant: chemin + ".regimeSocial", libelle: "Régime social", type: "choix", options: [...REGIMES_SOCIAUX], groupe }
    );
  });

  return champs;
}

/* ---------- Lire et écrire par chemin ---------- */

/**
 * La valeur au bout d'un chemin pointé, ou rien.
 *
 * `associes.0.personne.nom` traverse un tableau puis deux objets. Un chemin qui ne mène
 * nulle part ne vaut pas une erreur : la liste des champs est construite à partir du
 * dossier, mais un dossier peut avoir été écrit avant qu'une clé existe.
 */
function lireLeChemin(racine: Record<string, unknown>, chemin: string): unknown {
  let courant: unknown = racine;

  for (const pas of chemin.split(".")) {
    if (courant === null || typeof courant !== "object") return undefined;
    courant = (courant as Record<string, unknown>)[pas];
  }
  return courant;
}

/**
 * Écrit une valeur au bout d'un chemin, sans toucher au reste.
 *
 * Chaque niveau traversé est recopié : le brouillon d'origine n'est pas modifié, et
 * deux corrections successives ne se marchent pas dessus. Un maillon absent se crée -
 * un tableau si le pas suivant est un nombre, un objet sinon - parce qu'une personne
 * peut n'avoir jamais eu de représentant avant qu'on le corrige.
 */
function ecrireLeChemin(
  racine: Record<string, unknown>,
  chemin: string,
  valeur: string | number
): Record<string, unknown> {
  const pas = chemin.split(".");
  const copie = { ...racine };
  let courant: Record<string, unknown> | unknown[] = copie;

  for (let i = 0; i < pas.length - 1; i++) {
    const cle = pas[i];
    const suivant = pas[i + 1];
    const index: string | number = Array.isArray(courant) ? Number(cle) : cle;

    const existant = (courant as Record<string, unknown>)[index];
    const enfant =
      existant && typeof existant === "object"
        ? Array.isArray(existant)
          ? [...existant]
          : { ...(existant as Record<string, unknown>) }
        : /^\d+$/.test(suivant)
          ? []
          : {};

    (courant as Record<string, unknown>)[index] = enfant;
    courant = enfant as Record<string, unknown> | unknown[];
  }

  const derniere = pas[pas.length - 1];
  (courant as Record<string, unknown>)[Array.isArray(courant) ? Number(derniere) : derniere] =
    valeur;

  return copie;
}
