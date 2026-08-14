/**
 * La consultation juridique : sa matière, son prix, son classement.
 *
 * Reprise de public/consultations.html, dont l'assistant demandait d'abord la
 * matière. Elle sert deux fois : à orienter la demande vers le bon avocat, et à
 * ranger les consultations passées.
 */

export const MATIERES = [
  { cle: "droit_societes", nom: "Droit des sociétés" },
  { cle: "fiscalite", nom: "Fiscalité" },
  { cle: "contrats", nom: "Contrats" },
  { cle: "droit_travail", nom: "Droit du travail" },
  { cle: "propriete_intellectuelle", nom: "Propriété intellectuelle" },
  { cle: "immobilier", nom: "Immobilier" },
  { cle: "litige", nom: "Litige" },
  { cle: "autre", nom: "Autre" },
] as const;

export type CleMatiere = (typeof MATIERES)[number]["cle"];

/** Les quatre matières proposées d'emblée quand on n'a encore rien demandé. */
export const MATIERES_COURANTES: CleMatiere[] = [
  "droit_societes",
  "fiscalite",
  "contrats",
  "droit_travail",
];

export function matiereValide(brut: string | null | undefined): CleMatiere | null {
  return MATIERES.some((m) => m.cle === brut) ? (brut as CleMatiere) : null;
}

/** Le nom d'une matière ; une matière inconnue se lit « Autre » plutôt que sa clé. */
export function nomDeMatiere(cle: string | null | undefined): string {
  return MATIERES.find((m) => m.cle === cle)?.nom ?? "Autre";
}

/**
 * Le nom d'un avocat, précédé de son titre.
 *
 * Reprise de cleanAvocatName : un nom déjà saisi « Me. Dupont » ou « Maître Dupont »
 * ne doit pas ressortir « Me. Me. Dupont ». Le titre vient de la plateforme, le nom
 * de la fiche : rien ne garantit que l'un n'y soit pas déjà.
 */
export function nomDAvocat(nom: string | null | undefined): string {
  const propre = (nom ?? "").trim();
  if (!propre) return "Avocat";
  if (/^(me\.?|ma[iî]tre)\s+/i.test(propre)) return propre;
  return "Me. " + propre;
}

/** Les initiales affichées dans la pastille, deux au plus. */
export function initialesDe(nom: string | null | undefined): string {
  const mots = (nom ?? "").trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  return mots
    .map((mot) => mot[0].toUpperCase())
    .join("")
    .slice(0, 2);
}

/* ---------- Le classement des consultations ---------- */

export const ONGLETS = [
  { valeur: "toutes", libelle: "Toutes" },
  { valeur: "avenir", libelle: "À venir" },
  { valeur: "passees", libelle: "Passées" },
  { valeur: "annulees", libelle: "Annulées" },
] as const;

export type Onglet = (typeof ONGLETS)[number]["valeur"];

export function ongletValide(brut: string | null | undefined): Onglet {
  return ONGLETS.some((o) => o.valeur === brut) ? (brut as Onglet) : "toutes";
}

export interface ConsultationRangee {
  etat: "demandee" | "confirmee" | "faite" | "annulee";
  debut: Date;
}

/**
 * Dans quel onglet tombe une consultation.
 *
 * « À venir » se juge sur l'heure, pas sur l'état : un rendez-vous confirmé dont
 * l'heure est passée n'est plus à venir, même si personne ne l'a encore marqué fait.
 */
export function ongletDe(c: ConsultationRangee, maintenant: Date = new Date()): Onglet {
  if (c.etat === "annulee") return "annulees";
  if (c.etat === "faite") return "passees";
  return c.debut.getTime() > maintenant.getTime() ? "avenir" : "passees";
}

export function dansLOnglet(
  c: ConsultationRangee,
  onglet: Onglet,
  maintenant: Date = new Date()
): boolean {
  return onglet === "toutes" || ongletDe(c, maintenant) === onglet;
}

/** Le décompte affiché sur chaque onglet. */
export function comptesParOnglet(
  consultations: ConsultationRangee[],
  maintenant: Date = new Date()
): Record<Onglet, number> {
  return {
    toutes: consultations.length,
    avenir: consultations.filter((c) => ongletDe(c, maintenant) === "avenir").length,
    passees: consultations.filter((c) => ongletDe(c, maintenant) === "passees").length,
    annulees: consultations.filter((c) => ongletDe(c, maintenant) === "annulees").length,
  };
}

/**
 * Dans combien de temps, dit simplement.
 *
 * Reprise de relCountdown : c'est ce qui distingue un rendez-vous de demain d'un
 * rendez-vous dans trois semaines, sans avoir à comparer deux dates de tête.
 */
export function delaiAvant(quand: Date, maintenant: Date = new Date()): string {
  const minutes = Math.round((quand.getTime() - maintenant.getTime()) / 60_000);
  if (minutes < 0) return "passé";
  if (minutes < 60) return "dans " + minutes + " min";

  const heures = Math.round(minutes / 60);
  if (heures < 24) return "dans " + heures + " h";

  const jours = Math.round(heures / 24);
  if (jours === 1) return "demain";
  if (jours < 31) return "dans " + jours + " jours";

  const mois = Math.round(jours / 30);
  return mois === 1 ? "dans un mois" : "dans " + mois + " mois";
}
