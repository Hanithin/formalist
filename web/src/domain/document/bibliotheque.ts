/**
 * La bibliothèque de documents : ce qu'on y cherche, et comment on le range.
 *
 * Les documents viennent de trois endroits - ceux produits sur un dossier, les
 * fichiers de contrats, et ce que le client dépose lui-même - mais celui qui cherche
 * un document ne pense pas en ces termes. Il pense « les statuts de ma SASU ». Le
 * rangement se fait donc par société, et l'origine n'est qu'un filtre.
 */

export type OrigineDocument = "entreprise" | "contrat" | "upload";

export interface DocumentRange {
  id: string;
  nom: string;
  statut: string | null;
  motifRejet: string | null;
  origine: OrigineDocument;
  /** Nom de la société de rattachement ; nul pour un dépôt personnel. */
  societe: string | null;
  societeId: number | null;
  fichier: string | null;
  creeLe: Date | null;
  /** Renseigné pour un fichier de contrat : il mène à son suivi. */
  contratId: number | null;
}

/** Au-delà, la liste des sociétés ne se parcourt plus à l'œil. */
export const SEUIL_RECHERCHE = 3;

/**
 * Un document attend-il quelque chose du client ?
 *
 * Le marqueur est le motif de rejet, et non un statut : la table n'accepte que
 * generated, uploaded, signed et verified - une contrainte le vérifie - et « rejeté »
 * n'en fait pas partie. C'est le motif renseigné par l'avocat qui dit qu'un document
 * ne convient pas, et c'est déjà la règle qu'applique etatDocument.
 *
 * C'est la seule question qui change l'ordre d'affichage : un document refusé bloque
 * un dossier tant qu'il n'est pas remplacé, et le laisser à son rang chronologique le
 * noierait au milieu de ceux qui n'appellent aucune action.
 */
export function aRemplacer(document: { motifRejet: string | null }): boolean {
  return !!document.motifRejet;
}

/* ---------- Filtres ---------- */

export function retenu(document: DocumentRange, filtre: string): boolean {
  return filtre === "tous" || document.origine === filtre;
}

export function comptesParFiltre(documents: DocumentRange[]): Record<string, number> {
  return {
    tous: documents.length,
    entreprise: documents.filter((d) => d.origine === "entreprise").length,
    contrat: documents.filter((d) => d.origine === "contrat").length,
    upload: documents.filter((d) => d.origine === "upload").length,
  };
}

/* ---------- Recherche ---------- */

/** Sans accents ni casse : « société » se trouve en tapant « societe ». */
function aplati(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * La recherche porte sur le nom du document et sur celui de sa société.
 *
 * Chercher « meridien » doit rendre tous les documents de cette société, même ceux
 * dont le nom ne contient pas le mot : c'est ainsi qu'on cherche quand on ne se
 * souvient plus du nom exact d'un acte.
 */
export function correspond(document: DocumentRange, recherche: string): boolean {
  const terme = aplati(recherche.trim());
  if (!terme) return true;

  return aplati(document.nom).includes(terme) || aplati(document.societe ?? "").includes(terme);
}

/* ---------- Rangement ---------- */

export interface GroupeDeDocuments {
  /** Nul pour le groupe des dépôts personnels. */
  societeId: number | null;
  titre: string;
  documents: DocumentRange[];
}

export const TITRE_SANS_SOCIETE = "Mes dépôts";

/**
 * Un dossier existe avant d'être nommé.
 *
 * Sa société est alors vide, et le groupe s'affichait sans titre : une pile de
 * documents sous un espace blanc, qu'on ne peut ni nommer ni distinguer d'un autre.
 * C'est la même mention que dans le tableau du cabinet.
 */
export const TITRE_SANS_NOM = "Sans nom";

/**
 * Range les documents par société.
 *
 * Deux ordres se superposent. Entre les groupes : les sociétés par ordre
 * alphabétique, et les dépôts personnels en dernier - ils n'appartiennent à aucun
 * dossier, les placer en tête ferait chercher plus loin ce qu'on vient voir. Dans un
 * groupe : ce qui attend une action d'abord, le reste du plus récent au plus ancien.
 */
export function grouper(documents: DocumentRange[]): GroupeDeDocuments[] {
  const groupes = new Map<string, GroupeDeDocuments>();

  for (const document of documents) {
    const cle = document.societeId === null ? "sans-societe" : String(document.societeId);
    const groupe = groupes.get(cle) ?? {
      societeId: document.societeId,
      titre:
        document.societeId === null
          ? TITRE_SANS_SOCIETE
          : document.societe?.trim() || TITRE_SANS_NOM,
      documents: [],
    };
    groupe.documents.push(document);
    groupes.set(cle, groupe);
  }

  for (const groupe of groupes.values()) {
    groupe.documents.sort((a, b) => {
      if (aRemplacer(a) !== aRemplacer(b)) return aRemplacer(a) ? -1 : 1;
      return (b.creeLe?.getTime() ?? 0) - (a.creeLe?.getTime() ?? 0);
    });
  }

  return [...groupes.values()].sort((a, b) => {
    if (a.societeId === null) return 1;
    if (b.societeId === null) return -1;
    return a.titre.localeCompare(b.titre, "fr");
  });
}

/** Le nombre de sociétés distinctes, qui décide de l'affichage de la recherche. */
export function nombreDeSocietes(documents: DocumentRange[]): number {
  return new Set(documents.filter((d) => d.societeId !== null).map((d) => d.societeId)).size;
}

/* ---------- Ce qui est montré d'emblée ---------- */

/**
 * Au-delà, un groupe n'est plus une liste mais un mur.
 *
 * Huit documents tiennent dans un écran sans le remplir ; le reste se demande. Un
 * dossier de création en produit une douzaine à lui seul, et trois dossiers suffisent
 * alors à faire défiler la page sans jamais voir la fin.
 */
export const DOCUMENTS_MONTRES = 8;

/** Au-delà, tout ouvrir donne la page interminable qu'on cherche à éviter. */
export const GROUPES_OUVERTS = 3;

/**
 * Un groupe s'ouvre-t-il de lui-même ?
 *
 * Trois règles, dans cet ordre. Une recherche en cours ouvre tout : on vient de
 * demander ces documents, les cacher derrière un clic serait absurde. Un groupe qui
 * contient un document à remplacer s'ouvre toujours : c'est ce qui bloque un dossier,
 * et le replier reviendrait à le cacher. Sinon, on n'ouvre que si les groupes sont peu
 * nombreux.
 */
export function ouvertParDefaut(
  groupe: GroupeDeDocuments,
  nombreDeGroupes: number,
  recherche = ""
): boolean {
  if (recherche.trim()) return true;
  if (groupe.documents.some(aRemplacer)) return true;
  return nombreDeGroupes <= GROUPES_OUVERTS;
}

/**
 * Ce qu'on montre d'un groupe, et ce qui reste.
 *
 * Le reste ne disparaît pas : il s'affiche d'un clic, sans changer de page. Une
 * pagination obligerait à revenir en arrière pour comparer deux documents d'un même
 * dossier, ce qu'on fait justement dans une bibliothèque.
 */
export function tronquer<T>(documents: T[], tout: boolean): { montres: T[]; restants: number } {
  if (tout || documents.length <= DOCUMENTS_MONTRES) {
    return { montres: documents, restants: 0 };
  }
  return {
    montres: documents.slice(0, DOCUMENTS_MONTRES),
    restants: documents.length - DOCUMENTS_MONTRES,
  };
}
