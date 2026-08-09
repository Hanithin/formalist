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

interface Presentation {
  libelle: string;
  ton: "neutre" | "attente" | "abouti";
  /** Un message qui appelle une action du client se distingue des autres. */
  demandeAction: boolean;
}

const PRESENTATIONS: Record<TypeMessage, Presentation> = {
  text: { libelle: "Message", ton: "neutre", demandeAction: false },
  correction_request: { libelle: "Correction demandée", ton: "attente", demandeAction: true },
  rejection: { libelle: "Document refusé", ton: "attente", demandeAction: true },
  document_request: { libelle: "Document demandé", ton: "attente", demandeAction: true },
  validation_pending: { libelle: "En cours de validation", ton: "attente", demandeAction: false },
  validation: { libelle: "Validé", ton: "abouti", demandeAction: false },
  status_note: { libelle: "Information", ton: "neutre", demandeAction: false },
};

/** Un type inconnu, venu d'une version plus récente, s'affiche comme un message. */
export function typeValide(brut: string | null | undefined): TypeMessage {
  return TYPES_MESSAGE.includes(brut as TypeMessage) ? (brut as TypeMessage) : "text";
}

export function presentation(type: string | null | undefined): Presentation {
  return PRESENTATIONS[typeValide(type)];
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
