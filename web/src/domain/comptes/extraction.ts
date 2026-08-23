/**
 * Les postes qu'on cherche dans une liasse, et comment les y reconnaître sans IA.
 *
 * Un repli, non un pis-aller. Le service de rédaction assistée tombe, change de
 * format, refuse parfois de répondre ; une liasse française, elle, écrit toujours
 * « RÉSULTAT DE L'EXERCICE » et « REPORT À NOUVEAU » au même endroit. Chercher
 * d'abord ce qui se cherche sans appeler personne rend l'extraction utilisable même
 * quand la clé n'est pas configurée - ce qui est le cas en développement.
 *
 * Rien de ce que ce module rend n'est certain. C'est pourquoi il rend aussi la ligne
 * d'où vient chaque montant : l'écran la montre, et l'on corrige en un coup d'œil.
 */

import type { ChampDuBilan } from "./types";

export interface PosteTrouve {
  champ: ChampDuBilan;
  /** En euros, tel qu'il ira dans le formulaire. */
  valeur: number;
  /** La ligne du document d'où il vient, pour que l'écran la montre. */
  ligne: string;
}

/**
 * Un montant français, lu dans une ligne de liasse.
 *
 * Les liasses écrivent « 48 200 », « 48 200,00 », « 48.200 » et parfois « (3 100) »
 * pour un négatif - la convention comptable des parenthèses. Le dernier montant de la
 * ligne est retenu : les colonnes vont du brut au net, et c'est le net qui compte.
 */
const MONTANT = /^\(?-?\s?\d{1,3}(?:[  .]\d{3})*(?:,\d{1,2})?\)?$/;

/**
 * Les montants d'une ligne, colonne par colonne.
 *
 * Le découpage se fait sur les blancs de deux caractères ou plus, qui sont ce que
 * `pdftotext -layout` met entre les colonnes. Écraser tous les blancs avant de
 * chercher recollerait « 45 000 » et « 365 000 » en un « 45000365000 » : l'espace est
 * aussi le séparateur des milliers en français, et rien dans « 45 000 365 000 » ne dit
 * où finit le premier nombre.
 */
function montantsDe(ligne: string, minimumDeChiffres = 3): number[] {
  const montants: number[] = [];

  for (const cellule of ligne.split(/\s{2,}|\t/)) {
    const brut = cellule.trim();
    if (!MONTANT.test(brut)) continue;

    /*
     * Un ou deux chiffres isolés ne sont pas un montant : ce sont les numéros de poste
     * dont les liasses truffent leurs marges. L'effectif fait exception - il se compte
     * en unités - et son repère abaisse ce seuil.
     */
    const chiffres = brut.replace(/[^\d]/g, "");
    if (chiffres.length < minimumDeChiffres) continue;

    const valeur = Number(brut.replace(/[()\s.]/g, "").replace(",", "."));
    if (!Number.isFinite(valeur)) continue;

    const negatif = brut.includes("(") || brut.startsWith("-");
    montants.push(negatif ? -Math.abs(valeur) : valeur);
  }

  return montants;
}

function sansAccent(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

/**
 * Ce qu'on cherche, et à quoi on le reconnaît.
 *
 * L'ordre compte : « RESULTAT DE L'EXERCICE » doit se chercher avant « RESULTAT »
 * tout court, sinon une ligne de résultat d'exploitation la coifferait.
 */
const REPERES: {
  champ: ChampDuBilan;
  motifs: string[];
  interdits?: string[];
  /** Un effectif se compte en unités, non en milliers : son seuil de chiffres diffère. */
  minimumDeChiffres?: number;
}[] = [
  {
    champ: "resultat",
    motifs: ["RESULTAT DE L'EXERCICE", "RESULTAT NET", "BENEFICE OU PERTE"],
    interdits: ["EXPLOITATION", "FINANCIER", "EXCEPTIONNEL", "COURANT"],
  },
  { champ: "reportAnterieur", motifs: ["REPORT A NOUVEAU"] },
  { champ: "reserveLegale", motifs: ["RESERVE LEGALE"] },
  { champ: "capital", motifs: ["CAPITAL SOCIAL", "CAPITAL SOUSCRIT"] },
  { champ: "totalBilan", motifs: ["TOTAL GENERAL", "TOTAL DU BILAN", "TOTAL ACTIF"] },
  {
    champ: "chiffreAffaires",
    motifs: ["CHIFFRES D'AFFAIRES NETS", "CHIFFRE D'AFFAIRES NET", "CHIFFRE D'AFFAIRES"],
  },
  {
    champ: "effectif",
    motifs: ["EFFECTIF MOYEN", "EFFECTIF DU PERSONNEL"],
    minimumDeChiffres: 1,
  },
];

/**
 * Les postes reconnus dans le texte d'une liasse.
 *
 * Le premier repère trouvé l'emporte : une liasse répète ses libellés d'un feuillet à
 * l'autre - bilan, compte de résultat, annexe - et les valeurs y sont les mêmes.
 */
export function posteslus(texte: string): PosteTrouve[] {
  const lignes = texte.split("\n");
  const trouves = new Map<ChampDuBilan, PosteTrouve>();

  for (const ligne of lignes) {
    // Les colonnes se lisent sur la ligne brute ; le libellé se cherche sur une
    // version aplatie, où les blancs de mise en page ne gênent plus la comparaison.
    if (ligne.trim().length < 5) continue;
    const cherchable = sansAccent(ligne.replace(/\s+/g, " ").trim());

    for (const repere of REPERES) {
      if (trouves.has(repere.champ)) continue;
      if (!repere.motifs.some((motif) => cherchable.includes(sansAccent(motif)))) continue;
      if (repere.interdits?.some((mot) => cherchable.includes(mot))) continue;

      const montants = montantsDe(ligne, repere.minimumDeChiffres);
      if (montants.length === 0) continue;

      /*
       * Le dernier montant de la ligne.
       *
       * Les colonnes d'une liasse vont du brut aux amortissements puis au net, et le
       * net est celui qu'on veut. Pour l'effectif, il n'y a qu'un nombre.
       */
      trouves.set(repere.champ, {
        champ: repere.champ,
        valeur: montants[montants.length - 1],
        ligne: ligne.replace(/\s+/g, " ").trim().slice(0, 160),
      });
    }
  }

  return [...trouves.values()];
}
