import { prisma } from "./client";
import { journal } from "@/lib/journal";
import type { UtilisateurConnecte } from "./sessions";

/**
 * Journal d'audit des actions sensibles.
 *
 * Répond à « qui a consulté cette pièce d'identité, et quand ». Sans lui, on ne
 * peut ni instruire un incident ni répondre à une demande d'accès d'un client.
 *
 * L'écriture ne doit jamais faire échouer l'action qu'elle trace : ne pas avoir
 * consigné une consultation est un problème, empêcher un avocat de travailler en
 * est un plus grand. Un échec part donc dans le journal applicatif.
 */

export type ActionSensible =
  | "dossier_consulte"
  | "document_consulte"
  | "document_depose"
  | "role_modifie"
  | "membre_retire"
  | "dossier_supprime"
  | "sessions_revoquees";

interface Trace {
  dossierId: number;
  auteur: UtilisateurConnecte;
  action: ActionSensible;
  cible?: string | null;
  commentaire?: string | null;
}

export async function tracer({ dossierId, auteur, action, cible, commentaire }: Trace) {
  try {
    await prisma.audit_log.create({
      data: {
        formalite_id: dossierId,
        actor_id: auteur.id,
        actor_role: auteur.roles[0] ?? "user",
        action,
        target_field: cible ?? null,
        comment: commentaire ?? null,
      },
    });
  } catch (e) {
    journal.error({ err: e, action, dossierId }, "Trace d'audit non écrite");
  }
}

/** Les interventions sur un dossier, de la plus récente à la plus ancienne. */
export async function historique(dossierId: number, limite = 50) {
  return prisma.audit_log.findMany({
    where: { formalite_id: dossierId },
    orderBy: { created_at: "desc" },
    take: limite,
    include: { users: { select: { name: true } } },
  });
}
