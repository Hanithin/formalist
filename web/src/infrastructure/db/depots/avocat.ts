import { prisma } from "../client";
import { Interdit } from "../utilisateur-courant";
import { exigerDossier, listerDossiers } from "./dossiers";
import {
  transitionPermise,
  libelleEtat,
  messageAuClient,
} from "@/domain/formalite/transitions";
import { equipeDe } from "./equipe";
import type { UtilisateurConnecte } from "../sessions";

/**
 * L'espace avocat.
 *
 * Il ne définit aucune règle d'accès qui lui soit propre : un avocat voit les
 * dossiers qui lui sont assignés et ceux de son cabinet, ce que listerDossiers
 * sait déjà faire. Réécrire la règle ici la ferait diverger.
 */

function exigerAvocat(utilisateur: UtilisateurConnecte) {
  if (!utilisateur.roles.includes("avocat") && !utilisateur.roles.includes("admin")) {
    throw new Interdit("Cet espace est réservé aux avocats");
  }
}

export async function dossiersDuCabinet(utilisateur: UtilisateurConnecte) {
  exigerAvocat(utilisateur);

  const dossiers = await listerDossiers(utilisateur);
  if (dossiers.length === 0) return [];

  const identifiants = dossiers.map((d) => d.id);

  const [clients, documents, notes] = await Promise.all([
    prisma.users.findMany({
      where: { id: { in: dossiers.map((d) => d.user_id) } },
      select: { id: true, name: true, email: true },
    }),
    prisma.documents.groupBy({
      by: ["formalite_id"],
      where: { formalite_id: { in: identifiants }, status: "uploaded" },
      _count: { _all: true },
    }),
    prisma.team_notes.groupBy({
      by: ["formalite_id"],
      where: { formalite_id: { in: identifiants } },
      _count: { _all: true },
    }),
  ]);

  const parClient = new Map(clients.map((c) => [c.id, c]));
  const aVerifier = new Map(documents.map((d) => [d.formalite_id, d._count._all]));
  const nbNotes = new Map(notes.map((n) => [n.formalite_id, n._count._all]));

  return dossiers.map((d) => ({
    id: d.id,
    societe: d.societe || "Sans nom",
    forme: d.forme,
    status: d.status,
    phase: d.phase ?? 1,
    offre: d.offer,
    client: parClient.get(d.user_id)?.name ?? "Client inconnu",
    clientEmail: parClient.get(d.user_id)?.email ?? null,
    documentsAVerifier: aVerifier.get(d.id) ?? 0,
    notes: nbNotes.get(d.id) ?? 0,
    monDossier: d.assigned_avocat_id === utilisateur.id,
  }));
}

export async function dossierPourAvocat(utilisateur: UtilisateurConnecte, dossierId: number) {
  exigerAvocat(utilisateur);
  const dossier = await exigerDossier(utilisateur, dossierId);

  const [client, documents, notes, historique] = await Promise.all([
    prisma.users.findUnique({
      where: { id: dossier.user_id },
      select: { name: true, email: true },
    }),
    prisma.documents.findMany({
      where: { formalite_id: dossierId },
      orderBy: { created_at: "desc" },
    }),
    prisma.team_notes.findMany({
      where: { formalite_id: dossierId },
      orderBy: { created_at: "desc" },
      include: { users: { select: { name: true } } },
    }),
    prisma.audit_log.findMany({
      where: { formalite_id: dossierId },
      orderBy: { created_at: "desc" },
      take: 30,
      include: { users: { select: { name: true } } },
    }),
  ]);

  let donnees: Record<string, unknown> = {};
  try {
    donnees = JSON.parse(dossier.data_json ?? "{}");
  } catch {
    donnees = {};
  }

  return { dossier, client, documents, notes, historique, donnees };
}

/**
 * Note interne sur un dossier.
 *
 * Elle n'est visible que de l'équipe qui l'écrit : le client ne la voit jamais,
 * et une autre équipe non plus.
 */
export async function ajouterNote(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  contenu: string
) {
  exigerAvocat(utilisateur);
  await exigerDossier(utilisateur, dossierId);

  // L'équipe est créée au besoin : elle est un détail d'organisation, et exiger
  // un détour par la page Équipe avant de pouvoir écrire une note n'aurait aucun
  // sens pour la personne qui travaille sur un dossier.
  const equipe = await equipeDe(utilisateur);

  return prisma.team_notes.create({
    data: {
      formalite_id: dossierId,
      team_id: equipe.id,
      author_id: utilisateur.id,
      content: contenu.slice(0, 5000),
    },
  });
}

/**
 * Fait changer un dossier d'état.
 *
 * Le client est prévenu quand le changement le concerne, et la trace est écrite
 * dans le journal d'audit - c'est elle qui permet d'instruire une contestation.
 */
export async function changerEtatDossier(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  vers: string,
  commentaire?: string
) {
  exigerAvocat(utilisateur);
  const dossier = await exigerDossier(utilisateur, dossierId);

  if (dossier.status === vers) return { inchange: true as const };

  if (!transitionPermise(dossier.status, vers)) {
    throw new Interdit(
      "Un dossier « " + libelleEtat(dossier.status) + " » ne peut pas passer à « " +
        libelleEtat(vers) + " »"
    );
  }

  await prisma.formalites.update({
    where: { id: dossierId },
    data: {
      status: vers,
      finalized_at: vers === "terminee" ? new Date() : dossier.finalized_at,
      updated_at: new Date(),
    },
  });

  const message = messageAuClient(vers, dossier.societe || "votre société");
  if (message) {
    await prisma.notifications.create({
      data: {
        user_id: dossier.user_id,
        type: "changement_etat",
        content: message,
        formalite_id: dossierId,
      },
    });
  }

  await prisma.audit_log.create({
    data: {
      formalite_id: dossierId,
      actor_id: utilisateur.id,
      actor_role: utilisateur.roles[0] ?? "avocat",
      action: "etat_" + vers,
      before_value: dossier.status,
      after_value: vers,
      comment: commentaire?.slice(0, 1000) ?? null,
    },
  });

  return { inchange: false as const, etat: vers };
}

/**
 * Assigne un avocat à un dossier.
 *
 * Un avocat s'attribue un dossier de son cabinet ; un administrateur en assigne
 * un à quelqu'un d'autre.
 */
export async function assignerAvocat(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  avocatId: number
) {
  exigerAvocat(utilisateur);
  await exigerDossier(utilisateur, dossierId);

  if (avocatId !== utilisateur.id && !utilisateur.roles.includes("admin")) {
    throw new Interdit("Vous ne pouvez vous assigner qu'à vous-même");
  }

  const cible = await prisma.users.findUnique({ where: { id: avocatId } });
  if (!cible || cible.role !== "avocat") {
    throw new Interdit("Ce compte n'est pas un avocat");
  }

  await prisma.formalites.update({
    where: { id: dossierId },
    data: { assigned_avocat_id: avocatId, updated_at: new Date() },
  });

  await prisma.audit_log.create({
    data: {
      formalite_id: dossierId,
      actor_id: utilisateur.id,
      actor_role: utilisateur.roles[0] ?? "avocat",
      action: "avocat_assigne",
      after_value: cible.name,
    },
  });

  return { avocat: cible.name };
}

/** Valide ou refuse une pièce déposée par le client. */
export async function statuerSurDocument(
  utilisateur: UtilisateurConnecte,
  documentId: number,
  decision: "valider" | "refuser",
  motif?: string
) {
  exigerAvocat(utilisateur);

  const document = await prisma.documents.findUnique({ where: { id: documentId } });
  if (!document) throw new Interdit("Ce document n'existe pas ou ne vous est pas accessible");

  // Le contrôle porte sur le dossier : c'est lui qui décide de l'accès.
  await exigerDossier(utilisateur, document.formalite_id);

  const misAJour = await prisma.documents.update({
    where: { id: documentId },
    data:
      decision === "valider"
        ? { status: "verified", rejection_reason: null, rejected_at: null }
        : { rejection_reason: motif?.slice(0, 500) || "Document non conforme", rejected_at: new Date() },
  });

  await prisma.audit_log.create({
    data: {
      formalite_id: document.formalite_id,
      actor_id: utilisateur.id,
      actor_role: utilisateur.roles[0] ?? "avocat",
      action: decision === "valider" ? "document_valide" : "document_refuse",
      target_field: document.name,
      comment: decision === "refuser" ? (motif ?? null) : null,
    },
  });

  return misAJour;
}
