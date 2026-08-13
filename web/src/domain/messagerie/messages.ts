/**
 * Messages d'un dossier.
 *
 * Un message n'est pas toujours du texte libre : l'avocat demande une correction,
 * rejette une pièce, annonce une validation. Le type porte cette intention, et
 * l'interface l'affiche différemment - sans lui, un rejet ressemble à un bavardage.
 */

export const TYPES_MESSAGE = [
  "text",
  "correction_request",
  "rejection",
  "validation",
  "validation_pending",
  "document_request",
  "status_note",
] as const;

export type TypeMessage = (typeof TYPES_MESSAGE)[number];

/**
 * Ce que le geste attend du destinataire.
 *
 * « dossier » ouvre le dossier concerné, « piece » ouvre le sélecteur de fichier :
 * un message qui demande une pièce doit permettre de la joindre sans quitter le fil.
 */
export type ActionAttendue = "aucune" | "dossier" | "piece";

interface Presentation {
  libelle: string;
  ton: "neutre" | "attente" | "abouti";
  /** Un message qui appelle une action du client se distingue des autres. */
  demandeAction: boolean;
  /** Le geste proposé dans la bulle, du côté de celui qui reçoit. */
  action: ActionAttendue;
  /** Le libellé de ce geste, tel que l'écrivait la page d'origine. */
  libelleAction: string | null;
  /** Fond et encre de la pastille, repris de kindMeta dans messagerie.html. */
  fond: string;
  encre: string;
}

const PRESENTATIONS: Record<TypeMessage, Presentation> = {
  text: {
    libelle: "Message",
    ton: "neutre",
    demandeAction: false,
    action: "aucune",
    libelleAction: null,
    fond: "transparent",
    encre: "inherit",
  },
  correction_request: {
    libelle: "Demande de corrections",
    ton: "attente",
    demandeAction: true,
    action: "dossier",
    libelleAction: "Corriger le dossier",
    fond: "#fef3c7",
    encre: "#92400e",
  },
  rejection: {
    libelle: "Dossier rejeté",
    ton: "attente",
    demandeAction: true,
    action: "dossier",
    libelleAction: "Consulter le dossier",
    fond: "#fee2e2",
    encre: "#991b1b",
  },
  document_request: {
    libelle: "Demande de pièce",
    ton: "attente",
    demandeAction: true,
    action: "piece",
    libelleAction: "Joindre le document",
    fond: "#ede9fe",
    encre: "#5b21b6",
  },
  validation_pending: {
    libelle: "En attente de validation",
    ton: "attente",
    demandeAction: false,
    action: "dossier",
    libelleAction: "Corriger le dossier",
    fond: "#dbeafe",
    encre: "#1d4ed8",
  },
  validation: {
    libelle: "Dossier validé",
    ton: "abouti",
    demandeAction: false,
    action: "dossier",
    libelleAction: "Voir le dossier",
    fond: "#dcfce7",
    encre: "#15803d",
  },
  status_note: {
    libelle: "Mise à jour du dossier",
    ton: "neutre",
    demandeAction: false,
    action: "aucune",
    libelleAction: null,
    fond: "#f3f4f6",
    encre: "#374151",
  },
};

/** Un type inconnu, venu d'une version plus récente, s'affiche comme un message. */
export function typeValide(brut: string | null | undefined): TypeMessage {
  return TYPES_MESSAGE.includes(brut as TypeMessage) ? (brut as TypeMessage) : "text";
}

export function presentation(type: string | null | undefined): Presentation {
  return PRESENTATIONS[typeValide(type)];
}

/**
 * Les initiales d'un nom, pour l'avatar rond de la liste.
 *
 * Deux lettres au plus, comme le faisait la page d'origine. Un nom vide rend une
 * lettre neutre plutôt qu'un rond muet.
 */
export function initiales(nom: string | null | undefined): string {
  const mots = (nom ?? "")
    .split(/[\s-]+/)
    .map((m) => m.trim())
    .filter(Boolean);

  if (mots.length === 0) return "?";
  return mots
    .slice(0, 2)
    .map((m) => m[0]!.toUpperCase())
    .join("");
}

/** La longueur d'une citation dans une bulle, telle que la coupait l'original. */
export const LONGUEUR_CITATION = 90;

/** Le message cité, raccourci - une citation qui déroule tout n'en est plus une. */
export function citation(contenu: string | null | undefined): string {
  const texte = (contenu ?? "").trim();
  if (texte.length <= LONGUEUR_CITATION) return texte;
  return texte.slice(0, LONGUEUR_CITATION) + "…";
}

/**
 * Une conversation répond-elle à la recherche ?
 *
 * Le nom et le dernier message, sans accent ni casse : chercher « societe » doit
 * trouver « SOCIÉTÉ ». L'original comparait en minuscules seulement, ce qui faisait
 * échouer toute recherche tapée sans accent.
 */
function sansAccent(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function correspond(
  conversation: { titre: string; dernierMessage?: string | null },
  recherche: string
): boolean {
  const cherche = sansAccent(recherche.trim());
  if (!cherche) return true;

  return (
    sansAccent(conversation.titre).includes(cherche) ||
    sansAccent(conversation.dernierMessage ?? "").includes(cherche)
  );
}

/** L'heure d'un message dans sa bulle : HH:MM, heure locale. */
export function heureCourte(quand: Date): string {
  const deuxChiffres = (n: number) => String(n).padStart(2, "0");
  return deuxChiffres(quand.getHours()) + ":" + deuxChiffres(quand.getMinutes());
}

/**
 * L'horodatage d'une conversation dans la liste.
 *
 * L'heure pour aujourd'hui, « Hier » pour la veille, la date sinon : dans une liste,
 * « 14:32 » ne dit rien d'utile sur un message d'il y a trois semaines.
 */
export function dateCourte(quand: Date, maintenant: Date = new Date()): string {
  const deuxChiffres = (n: number) => String(n).padStart(2, "0");
  const memeJour =
    quand.getFullYear() === maintenant.getFullYear() &&
    quand.getMonth() === maintenant.getMonth() &&
    quand.getDate() === maintenant.getDate();

  if (memeJour) return heureCourte(quand);

  const veille = new Date(maintenant);
  veille.setDate(veille.getDate() - 1);
  const estHier =
    quand.getFullYear() === veille.getFullYear() &&
    quand.getMonth() === veille.getMonth() &&
    quand.getDate() === veille.getDate();

  if (estHier) return "Hier";
  return deuxChiffres(quand.getDate()) + "/" + deuxChiffres(quand.getMonth() + 1);
}

/** La longueur de l'aperçu dans la liste, telle que la coupait l'original. */
export const LONGUEUR_APERCU = 44;

/**
 * L'aperçu du dernier message dans la liste.
 *
 * Préfixé de « Vous : » quand c'est le sien : sans cela, on ne sait pas si
 * l'interlocuteur a répondu ou si l'on regarde son propre message.
 */
export function apercuDeConversation(dernier: {
  contenu?: string | null;
  deMoi?: boolean;
}): string {
  const texte = (dernier.contenu ?? "").trim();
  if (!texte) return "Aucun message";

  const complet = (dernier.deMoi ? "Vous : " : "") + texte;
  return complet.length > LONGUEUR_APERCU
    ? complet.slice(0, LONGUEUR_APERCU) + "…"
    : complet;
}

export interface Message {
  id: number;
  expediteurId: number;
  contenu: string;
  type: string | null;
  lu: boolean;
  envoyeLe: Date;
}

/** Les messages reçus et non lus. Les siens ne comptent jamais. */
export function nonLus(messages: Message[], moi: number): number {
  return messages.filter((m) => m.expediteurId !== moi && !m.lu).length;
}

/**
 * Regroupement par jour, pour intercaler une date dans le fil.
 *
 * La clé est la date locale et non l'horodatage : deux messages du même jour
 * doivent se retrouver ensemble, quelle que soit l'heure.
 */
export function grouperParJour<T extends { envoyeLe: Date }>(messages: T[]): [string, T[]][] {
  const groupes = new Map<string, T[]>();

  for (const message of messages) {
    const jour = message.envoyeLe.toISOString().slice(0, 10);
    const existant = groupes.get(jour);
    if (existant) existant.push(message);
    else groupes.set(jour, [message]);
  }

  return [...groupes.entries()];
}

/** « Aujourd'hui » et « Hier » se lisent mieux qu'une date. */
export function libelleJour(jour: string, maintenant: Date = new Date()): string {
  const aujourdhui = maintenant.toISOString().slice(0, 10);
  const hier = new Date(maintenant.getTime() - 86_400_000).toISOString().slice(0, 10);

  if (jour === aujourdhui) return "Aujourd'hui";
  if (jour === hier) return "Hier";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(jour + "T12:00:00Z"));
}

export const LONGUEUR_MAXIMALE = 5000;
