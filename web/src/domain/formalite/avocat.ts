/**
 * La lecture d'un dossier du côté du cabinet.
 *
 * L'avocat ne suit pas les mêmes étapes que le client : une fois le dossier
 * transmis, tout se joue dans la sous-phase 5a-5e, qui dit où en est le travail
 * du cabinet. Porté de public/avocat.html, où le tableau, les compteurs et les
 * filtres recalculaient chacun leur version.
 */

export type Teinte = "orange" | "blue" | "green" | "gray";

export interface DossierCabinet {
  status: string | null;
  phase: number;
  sousPhase: string | null;
  creePar: "avocat" | "client";
}

const SOUS_PHASES: Record<string, { libelle: string; teinte: Teinte }> = {
  "5a": { libelle: "Transmis", teinte: "orange" },
  "5b": { libelle: "Révision", teinte: "orange" },
  "5c": { libelle: "Vérifié", teinte: "blue" },
  "5d": { libelle: "Dépôt", teinte: "blue" },
  "5e": { libelle: "KBIS", teinte: "green" },
};

/** Où en est le travail du cabinet, en un mot et une teinte. */
export function etatCabinet(dossier: DossierCabinet): { libelle: string; teinte: Teinte } {
  const connue = dossier.sousPhase ? SOUS_PHASES[dossier.sousPhase] : undefined;
  if (connue) return connue;

  if (dossier.status === "terminee") return { libelle: "Terminé", teinte: "green" };
  if (dossier.phase >= 5) return { libelle: "En traitement", teinte: "blue" };
  // Tant que le client complète, il n'y a rien à vérifier.
  return { libelle: "Côté client", teinte: "gray" };
}

export type Filtre = "tous" | "verifier" | "encours" | "termines" | "miens";

export const FILTRES: { cle: Filtre; libelle: string }[] = [
  { cle: "tous", libelle: "Tous" },
  { cle: "verifier", libelle: "À vérifier" },
  { cle: "encours", libelle: "En cours" },
  { cle: "termines", libelle: "Terminés" },
  { cle: "miens", libelle: "Créés par le cabinet" },
];

export function estFiltre(valeur: string | undefined): Filtre {
  const connu = FILTRES.some((f) => f.cle === valeur);
  return connu ? (valeur as Filtre) : "tous";
}

export function retenir<T extends DossierCabinet>(dossiers: T[], filtre: Filtre): T[] {
  return dossiers.filter((d) => {
    const sp = d.sousPhase;
    if (filtre === "verifier") return sp === "5a" || sp === "5b";
    if (filtre === "encours") return sp === "5c" || sp === "5d";
    if (filtre === "termines") return sp === "5e" || d.status === "terminee";
    if (filtre === "miens") return d.creePar === "avocat";
    return true;
  });
}

/** Ce que chaque filtre retiendrait : le compte s'affiche à côté de son nom. */
export function comptes<T extends DossierCabinet>(dossiers: T[]): Record<Filtre, number> {
  return {
    tous: dossiers.length,
    verifier: retenir(dossiers, "verifier").length,
    encours: retenir(dossiers, "encours").length,
    termines: retenir(dossiers, "termines").length,
    miens: retenir(dossiers, "miens").length,
  };
}

/** « il y a 3 h », « il y a 2 j », puis la date courte. */
export function depuis(quand: Date, maintenant: Date = new Date()): string {
  const minutes = Math.floor((maintenant.getTime() - quand.getTime()) / 60000);
  if (minutes < 60) return "il y a " + Math.max(1, minutes) + " min";
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return "il y a " + heures + " h";
  const jours = Math.floor(heures / 24);
  if (jours < 7) return "il y a " + jours + " j";
  return dateCourte(quand);
}

export function dateCourte(quand: Date): string {
  return quand.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });
}
