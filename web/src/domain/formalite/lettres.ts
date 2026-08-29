/**
 * Les montants et les dates en toutes lettres.
 *
 * Des statuts écrivent « au capital de mille euros (1 000 €) » : la somme en
 * lettres fait foi en cas de divergence. Ces deux fonctions viennent de
 * public/js/creation/form-data.js (numberToFrench, formatDateFr), portées telles
 * quelles - même découpage par tranches, mêmes accords.
 */

const UNITES = [
  "", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
  "dix-sept", "dix-huit", "dix-neuf",
];

// Soixante-dix et quatre-vingt-dix se construisent sur soixante et quatre-vingt :
// les deux cases correspondantes répètent donc la dizaine inférieure.
const DIZAINES = [
  "", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante",
  "quatre-vingt", "quatre-vingt",
];

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** Une tranche inférieure au million, en lettres. */
function tranche(nombre: number): string {
  if (nombre === 0) return "";
  if (nombre < 20) return UNITES[nombre];

  if (nombre < 70) {
    const reste = nombre % 10;
    return (
      DIZAINES[Math.floor(nombre / 10)] +
      (reste === 1 ? " et un" : reste ? "-" + UNITES[reste] : "")
    );
  }

  if (nombre < 80) {
    const reste = nombre - 60;
    return "soixante" + (reste === 11 ? " et onze" : reste === 1 ? " et un" : "-" + UNITES[reste]);
  }

  if (nombre < 100) {
    const reste = nombre - 80;
    // « quatre-vingts » prend son s quand rien ne le suit.
    return "quatre-vingt" + (reste === 0 ? "s" : "-" + UNITES[reste]);
  }

  if (nombre < 200) return "cent" + (nombre === 100 ? "" : " " + tranche(nombre - 100));

  if (nombre < 1000) {
    return (
      UNITES[Math.floor(nombre / 100)] +
      " cent" +
      (nombre % 100 === 0 ? "s" : " " + tranche(nombre % 100))
    );
  }

  if (nombre < 2000) return "mille" + (nombre === 1000 ? "" : " " + tranche(nombre - 1000));

  return (
    devantMille(tranche(Math.floor(nombre / 1000))) +
    " mille" +
    (nombre % 1000 === 0 ? "" : " " + tranche(nombre % 1000))
  );
}

/**
 * « vingt » et « cent » perdent leur s devant « mille ».
 *
 * Ils prennent la marque du pluriel quand ils sont multipliés et que rien ne les suit -
 * quatre-vingts, deux cents - et la perdent dès qu'un autre nombre vient après :
 * quatre-vingt mille, deux cent mille. « Mille » étant invariable, il ne l'entraîne
 * jamais. Le capital d'une société s'écrit en lettres dans ses statuts et dans chacun
 * de ses actes : « quatre-vingts mille euros » s'y lit à chaque page.
 */
function devantMille(multiplicateur: string): string {
  return multiplicateur.replace(/(vingt|cent)s$/, "$1");
}

/**
 * Un montant en toutes lettres, centimes compris.
 *
 * Au-delà du million, le nombre est rendu en chiffres : c'est ce que faisait la
 * page d'origine, et un capital de cet ordre passe de toute façon par un avocat.
 */
export function nombreEnFrancais(valeur: number): string {
  if (!Number.isFinite(valeur) || valeur < 0) return "";
  if (valeur === 0) return "zéro";
  if (valeur >= 1_000_000) return String(valeur);

  const euros = Math.floor(valeur);
  const centimes = Math.round((valeur - euros) * 100);

  if (centimes > 0 && euros === 0) return tranche(centimes);
  if (centimes > 0) {
    return tranche(euros) + " et " + tranche(centimes) + " centime" + (centimes > 1 ? "s" : "");
  }
  return tranche(euros);
}

/**
 * « 2026-08-10 » donne « 10 août 2026 ». Une entrée illisible est rendue telle quelle.
 *
 * Le premier du mois s'écrit « 1er ». « Fait le 1 septembre » dans un acte déposé au
 * greffe ou dans un avis publié se remarque, et se lit comme une négligence sur le
 * reste du document.
 */
export function dateEnFrancais(iso: string | null | undefined): string {
  // Une date absente s'écrit « - » comme n'importe quel champ vide d'un acte.
  if (!iso?.trim()) return "-";
  if (!iso.includes("-")) return iso;

  const [annee, mois, jour] = iso.split("-");
  const rang = parseInt(mois, 10);
  if (!MOIS[rang - 1]) return iso;

  const quantieme = parseInt(jour, 10);
  return (quantieme === 1 ? "1er" : String(quantieme)) + " " + MOIS[rang - 1] + " " + annee;
}

/**
 * « de » s'élide devant une voyelle.
 *
 * L'étiquette du champ se composait par concaténation - « Nombre total de » suivi du
 * mot de la forme - et donnait « Nombre total de actions » sur toutes les sociétés par
 * actions.
 *
 * Le h n'est pas traité : il est tantôt muet - d'heure - tantôt aspiré - de hangar - et
 * rien dans le mot ne le dit. Aucun des mots employés ici n'en commence, et deviner
 * ferait pire que l'erreur qu'on corrige.
 */
export function elider(mot: string): string {
  const net = mot.trim();
  return /^[aeiouyàâéèêëîïôöùûü]/i.test(net) ? "d'" + net : "de " + net;
}
