/**
 * Les communes proposées à la saisie, arrondissements compris.
 *
 * L'API géographique rend Paris, Lyon et Marseille comme une commune unique portant
 * plusieurs codes postaux - neuf pour Lyon, vingt et un pour Paris. Les écrans n'en
 * retenaient que le premier : qui tape « Lyon » se voyait proposer « Lyon 69001 », et
 * n'avait aucun moyen de dire le troisième arrondissement autrement qu'en corrigeant
 * le code à la main.
 *
 * Or l'arrondissement se lit dans les actes : « née le 12 avril 1988 à Lyon (69003) ».
 * C'est la seule chose qui distingue deux personnes nées la même année dans la même
 * ville, et le greffe le vérifie sur l'acte de naissance.
 */

/**
 * Les trois communes à arrondissements municipaux, et le rang du dernier.
 *
 * Le nombre borne l'expansion : sans lui, un code postal exotique - une boîte postale,
 * un service spécial - donnerait un « Paris 62e » qui n'existe pas.
 */
const A_ARRONDISSEMENTS: Record<string, { departement: string; dernier: number }> = {
  PARIS: { departement: "75", dernier: 20 },
  LYON: { departement: "69", dernier: 9 },
  MARSEILLE: { departement: "13", dernier: 16 },
};

export interface CommuneProposee {
  /** « Lyon 3e » : ce qu'on lit dans la liste, et ce qui entre dans le champ. */
  nom: string;
  codePostal: string;
}

/** « 1er », « 3e » : l'ordinal français, dont seul le premier est irrégulier. */
function ordinal(rang: number): string {
  return rang === 1 ? "1er" : rang + "e";
}

/** Sans accents ni casse : « MARSEILLE » se compare à « Marseille ». */
function comparable(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

/**
 * Une commune telle que l'API la rend, dépliée en arrondissements s'il y a lieu.
 *
 * Ailleurs, une seule proposition : une commune ordinaire porte parfois deux codes
 * postaux - un bourg et son hameau - sans que cela distingue deux lieux de naissance.
 */
export function communesProposees(
  nom: string,
  codesPostaux: readonly string[] | undefined
): CommuneProposee[] {
  const codes = codesPostaux ?? [];
  const ville = A_ARRONDISSEMENTS[comparable(nom)];

  if (!ville || codes.length < 2) {
    return [{ nom, codePostal: codes[0] ?? "" }];
  }

  /*
   * Un arrondissement, un rang, quel que soit le nombre de codes qui y mènent.
   *
   * Le seizième arrondissement de Paris en a deux, 75016 et 75116, hérités de la
   * distinction entre Auteuil et Passy. Les deux sont valables ; les proposer tous
   * deux ferait une liste où « Paris 16e » paraît deux fois, sans qu'on sache lequel
   * choisir. On garde le plus petit, celui que les actes portent.
   */
  const parRang = new Map<number, string>();

  for (const code of codes) {
    if (!/^\d{5}$/.test(code)) continue;
    if (!code.startsWith(ville.departement)) continue;

    const rang = Number(code.slice(-2));
    if (rang < 1 || rang > ville.dernier) continue;

    const connu = parRang.get(rang);
    if (!connu || code < connu) parRang.set(rang, code);
  }

  if (parRang.size === 0) return [{ nom, codePostal: codes[0] ?? "" }];

  return [...parRang.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rang, code]) => ({ nom: nom + " " + ordinal(rang), codePostal: code }));
}

/**
 * Le lieu de naissance tel qu'il s'écrit dans les actes : « Lyon 3e (69003) ».
 *
 * Le format vient de `domain/formalite/gabarit.ts`, qui compose déjà la phrase des
 * actes ainsi. L'écran qui laisse choisir doit écrire ce que l'acte attend, sinon la
 * saisie est à reprendre au moment de la rédaction.
 */
export function lieuAvecCode(nom: string, codePostal: string): string {
  return codePostal ? nom + " (" + codePostal + ")" : nom;
}
