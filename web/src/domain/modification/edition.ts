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
  /**
   * Les autres formulations à essayer.
   *
   * « 23 ans » et « 23 années » désignent la même durée, et un acte emploie l'une ou
   * l'autre. Les chercher séparément produisait deux lignes introuvables pour un seul
   * changement : le panneau annonçait trois manques là où il n'y en avait qu'un.
   */
  variantes?: string[];
  /**
   * Les mots qui nomment l'article visé.
   *
   * Quand la valeur ne se retrouve pas - les statuts l'écrivent en toutes lettres, ou
   * la reconnaissance de caractères l'a mal lue - on sait au moins mener l'avocat à
   * l'article. « Introuvable » sans rien d'autre l'oblige à parcourir vingt pages.
   */
  ancre?: string[];
  /** Ce qu'il faudrait écrire à la place. */
  propose: string;
}

/** Une recherche qui n'a pas abouti, et ce qu'on sait quand même. */
export interface Introuvable {
  recherche: Recherche;
  /** L'article a été localisé : de quoi y mener, et y poser le cadre. */
  article?: Rectangle;
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
 * Les zones à retoucher, et ce qui n'a pas été retrouvé.
 *
 * Une recherche infructueuse n'est pas une erreur : les statuts formulent librement,
 * et une numérisation se lit mal. C'est en revanche une information capitale, et la
 * première version la perdait - seules les zones trouvées étaient rendues. L'avocat
 * croyait avoir tout remplacé, et un article restait à l'ancienne valeur dans un
 * document qui part au greffe.
 *
 * Les introuvables reviennent donc avec le texte cherché, pour qu'il pose la zone
 * lui-même. Rien n'est appliqué sans qu'il l'ait vu.
 */
export function reperage(
  mots: Mot[],
  recherches: Recherche[]
): { zones: Zone[]; introuvables: Introuvable[] } {
  const zones: Zone[] = [];
  const manques: Recherche[] = [];

  for (const recherche of recherches) {
    // Chaque formulation est essayée : un acte écrit « 23 ans » ou « 23 années ».
    const essais = [recherche.cherche, ...(recherche.variantes ?? [])];
    const situes = essais.map((essai) => situer(mots, essai)).find((t) => t && t.length > 0);

    if (!situes) {
      manques.push(recherche);
      continue;
    }

    const rectangles = rectanglesDe(situes);
    const taille = Math.min(...situes.map((m) => m.hauteur));

    zones.push({
      ...recherche,
      rectangles,
      trouve: situes.map((m) => m.texte).join(" "),
      taille,
    });
  }

  /*
   * Un repli trouvé rend son manque sans objet.
   *
   * Un transfert cherche l'adresse complète, puis la voie seule au cas où les statuts
   * n'écrivent pas le code postal sur la même ligne. Si la seconde aboutit, signaler
   * la première ferait chercher un passage déjà couvert.
   */
  const introuvables = manques
    .filter((r) => !zones.some((z) => z.cle === r.cle))
    .map((recherche) => ({ recherche, article: situerLArticle(mots, recherche.ancre) }));

  return { zones, introuvables };
}

/**
 * Où se trouve l'article visé, à défaut de la valeur.
 *
 * On cherche son intitulé - « DURÉE », « DÉNOMINATION SOCIALE » - qui figure en tête
 * de l'article dans tous les statuts. C'est ce qui permet de mener l'avocat au bon
 * endroit même quand la valeur y est écrite autrement qu'on ne l'attendait.
 */
export function situerLArticle(mots: Mot[], ancre: string[] | undefined): Rectangle | undefined {
  for (const intitule of ancre ?? []) {
    const situes = situer(mots, intitule);
    if (situes && situes.length > 0) return rectanglesDe(situes)[0];
  }
  return undefined;
}

/** Les seules zones retrouvées, quand l'appelant n'a que faire du reste. */
export function reperer(mots: Mot[], recherches: Recherche[]): Zone[] {
  return reperage(mots, recherches).zones;
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
        // La rue seule, au cas où les statuts n'écrivent pas le code postal sur la
        // même ligne que la voie. C'est fréquent, et la recherche complète échoue.
        variantes: [texte(societe.adresse)].filter(Boolean),
        ancre: ["siège social", "siege social"],
        propose: nouvelle,
      });
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
        ancre: ["dénomination sociale", "denomination sociale", "dénomination"],
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
        ancre: ["objet social", "objet"],
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
      ancre: ["capital social", "capital"],
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
        cherche: ancienne + " années",
        // Un acte écrit l'une ou l'autre : les chercher séparément annonçait deux
        // manques pour un seul changement.
        variantes: [ancienne + " ans", ancienne],
        ancre: ["durée"],
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
/**
 * La police d'une retouche.
 *
 * Les statuts sont presque toujours composés en serif - c'est ce que rendent les
 * traitements de texte par défaut sur un acte. Écrire la nouvelle valeur en sans
 * serif à côté de l'ancienne se voit immédiatement, et fait douter du document.
 */
export type Police =
  | "serif"
  | "sans"
  | "mono"
  | "garamond"
  | "lato"
  | "calibri"
  | "georgia";

/*
 * Les trois premières sont les polices standard du format PDF : elles ne pèsent rien
 * et sont présentes partout. Les deux suivantes sont embarquées dans le document -
 * quatre fichiers chacune, le gras et l'italique d'une police n'étant pas un réglage
 * mais une autre police.
 */
export const POLICES: { valeur: Police; libelle: string; embarquee?: boolean }[] = [
  { valeur: "serif", libelle: "Times New Roman" },
  { valeur: "sans", libelle: "Arial" },
  { valeur: "georgia", libelle: "Georgia", embarquee: true },
  { valeur: "calibri", libelle: "Calibri", embarquee: true },
  { valeur: "garamond", libelle: "EB Garamond", embarquee: true },
  { valeur: "lato", libelle: "Lato", embarquee: true },
  { valeur: "mono", libelle: "Courier" },
];

/**
 * Les familles à embarquer, et le nom de leurs fichiers.
 *
 * Calibri et Georgia appartiennent à Microsoft et ne se redistribuent pas. On emploie
 * leurs équivalents libres métriquement compatibles - Carlito et Gelasio - qui ont
 * exactement les mêmes chasses : un texte composé dans l'une occupe le même espace
 * que dans l'autre, au point près. C'est la substitution que fait LibreOffice depuis
 * toujours, et c'est ce qui compte pour un acte dont on retouche un passage au milieu
 * d'un texte existant.
 *
 * Times New Roman et Arial n'y figurent pas : le format PDF garantit Times et
 * Helvetica, qui leur sont métriquement identiques et ne pèsent rien.
 */
export const POLICES_EMBARQUEES: Record<string, string> = {
  garamond: "EBGaramond",
  lato: "Lato",
  calibri: "Carlito",
  georgia: "Gelasio",
};

/** Où le texte se pose dans son cadre. */
export type Alignement = "gauche" | "centre" | "droite";

export const ALIGNEMENTS: { valeur: Alignement; libelle: string }[] = [
  { valeur: "gauche", libelle: "Aligner à gauche" },
  { valeur: "centre", libelle: "Centrer" },
  { valeur: "droite", libelle: "Aligner à droite" },
];

/**
 * Un morceau de texte et sa mise en forme.
 *
 * Une retouche portait un style unique : mettre un seul mot en gras demandait de
 * poser un second cadre à côté, à la main, en devinant où finissait le premier. Le
 * texte se découpe donc en morceaux, chacun avec son gras, son italique et son
 * souligné.
 *
 * La police et la taille restent celles du cadre : dans un acte, on met un mot en
 * gras, on ne change pas de police au milieu d'une phrase.
 */
export interface Fragment {
  texte: string;
  gras?: boolean;
  italique?: boolean;
  souligne?: boolean;
}

export interface Retouche {
  page: number;
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  texte: string;
  /** Taille de police. Sous la hauteur du rectangle, faute de quoi le texte déborde. */
  taille: number;
  /** Serif par défaut : c'est la composition ordinaire d'un acte. */
  police?: Police;
  gras?: boolean;
  italique?: boolean;
  souligne?: boolean;
  /** À gauche par défaut, comme le texte courant d'un acte. */
  alignement?: Alignement;
  /**
   * Le texte découpé, quand il porte plusieurs mises en forme.
   *
   * Absent, c'est le texte entier au style du cadre - la forme d'origine, que les
   * dossiers ouverts avant gardent.
   */
  fragments?: Fragment[];
}

/**
 * Les morceaux d'une retouche, quelle que soit sa forme.
 *
 * Sans découpage, le texte entier au style du cadre. C'est ce qui permet au reste du
 * code de ne connaître qu'une seule façon de lire une retouche.
 */
export function fragmentsDe(retouche: Retouche): Fragment[] {
  const decoupes = (retouche.fragments ?? []).filter((f) => f.texte.length > 0);
  if (decoupes.length > 0) return decoupes;

  return retouche.texte
    ? [
        {
          texte: retouche.texte,
          gras: retouche.gras,
          italique: retouche.italique,
          souligne: retouche.souligne,
        },
      ]
    : [];
}

/** Le texte entier d'une retouche, sans sa mise en forme. */
export function texteDe(retouche: Retouche): string {
  return retouche.fragments?.length
    ? retouche.fragments.map((f) => f.texte).join("")
    : retouche.texte;
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
      /*
       * Arrondie au dixième.
       *
       * La taille vient de la hauteur mesurée des mots, qui tombe sur des flottants :
       * le champ affichait « 14.400000000000006 », qu'on ne peut ni lire ni corriger.
       */
      taille: Math.round(zone.taille * 10) / 10,
      police: "serif",
      gras: false,
      italique: false,
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
