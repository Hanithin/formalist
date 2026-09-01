import type { Forme } from "@/domain/formalite/formes";

/**
 * Les codes que le guichet unique attend, et ce qu'ils valent chez nous.
 *
 * Le guichet ne parle pas notre vocabulaire : là où Formalist dit « SAS », il attend
 * « 5710 » ; là où nous disons « célibataire », il attend « 1 ». Ces tables sont la
 * traduction, et elles vivent dans le domaine parce qu'elles se vérifient sans compte
 * ni réseau - une erreur de code se voit à la lecture, pas au dépôt.
 *
 * Les valeurs viennent du dictionnaire de données publié par l'INPI (juin 2026),
 * feuilles `formeJuridique`, `rolePourEntreprise`, `typeDePersonne`, `typeFormalite`
 * et `situationMatrimoniale`. Elles sont recopiées, non devinées : la nomenclature
 * compte quatre cent soixante-sept formes juridiques, et la ressemblance d'un libellé
 * n'est pas une preuve.
 */

/**
 * La forme juridique, en code INSEE.
 *
 * Une SASU est une SAS à associé unique - le guichet n'a pas de code pour elle, et une
 * EURL est de même une SARL. Ce que nous distinguons pour poser les bonnes questions,
 * le registre ne le distingue pas : c'est le nombre d'associés qui le dit.
 *
 * La SA a deux codes selon son organe de direction, conseil d'administration ou
 * directoire. Nous ne posons pas la question, et le conseil d'administration est la
 * forme ordinaire : c'est celui-là qu'on déclare, faute de mieux et en le disant.
 */
export const FORME_JURIDIQUE: Record<Forme, string> = {
  /* SAS, société par actions simplifiée */
  SAS: "5710",
  SASU: "5710",
  /* SARL, société à responsabilité limitée (sans autre indication) */
  SARL: "5499",
  EURL: "5499",
  /* Société civile immobilière (SCI) */
  SCI: "6540",
  /* Société anonyme à conseil d'administration (sans autre indication) */
  SA: "5599",
};

/** Le type de personne, au sens du guichet. Nos six formes sont toutes des sociétés. */
export const TYPE_PERSONNE_MORALE = "M";

/** Le type de formalité : création, modification, cessation. */
export const TYPE_FORMALITE = {
  creation: "C",
  modification: "M",
  cessation: "R",
  correction: "Y",
  completion: "Z",
} as const;

/**
 * Ce qu'un établissement est pour l'entreprise.
 *
 * Le contrat d'interface le dit sans détour : si le siège exerce l'activité, il vaut
 * 2 et se déclare en établissement principal. S'il ne l'exerce pas, l'établissement
 * principal vaut 3 et le siège vaut 1, dans les autres établissements. Une société
 * sans activité n'a qu'un siège, en 1.
 */
export const ROLE_POUR_ENTREPRISE = {
  siege: "1",
  siegeEtPrincipal: "2",
  principal: "3",
  secondaire: "4",
} as const;

/**
 * La situation matrimoniale.
 *
 * Notre formulaire la demande en toutes lettres, avec les deux genres entre
 * parenthèses - « Marié(e) » - parce qu'elle sert à savoir si un conjoint doit
 * intervenir. Le guichet la veut en chiffre.
 */
const SITUATIONS: Array<[RegExp, string]> = [
  [/^c[ée]libataire/i, "1"],
  [/^divorc/i, "2"],
  [/^veu[fv]/i, "3"],
  [/^mari/i, "4"],
  [/^pacs/i, "5"],
];

/**
 * Le code d'une situation matrimoniale, ou rien.
 *
 * Rien plutôt qu'un repli : « célibataire » par défaut ferait déclarer célibataire une
 * personne mariée, et c'est le genre d'affirmation qu'un acte ne doit pas inventer. Un
 * champ absent se signale ; un champ faux ne se voit pas.
 */
export function codeSituationMatrimoniale(valeur: string | null | undefined): string | null {
  const propre = (valeur ?? "").trim();
  if (!propre) return null;
  for (const [motif, code] of SITUATIONS) if (motif.test(propre)) return code;
  return null;
}

/** Le code pays d'une adresse française, seul cas que le parcours accepte aujourd'hui. */
export const PAYS_FRANCE = "FRA";
