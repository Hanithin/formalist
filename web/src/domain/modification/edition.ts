import { ARTICLE_VISE } from "./formalites";
import type { Valeurs } from "./types";
import type { SocieteModifiee } from "./gabarit";

/**
 * Retoucher les statuts sans les réécrire.
 *
 * Rédiger des statuts à jour à partir d'un PDF déposé il y a six ans demande de
 * retaper le document entier, ou de le reconstruire au jugé. Les deux se font, les
 * deux prennent une heure, et les deux introduisent des écarts avec l'original que
 * personne ne relit ligne à ligne.
 *
 * On travaille donc sur le document tel qu'il est. Les mots du PDF portent leurs
 * coordonnées ; on retrouve le passage à changer - l'ancienne adresse, l'ancien nom,
 * l'ancien capital - on pose un rectangle blanc dessus, et le nouveau texte par-dessus.
 * Le reste du document ne bouge pas d'un point.
 *
 * Ce module ne connaît ni PDF ni OCR : il reçoit des mots situés et rend des zones.
 * C'est ce qui permet de le tester sans fichier, et de changer la source des mots -
 * couche texte ou reconnaissance de caractères - sans y toucher.
 */

/** Un mot du document, situé. L'origine est en haut à gauche de la page. */
export interface Mot {
  page: number;
  texte: string;
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

export interface Recherche {
  /** Le code de modification qui motive la retouche. */
  cle: string;
  /** L'article des statuts visé, pour situer la retouche à l'écran. */
  article: string;
  /** Le texte à retrouver dans les statuts. */
  cherche: string;
  /** Ce qu'il faudrait écrire à la place. */
  propose: string;
}

/** Un rectangle à couvrir, sur une ligne. */
export interface Rectangle {
  page: number;
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

export interface Zone extends Recherche {
  /** Un rectangle par ligne : un passage peut se replier sur deux lignes. */
  rectangles: Rectangle[];
  /** Le texte réellement trouvé, tel qu'il figure dans le document. */
  trouve: string;
  /** Hauteur de police estimée, pour écrire par-dessus à la bonne taille. */
  taille: number;
}

/* -------------------------------------------------------------- Comparaison */

/**
 * La forme sous laquelle deux textes se comparent.
 *
 * Les statuts écrivent « SIÈGE SOCIAL » en capitales accentuées, le formulaire
 * « siège social », et une reconnaissance de caractères rend parfois « SIEGE ». Les
 * espaces des montants varient aussi - « 15 000 », « 15000 », « 15 000 » avec une
 * insécable. On ramène tout à des lettres et des chiffres.
 */
export function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Les mots d'un texte, normalisés, sans les vides. */
function jetons(texte: string): string[] {
  const normalise = normaliser(texte);
  return normalise ? normalise.split(" ") : [];
}

/* ------------------------------------------------------------- Localisation */

/**
 * Les rectangles couvrant une suite de mots.
 *
 * Un par ligne : un passage qui se replie donnerait, en un seul rectangle, un pavé
 * blanc couvrant tout ce qui se trouve entre les deux lignes. On regroupe donc par
 * ordonnée, avec une tolérance - les mots d'une même ligne ne partagent pas toujours
 * exactement le même y.
 */
function rectanglesDe(mots: Mot[]): Rectangle[] {
  const lignes: Mot[][] = [];

  for (const mot of mots) {
    const ligne = lignes.find(
      (l) => l[0].page === mot.page && Math.abs(l[0].y - mot.y) <= Math.max(2, mot.hauteur * 0.5)
    );
    if (ligne) ligne.push(mot);
    else lignes.push([mot]);
  }

  return lignes.map((ligne) => {
    const gauche = Math.min(...ligne.map((m) => m.x));
    const droite = Math.max(...ligne.map((m) => m.x + m.largeur));
    const haut = Math.min(...ligne.map((m) => m.y));
    const bas = Math.max(...ligne.map((m) => m.y + m.hauteur));

    return {
      page: ligne[0].page,
      x: gauche,
      y: haut,
      largeur: droite - gauche,
      hauteur: bas - haut,
    };
  });
}

/**
 * La suite de mots qui correspond à une recherche.
 *
 * On compare jeton à jeton plutôt que caractère à caractère : un mot du PDF peut
 * contenir la ponctuation qui le suit - « Paris. » - et une comparaison de chaînes
 * échouerait là où l'œil ne voit aucune différence.
 */
export function situer(mots: Mot[], cherche: string): Mot[] | null {
  const attendus = jetons(cherche);
  if (attendus.length === 0) return null;

  // Chaque mot du document peut porter plusieurs jetons : « 12, » en donne un,
  // « 75002 Paris » n'arrive pas, mais « L'article » en donne deux.
  const aplati: { jeton: string; mot: Mot }[] = [];
  for (const mot of mots) {
    for (const jeton of jetons(mot.texte)) aplati.push({ jeton, mot });
  }

  for (let debut = 0; debut + attendus.length <= aplati.length; debut++) {
    let concorde = true;
    for (let i = 0; i < attendus.length; i++) {
      if (aplati[debut + i].jeton !== attendus[i]) {
        concorde = false;
        break;
      }
    }
    if (!concorde) continue;

    const retenus: Mot[] = [];
    for (let i = 0; i < attendus.length; i++) {
      const mot = aplati[debut + i].mot;
      if (!retenus.includes(mot)) retenus.push(mot);
    }
    return retenus;
  }

  return null;
}

/**
 * Les zones à retoucher.
 *
 * Une recherche introuvable n'est pas une erreur : les statuts peuvent formuler
 * autrement, ou la reconnaissance de caractères peut avoir mal lu. Elle est
 * simplement absente du résultat, et l'avocat pose la zone à la main. Rien n'est
 * appliqué sans qu'il l'ait vu.
 */
export function reperer(mots: Mot[], recherches: Recherche[]): Zone[] {
  const zones: Zone[] = [];

  for (const recherche of recherches) {
    const situes = situer(mots, recherche.cherche);
    if (!situes || situes.length === 0) continue;

    const rectangles = rectanglesDe(situes);
    const taille = Math.min(...situes.map((m) => m.hauteur));

    zones.push({
      ...recherche,
      rectangles,
      trouve: situes.map((m) => m.texte).join(" "),
      taille,
    });
  }

  return zones;
}

/* ------------------------------------------------------- Quoi chercher, où */

function texte(valeur: string | number | null | undefined): string {
  if (typeof valeur === "number") return String(valeur);
  return typeof valeur === "string" ? valeur.trim() : "";
}

function adresse(rue: string, codePostal: string, ville: string): string {
  const fin = [codePostal, ville].filter(Boolean).join(" ");
  return [rue, fin].filter(Boolean).join(", ");
}

/**
 * Ce qu'il faut retrouver dans les statuts, pour chaque changement décidé.
 *
 * On cherche l'ancienne valeur plutôt que le titre de l'article : « ARTICLE 4 » ne
 * dit pas où finit le passage à couvrir, alors que l'ancienne adresse le dit
 * exactement. Et nous l'avons déjà - c'est celle du registre.
 *
 * Le changement de dirigeant n'y figure pas : sauf à ce que les statuts nomment le
 * gérant, ils n'ont rien à dire de lui.
 */
export function recherchesPour(
  codes: string[],
  valeurs: Valeurs,
  societe: SocieteModifiee
): Recherche[] {
  const recherches: Recherche[] = [];

  const article = (code: keyof typeof ARTICLE_VISE) => ARTICLE_VISE[code] ?? "";

  if (codes.includes("transfert_siege")) {
    const ancienne = adresse(
      texte(societe.adresse),
      texte(societe.codePostal),
      texte(societe.ville)
    );
    const nouvelle = adresse(
      texte(valeurs.nouvelleAdresse),
      texte(valeurs.nouveauCodePostal),
      texte(valeurs.nouvelleVille)
    );
    if (ancienne && nouvelle) {
      recherches.push({
        cle: "transfert_siege",
        article: article("transfert_siege"),
        cherche: ancienne,
        propose: nouvelle,
      });
      // La rue seule, au cas où les statuts n'écrivent pas le code postal sur la
      // même ligne que la voie. C'est fréquent, et la recherche complète échoue.
      if (texte(societe.adresse)) {
        recherches.push({
          cle: "transfert_siege",
          article: article("transfert_siege"),
          cherche: texte(societe.adresse),
          propose: texte(valeurs.nouvelleAdresse),
        });
      }
    }
  }

  if (codes.includes("denomination")) {
    const ancienne = texte(societe.denomination);
    const nouvelle = texte(valeurs.nouvelleDenomination);
    if (ancienne && nouvelle) {
      recherches.push({
        cle: "denomination",
        article: article("denomination"),
        cherche: ancienne,
        propose: nouvelle,
      });
    }
  }

  if (codes.includes("objet_social")) {
    const ancien = texte(valeurs.objetSocialActuel);
    const nouveau = texte(valeurs.nouvelObjetSocial);
    if (ancien && nouveau) {
      recherches.push({
        cle: "objet_social",
        article: article("objet_social"),
        cherche: ancien,
        propose: nouveau,
      });
    }
  }

  for (const [code, avant, apres] of [
    ["augmentation_capital", valeurs.capitalActuelAugm, valeurs.nouveauCapitalAugm],
    ["reduction_capital", valeurs.capitalActuelRed, valeurs.nouveauCapitalRed],
  ] as const) {
    if (!codes.includes(code)) continue;
    const ancien = texte(avant) || texte(societe.capital ?? undefined);
    const nouveau = texte(apres);
    if (!ancien || !nouveau) continue;

    recherches.push({
      cle: code,
      article: article(code),
      cherche: ancien,
      propose: nouveau,
    });
  }

  if (codes.includes("prorogation")) {
    const ancienne = texte(valeurs.dureeActuelle);
    const nouvelle = texte(valeurs.nouvelleDuree);
    if (ancienne && nouvelle) {
      recherches.push({
        cle: "prorogation",
        article: article("prorogation"),
        cherche: ancienne + " ans",
        propose: nouvelle + " ans",
      });
      recherches.push({
        cle: "prorogation",
        article: article("prorogation"),
        cherche: ancienne + " années",
        propose: nouvelle + " années",
      });
    }
  }

  return recherches;
}

/* -------------------------------------------------------------- Retouches */

/**
 * Ce que l'avocat valide, et qui sera appliqué au PDF.
 *
 * Distinct d'une zone : une zone est ce qu'on a trouvé, une retouche est ce qu'on a
 * décidé. L'avocat peut déplacer le rectangle, corriger le texte, en ajouter un que
 * rien n'a repéré, ou en supprimer un qui tombait à côté.
 */
export interface Retouche {
  page: number;
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  texte: string;
  /** Taille de police. Sous la hauteur du rectangle, faute de quoi le texte déborde. */
  taille: number;
}

/** Les retouches proposées à partir des zones repérées. */
export function retouchesProposees(zones: Zone[]): Retouche[] {
  return zones.flatMap((zone) =>
    zone.rectangles.map((rectangle, rang) => ({
      page: rectangle.page,
      x: rectangle.x,
      y: rectangle.y,
      largeur: rectangle.largeur,
      hauteur: rectangle.hauteur,
      // Le passage replié sur deux lignes ne reçoit le nouveau texte que sur la
      // première : le reste est couvert, sans quoi le texte serait écrit deux fois.
      texte: rang === 0 ? zone.propose : "",
      taille: zone.taille,
    }))
  );
}

export class RetoucheInvalide extends Error {
  readonly statut = 400;
}

/**
 * Une retouche tient-elle dans la page ?
 *
 * Un rectangle hors page ne se voit pas et ne couvre rien : la retouche paraîtrait
 * appliquée alors que l'ancienne valeur resterait lisible dans le document déposé.
 */
export function verifierRetouche(
  retouche: Retouche,
  page: { largeur: number; hauteur: number }
): void {
  const dans =
    retouche.x >= 0 &&
    retouche.y >= 0 &&
    retouche.largeur > 0 &&
    retouche.hauteur > 0 &&
    retouche.x + retouche.largeur <= page.largeur + 1 &&
    retouche.y + retouche.hauteur <= page.hauteur + 1;

  if (!dans) throw new RetoucheInvalide("Une retouche sort de la page");
  if (retouche.taille <= 0 || retouche.taille > 72) {
    throw new RetoucheInvalide("Taille de texte hors limites");
  }
}
