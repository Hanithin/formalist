/**
 * La liste des formalités.
 *
 * Reprise de public/formalites.html : trois compteurs en tête, quatre filtres avec
 * leur décompte, une recherche, puis les dossiers en cartes paginées par six.
 *
 * Tout ce qui suit est du calcul pur, sans base ni interface : c'est là que se
 * vérifient les accords de langue, les seuils de date et les bords de la pagination.
 */

export interface DossierListe {
  id: number;
  type: string;
  societe: string | null;
  forme: string | null;
  status: string | null;
  phase: number | null;
  /** La sous-phase du cabinet : elle situe un dossier déjà confié. */
  sousPhase?: string | null;
  offre: string | null;
  banque: string | null;
  modifieLe: Date | null;
  nonLus: number;
  /**
   * Un dossier que rien n'a encore engagé : ni règlement, ni transmission au cabinet,
   * ni signature demandée. La carte l'annonce comme brouillon plutôt que d'annoncer
   * une étape en cours qui ne bouge pas, et lui seul porte la corbeille.
   */
  brouillon?: boolean;
  /**
   * Ce que le dossier attend, en trois mots - « Une signature manquante », « Compléter
   * les informations », « En révision par l'avocat ». Il remplace sur la carte le
   * pourcentage d'avancement, qui disait le remplissage d'un formulaire sans jamais
   * dire ce qui bloque.
   */
  etape?: string;
  /** Quelque chose arrête le dossier : une signature, une pièce refusée. */
  urgent?: boolean;
  /** La balle est dans le camp du client, qu'elle presse ou non. */
  attendLeClient?: boolean;
}

/* ---------- Le type d'un dossier ---------- */

/**
 * Les quatre natures de formalité, écrites pour être lues.
 *
 * Le type est enregistré sans accent - « creation », « depot » - et trois écrans en
 * gardaient chacun leur propre table de correspondance. Elle vit ici : « Dépôt des
 * comptes » ne s'écrit pas de trois façons selon la page qui l'affiche.
 */
const TYPES: Record<string, string> = {
  creation: "Création",
  modification: "Modification",
  fermeture: "Fermeture",
  comptes: "Dépôt des comptes",
  cessation: "Cessation d'auto-entreprise",
  depot: "Dépôt des comptes",
  "auto-entrepreneur": "Auto-entrepreneur",
};

/**
 * Un type inconnu se rend tel quel plutôt que vide : un dossier mal typé se voit,
 * au lieu de passer pour un dossier sans nature.
 */
export function libelleDuType(type: string | null | undefined): string | null {
  const brut = type?.trim();
  if (!brut) return null;
  return TYPES[brut] ?? brut.charAt(0).toUpperCase() + brut.slice(1);
}

/**
 * Le nom qu'un dossier porte tant qu'aucune société n'y est rattachée.
 *
 * Il sert de marqueur en base - c'est à lui qu'on reconnaît un dossier resté sur la
 * ligne de départ, et qu'on reprend au lieu d'en ouvrir un second. Il n'a jamais été
 * fait pour être lu : « Société à identifier » écrit sous « Vous travaillez sur »
 * ressemble à un nom de société, et l'on cherche laquelle.
 */
export const SOCIETE_A_IDENTIFIER = "Société à identifier";

/** Ce dossier porte-t-il encore son nom d'attente ? */
export function sansSociete(nom: string | null | undefined): boolean {
  const propre = (nom ?? "").trim();
  return propre === "" || propre === SOCIETE_A_IDENTIFIER;
}

/**
 * Le nom à écrire, ou rien.
 *
 * Rien plutôt qu'un nom d'attente : l'écran qui l'affiche sait mieux que nous quoi
 * mettre à la place - un type de formalité, un bandeau qui disparaît, une invitation
 * à choisir la société.
 */
export function nomAffichable(nom: string | null | undefined): string | null {
  return sansSociete(nom) ? null : (nom ?? "").trim();
}

/* ---------- Filtres ---------- */

/**
 * Toutes les valeurs qu'un filtre peut prendre, affichées ou non.
 *
 * `en_cours` n'a plus de pastille - c'est la réunion de `brouillon` et de
 * `chez_lavocat` - mais reste une valeur légale : les parts du portefeuille s'en
 * servent, et une adresse `?filtre=en_cours` partagée hier doit continuer d'ouvrir la
 * même liste aujourd'hui.
 */
export type ValeurFiltre =
  | "tous"
  | "brouillon"
  | "chez_lavocat"
  | "en_cours"
  | "en_attente"
  | "terminee";

/**
 * Les pastilles, dans l'ordre où un dossier les traverse.
 *
 * On le commence, on le confie, on répond à ce qu'on nous demande, il se termine. La
 * rangée se lit donc comme la vie d'un dossier, et ses comptes se partagent le total
 * sans se recouvrir - ce qui n'était pas le cas quand « En cours » y figurait, lui qui
 * contenait déjà tous les brouillons.
 *
 * « Toutes », non « Tous » : le mot s'accorde avec les formalités qu'il compte.
 */
export const FILTRES: { valeur: ValeurFiltre; libelle: string }[] = [
  { valeur: "tous", libelle: "Toutes" },
  { valeur: "brouillon", libelle: "Brouillons" },
  { valeur: "chez_lavocat", libelle: "Chez l'avocat" },
  { valeur: "en_attente", libelle: "En attente" },
  { valeur: "terminee", libelle: "Terminées" },
];

const VALEURS: ValeurFiltre[] = [
  "tous",
  "brouillon",
  "chez_lavocat",
  "en_cours",
  "en_attente",
  "terminee",
];

export function filtreValide(brut: string | null | undefined): ValeurFiltre {
  return VALEURS.some((v) => v === brut) ? (brut as ValeurFiltre) : "tous";
}

/**
 * Un dossier répond-il à ce filtre ?
 *
 * « En attente » n'est pas le complément de « en cours » : un dossier attend une
 * pièce ou une signature de la part du client, alors qu'un dossier en cours avance.
 * Les deux se distinguent, comme dans la page d'origine.
 *
 * `brouillon` et `chez_lavocat` fendent ce qui reste en deux, et de la seule façon qui
 * vaille pour qui regarde sa liste : ce qu'il lui reste à écrire, et ce qui est parti.
 */
export function retenu(dossier: DossierListe, filtre: ValeurFiltre): boolean {
  if (filtre === "tous") return true;
  if (filtre === "terminee") return dossier.status === "terminee";
  if (filtre === "en_attente") return dossier.status === "en_attente";

  const enCours = dossier.status !== "terminee" && dossier.status !== "en_attente";
  if (filtre === "brouillon") return enCours && dossier.brouillon === true;
  if (filtre === "chez_lavocat") return enCours && dossier.brouillon !== true;
  return enCours;
}

/**
 * Le décompte affiché à côté de chaque pastille.
 *
 * Les quatre états - brouillon, chez l'avocat, en attente, terminé - se partagent tous
 * les dossiers sans se recouvrir : leur somme est `tous`, par construction et non par
 * bonne volonté. C'est ce qui permet de lire la rangée comme un tout, et ce qui
 * manquait à la ligne de résumé qu'elle remplace - elle annonçait « 9 formalités · 1
 * terminée · 7 brouillons » en passant sous silence le dossier confié au cabinet.
 *
 * `en_cours` reste compté bien qu'il n'ait plus de pastille : une adresse partagée
 * hier peut encore le demander, et la pastille active s'affiche même à zéro.
 */
export function comptesParFiltre(dossiers: DossierListe[]): Record<ValeurFiltre, number> {
  const pour = (filtre: ValeurFiltre) => dossiers.filter((d) => retenu(d, filtre)).length;

  return {
    tous: dossiers.length,
    brouillon: pour("brouillon"),
    chez_lavocat: pour("chez_lavocat"),
    en_cours: pour("en_cours"),
    en_attente: pour("en_attente"),
    terminee: pour("terminee"),
  };
}

/* ---------- Recherche ---------- */

function sansAccent(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * La recherche porte sur le nom et la forme.
 *
 * Sans accent ni casse : chercher « societe » doit trouver « SOCIÉTÉ ». L'original
 * comparait en minuscules seulement, et une recherche tapée sans accent ne trouvait
 * rien.
 */
export function correspond(dossier: DossierListe, recherche: string): boolean {
  const cherche = sansAccent(recherche.trim());
  if (!cherche) return true;

  return (
    sansAccent(dossier.societe ?? "").includes(cherche) ||
    sansAccent(dossier.forme ?? "").includes(cherche) ||
    sansAccent(dossier.type ?? "").includes(cherche)
  );
}

/* ---------- Date relative ---------- */

const MOIS_COURTS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

/**
 * Depuis quand un dossier n'a pas bougé.
 *
 * « Il y a 3j » se lit plus vite qu'une date, mais au-delà d'une semaine le relatif
 * ne dit plus rien d'utile et la date reprend sa place. Ce sont les seuils de
 * formatRelativeDate dans la page d'origine.
 */
export function dateRelative(quand: Date | null, maintenant: Date = new Date()): string {
  if (!quand) return "";

  const ecart = maintenant.getTime() - quand.getTime();
  const minutes = Math.floor(ecart / 60_000);
  const heures = Math.floor(ecart / 3_600_000);
  const jours = Math.floor(ecart / 86_400_000);

  // L'espace avant l'unité est celui que veut la typographie française, et que
  // « 30 min » avait déjà quand « 6h » et « 3j » ne l'avaient pas.
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return "Il y a " + minutes + " min";
  if (heures < 24) return "Il y a " + heures + " h";
  if (jours < 7) return "Il y a " + jours + " j";

  return quand.getDate() + " " + MOIS_COURTS[quand.getMonth()] + " " + quand.getFullYear();
}

/* ---------- Cartes de statistiques ---------- */

export interface Statistique {
  /** Le nombre, ou null quand il n'y a rien à compter - la carte se grise alors. */
  valeur: number | null;
  libelle: string;
  sousTitre: string;
}

/**
 * Les trois compteurs de tête.
 *
 * Les sous-titres changent de nature selon qu'on filtre ou non : sur la liste
 * entière, une part et un total situent l'ensemble ; sous un filtre, c'est le
 * décompte de ce qu'on voit qui compte. Les accords suivent le nombre.
 *
 * Une carte à zéro affiche « - » plutôt qu'un zéro et se grise : un zéro se lit
 * comme une valeur mesurée, alors qu'il n'y a rien à mesurer.
 */
export function statistiques(
  tous: DossierListe[],
  visibles: DossierListe[],
  filtre: ValeurFiltre,
  recherche: string
): { enCours: Statistique; termines: Statistique; total: Statistique } {
  const enCours = visibles.filter((d) => retenu(d, "en_cours")).length;
  const termines = visibles.filter((d) => retenu(d, "terminee")).length;
  const totalTout = tous.length;
  const filtre_ = filtre !== "tous" || recherche.trim().length > 0;

  return {
    enCours: {
      valeur: enCours > 0 ? enCours : null,
      libelle: "En cours",
      sousTitre: filtre_
        ? enCours + (enCours > 1 ? " dossiers en cours" : " dossier en cours")
        : (totalTout > 0 ? Math.round((enCours / totalTout) * 100) : 0) + " % de vos formalités",
    },
    termines: {
      valeur: termines > 0 ? termines : null,
      libelle: termines > 1 ? "Terminées" : "Terminée",
      sousTitre: filtre_
        ? termines + (termines > 1 ? " dossiers terminés" : " dossier terminé")
        : termines + " sur " + totalTout + (termines > 1 ? " finalisées" : " finalisée"),
    },
    total: {
      valeur: totalTout > 0 ? totalTout : null,
      libelle: "Total",
      sousTitre: filtre_
        ? visibles.length + " sur " + totalTout + (totalTout > 1 ? " formalités" : " formalité")
        : totalTout === 1
          ? "1 formalité"
          : totalTout + " formalités au total",
    },
  };
}

/* ---------- Pagination ---------- */

/** Six cartes par page : au-delà, la page devient longue à parcourir. */
/*
 * Neuf cartes, non six.
 *
 * Trois par rangée sur un écran large : six s'arrêtaient au milieu de la page, avec
 * une pagination pour aller chercher les suivantes et un demi-écran de vide dessous.
 */
export const PAR_PAGE = 9;

export interface Pagination {
  page: number;
  pages: number;
  /** Les numéros à montrer, « null » marquant une coupure. */
  fenetre: (number | null)[];
  premier: number;
  dernier: number;
  total: number;
}

/**
 * La pagination, bornée sur elle-même.
 *
 * Une page demandée au-delà du dernier écran ramène au dernier, plutôt que de rendre
 * une liste vide : un lien partagé reste utilisable après que des dossiers ont été
 * retirés.
 */
export function paginer(total: number, pageDemandee: number): Pagination {
  const pages = Math.max(1, Math.ceil(total / PAR_PAGE));
  const page = Math.min(Math.max(Math.floor(pageDemandee) || 1, 1), pages);

  const numeros = new Set<number>([1, pages, page]);
  if (page - 1 > 1) numeros.add(page - 1);
  if (page + 1 < pages) numeros.add(page + 1);

  const ordonnes = [...numeros].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);

  // Une coupure là où la suite saute un numéro.
  const fenetre: (number | null)[] = [];
  ordonnes.forEach((n, i) => {
    if (i > 0 && n - ordonnes[i - 1] > 1) fenetre.push(null);
    fenetre.push(n);
  });

  return {
    page,
    pages,
    fenetre,
    premier: total === 0 ? 0 : (page - 1) * PAR_PAGE + 1,
    dernier: Math.min(page * PAR_PAGE, total),
    total,
  };
}

/** La tranche de dossiers d'une page. */
export function pageDe<T>(dossiers: T[], page: number): T[] {
  return dossiers.slice((page - 1) * PAR_PAGE, page * PAR_PAGE);
}

/**
 * Le plus récemment modifié d'abord.
 *
 * Un dossier sans date de modification passe en dernier : il n'a jamais bougé.
 */
interface ProprietesDeTri {
  modifieLe: Date | null;
  status: string | null;
  urgent?: boolean;
  attendLeClient?: boolean;
}

export function parModificationRecente<T extends { modifieLe: Date | null }>(dossiers: T[]): T[] {
  return [...dossiers].sort(
    (a, b) => (b.modifieLe?.getTime() ?? 0) - (a.modifieLe?.getTime() ?? 0)
  );
}

/**
 * Ce qui presse d'abord, ce qui est fini en dernier.
 *
 * La liste se rangeait par date de modification : le dossier touché hier passait
 * devant celui qui bloque depuis trois semaines, et rien à l'écran n'annonçait cet
 * ordre. Or on n'ouvre pas cette page pour retrouver ce qu'on a fait, mais pour
 * savoir ce qui attend.
 *
 * Quatre rangs, et l'ancienneté départage à l'intérieur de chacun - c'est elle qui
 * distingue deux brouillons également muets.
 */
export function parCeQuiPresse<T extends ProprietesDeTri>(dossiers: T[]): T[] {
  const rang = (d: T): number => {
    if (d.status === "terminee") return 3;
    if (d.urgent) return 0;
    if (d.attendLeClient) return 1;
    return 2;
  };

  return [...dossiers].sort((a, b) => {
    const ecart = rang(a) - rang(b);
    if (ecart !== 0) return ecart;
    return (b.modifieLe?.getTime() ?? 0) - (a.modifieLe?.getTime() ?? 0);
  });
}

/**
 * Où s'ouvre un dossier.
 *
 * Il n'existe pas de page « /formalites/<id> » : un dossier se reprend là où il se
 * remplit, et le formulaire dépend de son type. La règle vivait dans la page de
 * liste ; elle est ici parce que la bibliothèque de documents en a besoin aussi, et
 * qu'une seconde copie finirait par diverger - la première version écrite en
 * bibliothèque pointait vers une adresse qui n'existe pas.
 */
/**
 * Le geste que porte la carte d'un dossier.
 *
 * « Reprendre » sur un dossier déjà transmis est faux : il n'y a plus rien à
 * reprendre, il est chez l'avocat. Ce qu'on vient y faire alors, c'est le suivre.
 */
export function gesteDuDossier(dossier: { status: string | null }): string {
  if (dossier.status === "en_cours" || dossier.status === "corrections_demandees") {
    return "Reprendre";
  }
  return "Suivre";
}

export function adresseDuDossier(dossier: { id: number; type: string | null }): string {
  if (dossier.type === "modification") return "/modification?dossier=" + dossier.id;
  if (dossier.type === "auto-entrepreneur") return "/auto-entrepreneur?dossier=" + dossier.id;
  /*
   * Les deux parcours ajoutés après coup.
   *
   * Sans eux, un dépôt de comptes ou une fermeture repris depuis la liste ouvrait le
   * parcours de création avec un dossier qui n'en est pas un : l'écran s'affichait vide,
   * et le client croyait son dossier perdu.
   */
  if (dossier.type === "comptes") return "/depot-des-comptes?dossier=" + dossier.id;
  if (dossier.type === "fermeture") return "/fermeture?dossier=" + dossier.id;
  if (dossier.type === "cessation") return "/cessation?dossier=" + dossier.id;
  return "/creation?dossier=" + dossier.id;
}
