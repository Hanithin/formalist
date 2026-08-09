/**
 * Catalogue des articles du blog.
 *
 * Source unique pour l'index, le plan du site et le flux : trois listes séparées
 * finiraient par diverger, et un article publié manquerait dans l'une d'elles sans
 * que personne ne le remarque.
 *
 * Les dates sont écrites en français dans les pages d'origine. On les analyse ici
 * une fois pour toutes : un moteur de recherche attend une date normalisée.
 */

export interface Article {
  identifiant: string;
  titre: string;
  resume: string;
  publieLe: Date;
}

const MOIS: Record<string, number> = {
  janvier: 0,
  février: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  août: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  décembre: 11,
};

/** « 18 janvier 2026 » vers une date. Rend null si la forme n'est pas reconnue. */
export function analyserDateFrancaise(texte: string | null | undefined): Date | null {
  if (!texte) return null;

  const iso = /^\d{4}-\d{2}-\d{2}/.exec(texte.trim());
  if (iso) {
    const d = new Date(iso[0] + "T00:00:00Z");
    return isNaN(d.getTime()) ? null : d;
  }

  const m = /^(\d{1,2})\s+([a-zéûôA-Z]+)\s+(\d{4})$/.exec(texte.trim());
  if (!m) return null;

  const mois = MOIS[m[2].toLowerCase()];
  if (mois === undefined) return null;

  return new Date(Date.UTC(Number(m[3]), mois, Number(m[1])));
}

/** Du plus récent au plus ancien : c'est l'ordre attendu partout. */
export function trierParDate(articles: Article[]): Article[] {
  return [...articles].sort((a, b) => b.publieLe.getTime() - a.publieLe.getTime());
}
