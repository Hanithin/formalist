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

/**
 * Le rôle du dirigeant dans l'entreprise.
 *
 * Le guichet refuse une SAS qui n'a pas de président - « Les formes juridiques SAS
 * doivent posséder au moins un président de SAS (73) » - et n'accepte, pour les codes
 * 5710 et 5785, qu'une liste courte de rôles. Le titre que nos actes donnent au
 * dirigeant suffit à le déduire : c'est la même règle, écrite une fois de plus.
 */
export const ROLE_ENTREPRISE: Record<Forme, string> = {
  /* Président de SAS */
  SAS: "73",
  SASU: "73",
  /* Gérant */
  SARL: "30",
  EURL: "30",
  SCI: "30",
  /* Président du conseil d'administration et directeur général */
  SA: "60",
};

/**
 * Le genre, que le guichet demande à part de la civilité.
 *
 * Notre formulaire pose « Madame » ou « Monsieur » : une civilité, non un genre. Le
 * guichet en veut le code, et refuse le dépôt sans.
 *
 * Le piège est dans la forme de la table. `genre` est publié en tableau - `["", "M",
 * "F"]` - et non en dictionnaire : ce qu'on transmet est le rang, non la lettre.
 * Envoyer « F » se solde par « Cette valeur doit être l'un des choix proposés », un
 * message qui ne dit pas que la valeur juste était « 2 ».
 *
 * Une civilité qu'on ne sait pas lire ne se remplace pas par un défaut : le masculin
 * serait affirmé sur une femme, ce qu'un acte ne doit pas faire.
 */
export const GENRE = { homme: "1", femme: "2" } as const;

export function genreDeLaCivilite(civilite: string | null | undefined): string | null {
  const propre = (civilite ?? "").trim().toLowerCase();
  if (propre.startsWith("madame") || propre.startsWith("mme")) return GENRE.femme;
  if (propre.startsWith("monsieur") || propre.startsWith("m.")) return GENRE.homme;
  return null;
}

/**
 * La forme sociale du dirigeant, au sens de son affiliation.
 *
 * Le guichet n'accepte ici que 0, 1 ou 3 pour une personne morale - la valeur 2 vise
 * l'entrepreneur individuel. Un président de SAS est assimilé salarié : il ne s'affilie
 * pas au régime des indépendants, et c'est « sans affiliation sociale ». Un gérant
 * majoritaire de SARL l'est, et c'est « avec affiliation sociale de l'un des
 * dirigeants ». Notre parcours pose déjà la question sous le nom de régime social.
 */
export const FORME_SOCIALE = {
  nonApplicable: "0",
  sansAffiliation: "1",
  avecAffiliationDirigeant: "3",
} as const;

export function formeSocialeDuRegime(regimeSocial: string | null | undefined): string {
  return (regimeSocial ?? "").trim().toLowerCase().startsWith("travailleur")
    ? FORME_SOCIALE.avecAffiliationDirigeant
    : FORME_SOCIALE.sansAffiliation;
}

/**
 * Le régime d'imposition des bénéfices.
 *
 * Deux questions du parcours le déterminent : l'option fiscale - IS ou IR - et le
 * régime de TVA, qui dit le réel simplifié du réel normal. Une société civile à l'IR
 * relève du revenu foncier, non des BIC : elle ne fait pas de commerce.
 *
 * « Je ne sais pas » n'est pas une réponse que l'on peut transmettre : le simplifié est
 * le régime de droit commun d'une société qui se crée, et c'est celui-là qu'on déclare
 * faute de mieux - le client pourra en changer, l'option n'est pas définitive.
 */
export function regimeImpositionBenefices(
  optionFiscale: string | null | undefined,
  regimeTva: string | null | undefined,
  forme: Forme
): string {
  const normal = (regimeTva ?? "").trim().toLowerCase().includes("normal");

  if ((optionFiscale ?? "").trim().toUpperCase() === "IR") {
    if (forme === "SCI") return "120";
    return normal ? "113" : "112";
  }
  return normal ? "115" : "114";
}

/**
 * Le régime d'imposition à la TVA.
 *
 * « Je ne sais pas » se traduit par le réel simplifié, pour la même raison que
 * ci-dessus : c'est le régime par défaut d'une société nouvelle, et taire le champ le
 * ferait refuser.
 */
export function regimeImpositionTva(regimeTva: string | null | undefined): string {
  const propre = (regimeTva ?? "").trim().toLowerCase();
  if (propre.includes("franchise")) return "310";
  if (propre.includes("normal")) return "312";
  return "311";
}

/** L'activité naît avec la société : elle ne vient ni d'un achat ni d'un apport. */
export const TYPE_ORIGINE_CREATION = "1";

/** Le greffe écrit à l'entreprise elle-même, non à un mandataire. */
export const TYPE_DESTINATAIRE_ENTREPRISE = "1";

/** La diffusion commerciale des données de l'INSEE : « O » ou « N », jamais un booléen. */
export const DIFFUSION_COMMERCIALE = { oui: "O", non: "N" } as const;
