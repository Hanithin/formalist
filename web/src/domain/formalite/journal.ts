/**
 * Le fil d'activité d'un dossier, mis en français.
 *
 * Porté de describeAudit et formatRelativeDate de public/dashboard.html. Les
 * entrées du journal sont enregistrées en valeurs techniques (`doc_rejected`,
 * `field_update`) : c'est ici, et nulle part ailleurs, qu'elles deviennent des
 * phrases lisibles.
 *
 * Deux vocabulaires cohabitent : celui du fil que voit le client - phraseJournal - et
 * celui que le cabinet inscrit dans son journal de coulisses - libelleJournal. Ce sont
 * les mêmes lignes de table, écrites par des chemins différents.
 */

import { libelleEtat } from "./transitions";
import { libelleSousPhase, type TypeDeDossier } from "./cabinet";

export interface EntreeJournal {
  action: string;
  auteurRole: string | null;
  auteur: string | null;
  champ: string | null;
  valeur: string | null;
  commentaire: string | null;
  quand: Date;
}

/** Ce que l'entrée raconte, accordé selon que c'est le client ou quelqu'un d'autre. */
export function phraseJournal(entree: EntreeJournal, cestMoi: boolean): string {
  const sujet = entree.valeur || entree.champ || "";
  const a = cestMoi ? "avez" : "a";

  switch (entree.action) {
    case "field_update":
      return entree.champ
        ? a + " renseigné " + entree.champ + (entree.valeur ? " : " + entree.valeur : "")
        : a + " modifié une information";
    case "doc_generated":
      return a + " rédigé " + (sujet || "un document");
    case "doc_uploaded":
      return a + " ajouté " + (sujet || "un document");
    case "doc_validated":
      return a + " validé " + (sujet || "un document");
    case "doc_rejected":
      return a + " demandé un nouveau justificatif" + (sujet ? " pour " + sujet : "");
    case "status_change":
      return sujet ? sujet.toLowerCase() : a + " fait avancer le dossier";
    case "note":
      return a + " laissé une note";
    default:
      return a + " mis à jour le dossier";
  }
}

/**
 * Un changement d'étape se suffit à lui-même.
 *
 * « Dossier pris en charge par Me Sophie Martin » ne doit pas être préfixé du nom
 * de son auteur : la phrase le contient déjà.
 */
export function seSuffitAElleMeme(entree: EntreeJournal): boolean {
  return entree.action === "status_change" && !!entree.valeur;
}

/** « il y a 3 h », « hier », « 12 mars » - plus lisible qu'une date brute dans un fil. */
export function dateRelative(quand: Date, maintenant: Date = new Date()): string {
  const minutes = Math.round((maintenant.getTime() - quand.getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return "il y a " + minutes + " min";
  if (minutes < 60 * 24) return "il y a " + Math.round(minutes / 60) + " h";
  if (minutes < 60 * 48) return "hier";
  return quand.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

/**
 * La même date, avec l'heure.
 *
 * « 16 août » suffit dans un fil d'activité qu'on parcourt ; dans l'historique d'une
 * société, on cherche l'ordre exact des événements d'une journée - qui a fait quoi,
 * et avant quoi. Les moins d'une journée gardent leur formulation relative : « il y a
 * 27 min à 14h32 » n'apprendrait rien de plus.
 */
export function dateEtHeure(quand: Date, maintenant: Date = new Date()): string {
  const minutes = Math.round((maintenant.getTime() - quand.getTime()) / 60000);
  if (minutes < 60 * 24) return dateRelative(quand, maintenant);

  const heure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" })
    .format(quand)
    .replace(":", "h");

  if (minutes < 60 * 48) return "hier à " + heure;
  return quand.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) + " à " + heure;
}

/* ---------- Le journal des coulisses, côté cabinet ---------- */

/**
 * Ce que raconte une intervention du cabinet.
 *
 * Les coulisses affichaient la clé telle qu'elle est écrite en base -
 * « informations_verifiees », « dossier_pris », « sous_phase_5c ». L'avocat y lisait
 * du nom de colonne entre deux dates écrites en toutes lettres.
 *
 * Les clés restent en base : c'est le journal d'un dossier, et on ne réécrit pas ce
 * qui a été inscrit. Seule leur lecture change.
 */
const INTERVENTIONS: Record<string, string> = {
  actes_mis_a_disposition: "Actes mis à disposition du client",
  acte_version_retablie: "Version antérieure d'un acte rétablie",
  actes_retires: "Actes retirés de l'espace du client",
  annonce_relue: "Annonce légale relue",
  auto_entreprise_payee: "Auto-entreprise réglée",
  avocat_assigne: "Avocat assigné au dossier",
  brouillon_supprime: "Brouillon supprimé",
  cessation_payee: "Cessation réglée",
  comptes_payes: "Dépôt des comptes réglé",
  connexion: "Connexion",
  document_decision_reprise: "Décision reprise sur un justificatif",
  document_refuse: "Justificatif refusé",
  document_valide: "Justificatif validé",
  dossier_pris: "Dossier pris en charge",
  dossier_transmis: "Dossier transmis au cabinet",
  fermeture_payee: "Fermeture réglée",
  informations_a_revoir: "Informations à revoir",
  informations_verifiees: "Informations vérifiées",
  modification_payee: "Modification réglée",
  offre_modifiee: "Offre modifiée",
  paiement_rembourse: "Paiement remboursé",
  roles_modifies: "Rôles modifiés",
  statuts_signes: "Statuts signés",
};

/**
 * Une clé qu'aucune table ne nomme reste lisible.
 *
 * Une quinzaine d'endroits écrivent ce journal, et il en viendra d'autres : une clé
 * oubliée ici doit se lire comme une phrase, non comme un identifiant.
 */
function auMieux(action: string): string {
  const mots = action.replace(/_/g, " ").trim();
  return mots ? mots[0].toUpperCase() + mots.slice(1) : action;
}

export function libelleJournal(action: string, type: TypeDeDossier): string {
  const connu = INTERVENTIONS[action];
  if (connu) return connu;

  /* Deux familles portent leur valeur dans la clé, et se lisent avec leur table. */
  if (action.startsWith("etat_")) {
    return "Dossier passé à « " + libelleEtat(action.slice("etat_".length)) + " »";
  }
  if (action.startsWith("sous_phase_")) {
    const etape = action.slice("sous_phase_".length);
    return "Étape annoncée au client : « " + libelleSousPhase(type, etape) + " »";
  }

  return auMieux(action);
}
