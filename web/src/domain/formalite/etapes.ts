/**
 * Où en est un dossier, et ce qu'on en dit à son propriétaire.
 *
 * Porté depuis public/formalites.html, où le calcul était refait dans chaque page
 * qui affichait un dossier - tableau de bord, liste, espace avocat - avec des
 * écarts entre les copies.
 */

export type EtatDossier = "en_cours" | "terminee" | "en_attente";
export type Ton = "avance" | "attente" | "termine";

/**
 * Le nom des étapes du parcours.
 *
 * Court, parce qu'il s'affiche à côté du numéro d'étape : « Étape 2 sur 5 ·
 * Dépôt du capital ». Le libellé long, lui, dit ce qu'on attend et se lit
 * ailleurs.
 */
export function nomsDEtapes(offre: string | null | undefined): string[] {
  const parcours = [
    "Informations",
    "Dépôt du capital",
    "Documents",
    "Signature",
    "Immatriculation",
  ];
  if (offre && offre !== "starter") parcours.splice(4, 0, "Révision avocat");
  return parcours;
}

/** Une offre au-delà de la formule d'entrée ajoute l'étape de révision par l'avocat. */
export function nombreDEtapes(offre: string | null | undefined): number {
  return nomsDEtapes(offre).length;
}

export function nomEtape(phase: number, offre: string | null | undefined): string {
  const noms = nomsDEtapes(offre);
  return noms[Math.min(Math.max(phase, 1) - 1, noms.length - 1)];
}

/**
 * L'état du dossier en deux mots, pour la pastille.
 *
 * Quatre valeurs, et seulement quatre : la pastille ne se coupe pas, un libellé
 * long y pousserait le nom de la société hors de la vignette.
 */
export function etatCourt(dossier: {
  status: string | null;
  attendLeClient: boolean;
}): { ton: "done" | "pending" | "action" | "progress"; libelle: string } {
  if (dossier.status === "terminee") return { ton: "done", libelle: "Terminée" };
  if (dossier.status === "en_attente") return { ton: "pending", libelle: "En attente" };
  if (dossier.attendLeClient) return { ton: "action", libelle: "Action requise" };
  return { ton: "progress", libelle: "En cours" };
}

export function avancement(phase: number, offre: string | null | undefined): number {
  const total = nombreDEtapes(offre);
  const atteinte = Math.min(Math.max(phase, 0), total);
  return Math.round((atteinte / total) * 100);
}

/** Les huit étapes de la déclaration d'auto-entreprise, paiement compris. */
const ETAPES_AUTO_ENTREPRISE = 8;

/** Ce que vaut chaque sous-phase du cabinet dans la seconde moitié du chemin. */
const SUIVI_AUTO_ENTREPRISE: Record<string, number> = { "5a": 0, "5b": 0, "5c": 1, "5d": 2, "5e": 3 };
const ETAPES_DU_SUIVI = 4;

/**
 * L'avancement d'un dossier, quel que soit son parcours.
 *
 * Une auto-entreprise avance en deux temps : on remplit la déclaration, puis l'avocat
 * la traite. Les cinq phases d'une création de société n'y correspondent pas - elles
 * annonçaient « 100 % complété » sur une déclaration remplie mais pas réglée, puis la
 * faisaient reculer à 63 % une fois payée, parce que la phase 5 signifie « chez le
 * cabinet » et non « cinquième étape sur huit ».
 *
 * Les deux temps se partagent la barre en deux moitiés. Une barre qui recule est pire
 * qu'une barre imprécise : elle donne à croire qu'on a perdu du terrain en payant.
 */
export function avancementDuDossier(
  dossier: Dossier & { offre?: string | null; sousPhase?: string | null }
): number {
  if (dossier.type !== "auto-entrepreneur") return avancement(dossier.phase ?? 1, dossier.offre);

  if (dossier.status === "terminee") return 100;

  // Première moitié : la déclaration qu'on remplit.
  if (dossier.status === "en_cours" || dossier.status === "corrections_demandees") {
    const atteinte = Math.min(Math.max(dossier.phase ?? 1, 0), ETAPES_AUTO_ENTREPRISE);
    return Math.round((atteinte / ETAPES_AUTO_ENTREPRISE) * 50);
  }

  // Seconde moitié : le travail du cabinet, la déclaration étant acquise.
  const franchies = SUIVI_AUTO_ENTREPRISE[dossier.sousPhase ?? ""] ?? 0;
  return 50 + Math.round((franchies / ETAPES_DU_SUIVI) * 50);
}

/**
 * Ce qu'on attend à cette étape, dit du point de vue du client.
 *
 * Le nom de la banque est repris quand il est connu : « À déposer chez Qonto » se
 * comprend sans réfléchir, « En attente du dépôt du capital » demande un effort.
 */
export function libelleEtape(phase: number, banque?: string | null): string {
  const p = Number.isFinite(phase) && phase > 0 ? Math.floor(phase) : 1;

  if (p === 1) return banque ? "À déposer chez " + banque : "En attente du dépôt du capital";
  if (p === 2) return "En attente d'attestation";
  if (p === 3) return "En attente de signature";
  if (p === 4) return "En révision par l'avocat";
  if (p === 5) return "En cours d'immatriculation";
  return "Terminée";
}

export interface Dossier {
  /**
   * La nature du dossier : elle décide du vocabulaire.
   *
   * Les phases 1 à 6 sont celles d'une création de société - dépôt du capital,
   * attestation, signature. Une auto-entreprise n'en a aucune : les lui appliquer
   * annonçait « En attente du dépôt du capital » sur un dossier sans capital, et
   * « Terminée » sur une déclaration remplie mais pas encore réglée.
   */
  type?: string | null;
  status: string | null;
  phase: number | null;
  offer?: string | null;
  banque?: string | null;
}

/**
 * Où en est une auto-entreprise, dans ses propres mots.
 *
 * Son parcours n'a que deux temps : ce qu'on remplit, et ce que l'avocat fait. Le
 * règlement les sépare - c'est lui qui met le dossier en route.
 */
function libelleAutoEntreprise(dossier: Dossier): string {
  if (dossier.status === "terminee") return "Immatriculée";
  if (dossier.status === "corrections_demandees") return "Corrections demandées";
  if (dossier.status === "en_cours") return "À compléter";
  return "Chez l'avocat";
}

export function libelleDossier(dossier: Dossier): string {
  if (dossier.type === "auto-entrepreneur") return libelleAutoEntreprise(dossier);
  if (dossier.status === "terminee") return "Terminée";
  return libelleEtape(dossier.phase ?? 1, dossier.banque);
}

export function tonDossier(dossier: Dossier): Ton {
  if (dossier.status === "terminee") return "termine";
  if (dossier.status === "en_attente") return "attente";
  return "avance";
}

/**
 * Accord du participe selon le nombre.
 *
 * « 1 formalité terminées » est passé en revue une fois : le pluriel se décide
 * ici plutôt que dans chaque page.
 */
export function accorder(nombre: number, singulier: string, pluriel: string): string {
  return nombre + " " + (nombre <= 1 ? singulier : pluriel);
}
