/**
 * L'état civil des personnes d'un dossier, et les listes de choix du formulaire.
 *
 * Ces champs ne sont pas décoratifs : ce sont eux qui remplissent les gabarits des
 * statuts, de la liste des souscripteurs et des déclarations de non-condamnation.
 * Les clés de gabarit correspondantes sont indiquées en regard - c'est ce que
 * collectFormData() du formulaire d'origine construisait à la main, en 1 509
 * lignes, à partir de sélecteurs CSS sur les champs affichés.
 *
 * Les listes reprennent exactement les options de public/creation.html : une
 * option ajoutée ou renommée ici change ce que voient les clients.
 */

export const CIVILITES = ["Monsieur", "Madame"] as const;
export type Civilite = (typeof CIVILITES)[number];

export const SITUATIONS_MATRIMONIALES = [
  "Célibataire",
  "Marié(e)",
  "Pacsé(e)",
  "Divorcé(e)",
  "Veuf(ve)",
] as const;
export type SituationMatrimoniale = (typeof SITUATIONS_MATRIMONIALES)[number];

/**
 * Les régimes matrimoniaux.
 *
 * Le formulaire d'origine posait ce champ en texte libre dans le gabarit du
 * conjoint (REGIME_MATRIMONIAL_) ; la liste ferme la saisie, parce qu'un régime
 * mal orthographié dans des statuts se paie au greffe.
 */
export const REGIMES_MATRIMONIAUX = [
  "Communauté réduite aux acquêts",
  "Communauté universelle",
  "Séparation de biens",
  "Participation aux acquêts",
] as const;
export type RegimeMatrimonial = (typeof REGIMES_MATRIMONIAUX)[number];

/** Le conjoint n'est demandé que pour une situation qui l'implique. */
export function conjointRequis(situation: string | null | undefined): boolean {
  return situation === "Marié(e)" || situation === "Pacsé(e)";
}

export interface Conjoint {
  /** CONJOINT_CIVILITE_ */
  civilite?: Civilite;
  /** CONJOINT_PRENOM_ */
  prenom?: string;
  /** CONJOINT_NOM_ */
  nom?: string;
  /** CONJOINT_NOM_NAISSANCE_ */
  nomDeNaissance?: string;
  /** REGIME_MATRIMONIAL_ */
  regimeMatrimonial?: RegimeMatrimonial;
  /** DATE_MARIAGE_ */
  dateMariage?: string;
  /** VILLE_MARIAGE_ */
  villeMariage?: string;
  /** CONTRAT_MARIAGE_ : un contrat a-t-il été signé devant notaire. */
  contratDeMariage?: boolean;
}

/**
 * Une personne physique, associée ou dirigeante.
 *
 * Les noms des parents figurent dans les actes d'état civil demandés par le
 * greffe : ils ne sont pas facultatifs par confort, ils le sont parce que le
 * dossier peut avancer sans eux et se compléter à la révision.
 */
export interface PersonnePhysique {
  /** CIVILITE */
  civilite?: Civilite;
  /** PRENOM */
  prenom?: string;
  /** NOM */
  nom?: string;
  /** NOM_JEUNE_FILLE */
  nomDeNaissance?: string;
  /** EMAIL_ASSOCIE_ */
  email?: string;
  /** ADRESSE_ASSOCIE_ */
  adresse?: string;
  codePostal?: string;
  ville?: string;
  /** DATE_NAISSANCE */
  dateDeNaissance?: string;
  /** LIEU_NAISSANCE */
  villeDeNaissance?: string;
  /** CP_NAISSANCE */
  codePostalDeNaissance?: string;
  /** PAYS_NAISSANCE */
  paysDeNaissance?: string;
  /** NOM_PERE */
  nomDuPere?: string;
  /** NOM_MERE */
  nomDeLaMere?: string;
  /** NATIONALITE */
  nationalite?: string;
  /** SITUATION_MATRIMONIALE */
  situationMatrimoniale?: SituationMatrimoniale;
  conjoint?: Conjoint;
}

/** Une personne morale associée, avec la personne qui la représente. */
export interface PersonneMorale {
  /** SOCIETE_NOM */
  denomination?: string;
  /** SOCIETE_ADRESSE */
  adresse?: string;
  codePostal?: string;
  ville?: string;
  /** SOCIETE_CAPITAL */
  capital?: number;
  /** SOCIETE_RCS */
  numeroRcs?: string;
  /** SOCIETE_VILLE_RCS */
  villeImmatriculation?: string;
  /** SOCIETE_TYPE */
  forme?: string;
  /** SOCIETE_SIREN */
  siret?: string;
  /** REP_CIVILITE, REP_PRENOM, REP_NOM */
  representant?: {
    civilite?: Civilite;
    prenom?: string;
    nom?: string;
  };
}

/** Le nom d'usage d'une personne physique, pour les listes et les récapitulatifs. */
export function nomComplet(personne: PersonnePhysique): string {
  return [personne.prenom, personne.nom].filter((m) => m?.trim()).join(" ");
}

/** Le nom d'une partie, qu'elle soit physique ou morale. */
export function nomDeLaPartie(partie: {
  type?: "physique" | "morale";
  personne?: PersonnePhysique;
  societe?: PersonneMorale;
}): string {
  if (partie.type === "morale") return partie.societe?.denomination?.trim() ?? "";
  return nomComplet(partie.personne ?? {});
}
