/**
 * Le fil d'activité d'un dossier, mis en français.
 *
 * Porté de describeAudit et formatRelativeDate de public/dashboard.html. Les
 * entrées du journal sont enregistrées en valeurs techniques (`doc_rejected`,
 * `field_update`) : c'est ici, et nulle part ailleurs, qu'elles deviennent des
 * phrases lisibles.
 */

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
