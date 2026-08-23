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

export const FILTRES = [
  { valeur: "tous", libelle: "Tous" },
  { valeur: "en_cours", libelle: "En cours" },
  { valeur: "en_attente", libelle: "En attente" },
  { valeur: "terminee", libelle: "Terminées" },
] as const;

export type ValeurFiltre = (typeof FILTRES)[number]["valeur"];

export function filtreValide(brut: string | null | undefined): ValeurFiltre {
  return FILTRES.some((f) => f.valeur === brut) ? (brut as ValeurFiltre) : "tous";
}

/**
 * Un dossier répond-il à ce filtre ?
 *
 * « En attente » n'est pas le complément de « en cours » : un dossier attend une
 * pièce ou une signature de la part du client, alors qu'un dossier en cours avance.
 * Les deux se distinguent, comme dans la page d'origine.
 */
export function retenu(dossier: DossierListe, filtre: ValeurFiltre): boolean {
  if (filtre === "tous") return true;
  if (filtre === "terminee") return dossier.status === "terminee";
  if (filtre === "en_attente") return dossier.status === "en_attente";
  return dossier.status !== "terminee" && dossier.status !== "en_attente";
}

/** Le décompte affiché à côté de chaque filtre. */
export function comptesParFiltre(dossiers: DossierListe[]): Record<ValeurFiltre, number> {
  return {
    tous: dossiers.length,
    en_cours: dossiers.filter((d) => retenu(d, "en_cours")).length,
    en_attente: dossiers.filter((d) => retenu(d, "en_attente")).length,
    terminee: dossiers.filter((d) => retenu(d, "terminee")).length,
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

  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return "Il y a " + minutes + " min";
  if (heures < 24) return "Il y a " + heures + "h";
  if (jours < 7) return "Il y a " + jours + "j";

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
export const PAR_PAGE = 6;

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
export function parModificationRecente<T extends { modifieLe: Date | null }>(dossiers: T[]): T[] {
  return [...dossiers].sort(
    (a, b) => (b.modifieLe?.getTime() ?? 0) - (a.modifieLe?.getTime() ?? 0)
  );
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
