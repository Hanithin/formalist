import { TITRE_STATUTS_EN_VIGUEUR } from "@/domain/modification/formalites";

/**
 * Libellés et regroupements des documents et contrats.
 *
 * Les valeurs stockées sont techniques - « generated », « en_validation » - et
 * n'ont pas à être lues par un client. La traduction est faite ici, une fois.
 */

export type StatutDocument = "generated" | "a_relire" | "uploaded" | "signed" | "verified";
export type StatutContrat = "brouillon" | "genere" | "en_validation" | "valide" | "signe";

/** Ton d'affichage : neutre, en attente, ou abouti. */
export type Ton = "neutre" | "attente" | "abouti";

const DOCUMENTS: Record<StatutDocument, { libelle: string; ton: Ton }> = {
  generated: { libelle: "Généré", ton: "neutre" },
  /*
   * L'état d'un acte que le cabinet n'a pas encore relu.
   *
   * Il manquait à cette table : l'espace avocat affichait « a_relire » tel quel, la
   * valeur de la base, au milieu de mots français.
   */
  a_relire: { libelle: "Projet à relire", ton: "attente" },
  uploaded: { libelle: "Déposé", ton: "attente" },
  signed: { libelle: "Signé", ton: "abouti" },
  verified: { libelle: "Vérifié", ton: "abouti" },
};

const CONTRATS: Record<StatutContrat, { libelle: string; ton: Ton }> = {
  brouillon: { libelle: "Brouillon", ton: "neutre" },
  genere: { libelle: "Généré", ton: "neutre" },
  en_validation: { libelle: "En validation", ton: "attente" },
  valide: { libelle: "Validé", ton: "abouti" },
  signe: { libelle: "Signé", ton: "abouti" },
};

/** Un statut inconnu est affiché tel quel plutôt que masqué : mieux vaut le voir. */
function traduire<T extends string>(
  table: Record<string, { libelle: string; ton: Ton }>,
  statut: T | null | undefined
): { libelle: string; ton: Ton } {
  if (!statut) return { libelle: "Inconnu", ton: "neutre" };
  return table[statut] ?? { libelle: statut, ton: "neutre" };
}

export function statutDocument(statut: string | null | undefined) {
  return traduire(DOCUMENTS, statut);
}

export function statutContrat(statut: string | null | undefined) {
  return traduire(CONTRATS, statut);
}

/**
 * Les statuts repris au registre, reconnus à leur titre.
 *
 * Ils entrent au dossier comme tout ce que la plateforme y écrit, donc avec l'état
 * « generated », et s'annonçaient « Généré le 2 septembre 2022 » : nous n'avons rien
 * rédigé, nous sommes allés chercher au registre national un acte que la société y
 * avait déposé.
 *
 * Le mot compte. « Généré le 2 septembre 2022 » nous attribuait la rédaction ; « Déposé
 * au greffe le 2 septembre 2022 » se lisait comme un dépôt que nous venions de faire.
 * Ce qu'il faut dire est autre chose : c'est la version qui fait foi aujourd'hui au
 * greffe, déposée par la société en deux mille vingt-deux, et que nous sommes allés y
 * chercher. La date du dépôt d'origine accompagne donc l'étiquette.
 */
export function estStatutsRepris(nom: string | null | undefined): boolean {
  return nom === TITRE_STATUTS_EN_VIGUEUR;
}

/** Un document rejeté prime sur son statut : c'est ce qui demande une action. */
export function etatDocument(document: {
  name?: string | null;
  status: string | null;
  rejection_reason: string | null;
}) {
  if (document.rejection_reason) {
    return { libelle: "À remplacer", ton: "attente" as Ton, motif: document.rejection_reason };
  }
  if (estStatutsRepris(document.name)) {
    return { libelle: "Version actuellement au greffe", ton: "neutre" as Ton, motif: null };
  }
  return { ...statutDocument(document.status), motif: null };
}

/**
 * Filtres proposés sur une liste.
 *
 * « Tous » n'est pas un filtre mais l'absence de filtre : il est ajouté ici pour
 * que la page n'ait pas à le traiter à part.
 */
export interface Filtre {
  valeur: string;
  libelle: string;
}

/*
 * Les libellés disent ce qui est compté.
 *
 * « Société 5 » se lisait comme cinq sociétés, alors que le nombre compte des
 * documents : chaque pastille porte donc un mot qui désigne des documents, jamais leur
 * provenance seule.
 */
export const FILTRES_DOCUMENTS: Filtre[] = [
  { valeur: "tous", libelle: "Tous" },
  { valeur: "entreprise", libelle: "Actes de société" },
  { valeur: "contrat", libelle: "Contrats" },
  { valeur: "upload", libelle: "Mes dépôts" },
];

export const FILTRES_CONTRATS: Filtre[] = [
  { valeur: "tous", libelle: "Tous" },
  { valeur: "brouillon", libelle: "Brouillons" },
  { valeur: "en_validation", libelle: "En validation" },
  { valeur: "signe", libelle: "Signés" },
];

/**
 * Les filtres qui mènent quelque part.
 *
 * « Contrats 0 » et « Mes dépôts 0 » occupaient la barre sans rien promettre : les
 * ouvrir ne montrait qu'un écran vide, et ils annonçaient au client des rubriques
 * qu'il n'a pas. Un filtre sans document ne s'affiche donc plus.
 *
 * Deux exceptions. « Tous » reste, sans quoi une bibliothèque vide perdrait sa barre
 * entière. Et le filtre en cours reste lui aussi : le dernier document d'une rubrique
 * peut disparaître pendant qu'on la regarde - un dépôt remplacé, par exemple - et la
 * pastille active s'effacerait sous le curseur.
 */
export function filtresUtiles<T extends { valeur: string }>(
  filtres: readonly T[],
  comptes: Readonly<Record<string, number>>,
  actif: string
): T[] {
  return filtres.filter(
    (f) => f.valeur === "tous" || f.valeur === actif || (comptes[f.valeur] ?? 0) > 0
  );
}

export const FILTRES_FORMALITES: Filtre[] = [
  { valeur: "tous", libelle: "Toutes" },
  { valeur: "en_cours", libelle: "En cours" },
  { valeur: "terminee", libelle: "Terminées" },
];

export function filtreValide(filtres: Filtre[], valeur: string | undefined): string {
  return valeur && filtres.some((f) => f.valeur === valeur) ? valeur : "tous";
}

/**
 * Le libellé d'un filtre, pour le nommer quand il ne rend rien.
 *
 * « Aucun document dans Mes dépôts » se comprend, « Aucun document dans ce
 * filtre » oblige à remonter à la barre de filtres pour savoir lequel.
 */
export function libelleFiltre(filtres: Filtre[], valeur: string): string {
  return filtres.find((f) => f.valeur === valeur)?.libelle ?? valeur;
}
