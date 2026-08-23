/**
 * Séparer une identité saisie en un seul champ.
 *
 * Les listes d'associés se saisissent sur une ligne - « Monsieur Jean DUPONT » - parce
 * que trois champs par personne alourdiraient l'écran. Les actes, eux, distinguent le
 * prénom du nom : le procès-verbal écrit « Monsieur Jean DUPONT », l'acte de cession
 * « M. DUPONT », et le greffe attend les deux séparément.
 *
 * La règle employée jusqu'ici - premier mot le prénom, le reste le nom - marche pour
 * « Jean DUPONT » et se trompe partout ailleurs : « Marie Claire DUPONT » donnait un
 * nom « Claire DUPONT », et l'acte nommait quelqu'un qui n'existe pas.
 *
 * On se fie donc à la casse, qui est la convention des actes et des formulaires
 * administratifs : le nom de famille s'écrit en capitales. Faute de capitales, on
 * retient le dernier mot comme nom - un prénom composé est plus fréquent qu'un nom
 * composé, et se tromper sur le prénom se voit moins.
 */

export interface Identite {
  civilite: string;
  prenom: string;
  nom: string;
}

const CIVILITES: Record<string, string> = {
  m: "Monsieur",
  "m.": "Monsieur",
  mr: "Monsieur",
  monsieur: "Monsieur",
  mme: "Madame",
  "mme.": "Madame",
  madame: "Madame",
  mlle: "Madame",
  mademoiselle: "Madame",
};

/** Un mot tout en capitales, accents compris. « DE », « L'ÉTANG », « MARTIN-DUBOIS ». */
function enCapitales(mot: string): boolean {
  if (!/\p{L}/u.test(mot)) return false;
  return mot === mot.toLocaleUpperCase("fr");
}

export function separerLIdentite(saisi: string): Identite {
  const mots = saisi.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return { civilite: "", prenom: "", nom: "" };

  /*
   * La civilité se retire d'abord.
   *
   * Sans cela, « M. DUPONT » ferait de « M. » un prénom, et « MONSIEUR DUPONT » -
   * saisi tout en capitales, ce qui arrive - donnerait un nom « MONSIEUR DUPONT ».
   */
  let civilite = "";
  const premier = mots[0].toLowerCase().replace(/,$/, "");
  if (CIVILITES[premier]) {
    civilite = CIVILITES[premier];
    mots.shift();
  }

  if (mots.length === 0) return { civilite, prenom: "", nom: "" };
  if (mots.length === 1) {
    // Un seul mot : en capitales c'est un nom, sinon un prénom.
    return enCapitales(mots[0])
      ? { civilite, prenom: "", nom: mots[0] }
      : { civilite, prenom: mots[0], nom: "" };
  }

  const capitales = mots.filter(enCapitales);
  if (capitales.length > 0 && capitales.length < mots.length) {
    /*
     * L'ordre des mots ne compte pas : « Jean DUPONT » et « DUPONT Jean » se saisissent
     * l'un comme l'autre, et la casse tranche dans les deux cas.
     */
    return {
      civilite,
      prenom: mots.filter((mot) => !enCapitales(mot)).join(" "),
      nom: capitales.join(" "),
    };
  }

  // Tout en capitales, ou rien : le dernier mot fait le nom.
  return { civilite, prenom: mots.slice(0, -1).join(" "), nom: mots[mots.length - 1] };
}

/**
 * L'identité recomposée sur une ligne, telle que l'écran la réaffiche.
 *
 * Les champs viennent de la base, où ils sont facultatifs et peuvent être nuls : on
 * accepte l'absence plutôt que d'obliger chaque appelant à la convertir.
 */
export function identiteSurUneLigne(identite: {
  civilite?: string | null;
  prenom?: string | null;
  nom?: string | null;
}): string {
  return [identite.civilite, identite.prenom, identite.nom].filter(Boolean).join(" ");
}
