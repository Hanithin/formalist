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
  /** SASU, SARL… ; elle précède le nom dans le titre du groupe. */
  forme: string | null;
  /** L'identifiant de la pièce attendue, pour pouvoir la remplacer. */
  type: string | null;
  /**
   * L'acte est chez l'avocat, qui le relit ou le retouche.
   *
   * Il figure dans la bibliothèque sans être remis : la cacher jusqu'à la relecture
   * donnait une bibliothèque vide juste après le règlement, et l'on rappelait pour
   * demander où étaient les actes qu'on venait de payer. Sans son fichier, donc :
   * l'écran n'a rien avec quoi l'ouvrir, la règle tient par ce que la forme ne porte
   * pas.
   */
  enRelecture: boolean;
  /**
   * Le document répond-il à une pièce que le dossier attend ?
   *
   * Sans cette réponse, l'interface proposait « Remplacer » pour tout document refusé,
   * y compris ceux dont le type ne correspond à aucune pièce attendue : le dépôt était
   * alors refusé par le serveur, et on se retrouvait devant un cul-de-sac après avoir
   * choisi son fichier.
   */
  remplacable: boolean;
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

/**
 * Un rejet cesse de compter dès qu'une pièce plus récente le remplace.
 *
 * L'avocat rejette un fichier précis, et le motif reste sur cette ligne : c'est ce qui
 * dit pourquoi il ne convenait pas. Mais une fois la nouvelle pièce déposée, laisser
 * l'ancienne réclamer une action ferait croire que rien n'a été fait - on redéposerait
 * indéfiniment le même document.
 *
 * La comparaison porte sur le dossier et le type de pièce : deux pièces d'identité du
 * même dossier se succèdent, une pièce d'identité et une attestation ne se remplacent
 * pas.
 */
export function resoudreRejets(documents: DocumentRange[]): DocumentRange[] {
  const plusRecent = new Map<string, number>();

  for (const d of documents) {
    if (d.societeId === null || !d.type) continue;
    const cle = d.societeId + "|" + d.type;
    const quand = d.creeLe?.getTime() ?? 0;
    plusRecent.set(cle, Math.max(plusRecent.get(cle) ?? 0, quand));
  }

  return documents.map((d) => {
    if (!d.motifRejet || d.societeId === null || !d.type) return d;

    const dernier = plusRecent.get(d.societeId + "|" + d.type) ?? 0;
    const remplace = dernier > (d.creeLe?.getTime() ?? 0);
    return remplace ? { ...d, motifRejet: null } : d;
  });
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

/* ---------- L'ordre des actes ---------- */

/**
 * L'ordre dans lequel on cherche les actes d'une société.
 *
 * Il n'est ni alphabétique ni chronologique : les statuts viennent en premier parce
 * que c'est la pièce qu'on redemande le plus souvent - une banque, un bailleur, un
 * client la réclament -, puis le Kbis qui prouve l'existence, puis les actes de
 * constitution dans l'ordre où on les lit. Le classement par date mettait en tête le
 * dernier document produit, qui n'est presque jamais celui qu'on vient chercher.
 *
 * Ce qui n'est pas listé passe après, du plus récent au plus ancien.
 */
const ORDRE_DES_ACTES = [
  "statuts",
  "kbis",
  "proces-verbal",
  "pv ",
  "liste des souscripteurs",
  "declaration de non-condamnation",
  "attestation de domiciliation",
  "depot de capital",
  "annonce legale",
];

export function rangDeLActe(nom: string): number {
  const propre = aplati(nom);
  const rang = ORDRE_DES_ACTES.findIndex((cle) => propre.startsWith(cle));
  // Le reste ferme la marche, sans distinction entre ses éléments.
  return rang === -1 ? ORDRE_DES_ACTES.length : rang;
}

/* ---------- Rangement ---------- */

export interface GroupeDeDocuments {
  /** Nul pour le groupe des dépôts personnels. */
  societeId: number | null;
  titre: string;
  /** Ce qui distingue deux groupes de même nom ; absent quand le nom suffit. */
  precision?: string;
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
 * « SASU ATELIER MERIDIEN » plutôt que « ATELIER MERIDIEN ».
 *
 * La forme fait partie de la dénomination : c'est ainsi qu'une société se désigne sur
 * ses statuts et ses factures. Elle distingue aussi deux dossiers d'une même enseigne
 * - une SASU et la SCI qui porte ses murs - sans avoir à ouvrir les deux.
 *
 * Elle n'est pas répétée quand le nom la porte déjà : certains clients saisissent
 * « SASU Untel » dans le champ de dénomination.
 */
export function titreDeSociete(societe: string | null, forme: string | null): string {
  const nom = (societe ?? "").trim();
  const type = (forme ?? "").trim().toUpperCase();

  if (!nom) return TITRE_SANS_NOM;
  if (!type || aplati(nom).startsWith(aplati(type) + " ")) return nom;
  return type + " " + nom;
}

/**
 * Range les documents par société.
 *
 * Deux ordres se superposent. Entre les groupes : la société dont un document est le
 * plus récent d'abord - on vient chercher ce qui vient d'arriver, non la première
 * lettre de l'alphabet - et les dépôts personnels en dernier, qui n'appartiennent à
 * aucun dossier. Dans un groupe : ce qui attend une action d'abord, le reste du plus
 * récent au plus ancien.
 */
/** La date du document le plus récent d'un groupe. */
function dernierDepot(groupe: GroupeDeDocuments): number {
  return groupe.documents.reduce((plus, d) => Math.max(plus, d.creeLe?.getTime() ?? 0), 0);
}

export function grouper(documents: DocumentRange[]): GroupeDeDocuments[] {
  const groupes = new Map<string, GroupeDeDocuments>();

  for (const document of documents) {
    const cle = document.societeId === null ? "sans-societe" : String(document.societeId);
    const groupe = groupes.get(cle) ?? {
      societeId: document.societeId,
      titre:
        document.societeId === null
          ? TITRE_SANS_SOCIETE
          : titreDeSociete(document.societe, document.forme),
      documents: [],
    };
    groupe.documents.push(document);
    groupes.set(cle, groupe);
  }

  for (const groupe of groupes.values()) {
    groupe.documents.sort((a, b) => {
      // Ce qui bloque un dossier d'abord, puis l'ordre dans lequel on cherche un
      // acte, puis le plus récent - qui ne départage que ce que rien d'autre ne
      // sépare.
      if (aRemplacer(a) !== aRemplacer(b)) return aRemplacer(a) ? -1 : 1;

      const rang = rangDeLActe(a.nom) - rangDeLActe(b.nom);
      if (rang !== 0) return rang;

      return (b.creeLe?.getTime() ?? 0) - (a.creeLe?.getTime() ?? 0);
    });
  }

  return [...groupes.values()].sort((a, b) => {
    if (a.societeId === null) return 1;
    if (b.societeId === null) return -1;

    /*
     * La société dont un document est le plus récent passe devant.
     *
     * L'ordre alphabétique donnait l'illusion d'un classement chronologique tant que
     * les noms tombaient bien, et rangeait une société créée hier derrière une autre
     * dont le dernier acte date d'un an.
     */
    const ecart = dernierDepot(b) - dernierDepot(a);
    if (ecart !== 0) return ecart;

    // À dates égales, l'alphabet départage plutôt qu'un ordre au hasard.
    return a.titre.localeCompare(b.titre, "fr");
  });
}

/**
 * Distingue les groupes qui portent le même nom.
 *
 * Deux dossiers peuvent s'appeler pareil - deux créations pour la même enseigne, ou
 * deux dossiers encore sans nom. À l'écran, deux blocs identiques ressemblent à un
 * doublon, et on ne sait pas lequel ouvrir. Leur référence les sépare, et n'apparaît
 * que là où elle sert : l'ajouter partout ajouterait du bruit à ce qui est déjà clair.
 */
export function distinguer(groupes: GroupeDeDocuments[]): GroupeDeDocuments[] {
  const occurrences = new Map<string, number>();
  for (const groupe of groupes) {
    occurrences.set(groupe.titre, (occurrences.get(groupe.titre) ?? 0) + 1);
  }

  return groupes.map((groupe) =>
    (occurrences.get(groupe.titre) ?? 0) > 1 && groupe.societeId !== null
      ? { ...groupe, precision: reference(groupe.societeId) }
      : groupe
  );
}

/** La référence d'un dossier, telle que l'espace avocat l'écrit déjà : #0042. */
export function reference(dossierId: number): string {
  return "#" + String(dossierId).padStart(4, "0");
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
 * Quatre règles, dans cet ordre. Le groupe qui vient de recevoir un dépôt s'ouvre :
 * on annonce « vous le retrouverez dans sa société », et le document restait invisible
 * derrière un groupe replié - l'annonce devenait fausse. Une recherche en cours ouvre
 * tout : on vient de demander ces documents, les cacher derrière un clic serait
 * absurde. Un groupe qui contient un document à remplacer s'ouvre toujours : c'est ce
 * qui bloque un dossier, et le replier reviendrait à le cacher. Sinon, on n'ouvre que
 * si les groupes sont peu nombreux.
 */
export function ouvertParDefaut(
  groupe: GroupeDeDocuments,
  nombreDeGroupes: number,
  recherche = "",
  /** La société du dernier dépôt ; `undefined` quand rien n'a été déposé. */
  dernierDepot?: number | null
): boolean {
  if (dernierDepot !== undefined && groupe.societeId === dernierDepot) return true;
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

/* ---------- Ce qui s'affiche dans le navigateur ---------- */

/**
 * Le format se prête-t-il à un aperçu ?
 *
 * Un PDF et une image s'affichent dans un cadre ; un Word se télécharge. Le savoir
 * avant d'ouvrir la fenêtre évite d'y montrer un cadre vide, ou pire, de déclencher
 * un téléchargement que personne n'a demandé.
 *
 * Les actes produits par la plateforme sont figés en PDF au moment de leur
 * génération : ils tombent donc du bon côté.
 */
const FORMATS_AFFICHABLES = [".pdf", ".png", ".jpg", ".jpeg"];

export function affichable(fichier: string | null): boolean {
  if (!fichier) return false;
  const point = fichier.lastIndexOf(".");
  return point > 0 && FORMATS_AFFICHABLES.includes(fichier.slice(point).toLowerCase());
}
