/**
 * Libellés et regroupements des documents et contrats.
 *
 * Les valeurs stockées sont techniques - « generated », « en_validation » - et
 * n'ont pas à être lues par un client. La traduction est faite ici, une fois.
 */

export type StatutDocument = "generated" | "uploaded" | "signed" | "verified";
export type StatutContrat = "brouillon" | "genere" | "en_validation" | "valide" | "signe";

/** Ton d'affichage : neutre, en attente, ou abouti. */
export type Ton = "neutre" | "attente" | "abouti";

const DOCUMENTS: Record<StatutDocument, { libelle: string; ton: Ton }> = {
  generated: { libelle: "Généré", ton: "neutre" },
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

/** Un document rejeté prime sur son statut : c'est ce qui demande une action. */
export function etatDocument(document: { status: string | null; rejection_reason: string | null }) {
  if (document.rejection_reason) {
    return { libelle: "À remplacer", ton: "attente" as Ton, motif: document.rejection_reason };
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
