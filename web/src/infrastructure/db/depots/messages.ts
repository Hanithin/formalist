import { prisma } from "../client";
import { exigerDossier, listerDossiers } from "./dossiers";
import { typeValide, LONGUEUR_MAXIMALE } from "@/domain/messagerie/messages";
import type { UtilisateurConnecte } from "../sessions";

/**
 * Messages rattachés à un dossier.
 *
 * L'accès à un message est celui de son dossier : chaque fonction passe donc par
 * exigerDossier, qui lève si la personne n'y a pas droit. Aucune ne charge un
 * message par identifiant seul.
 */

export async function messagesDuDossier(utilisateur: UtilisateurConnecte, dossierId: number) {
  await exigerDossier(utilisateur, dossierId);

  const lignes = await prisma.messages.findMany({
    where: { formalite_id: dossierId },
    orderBy: { created_at: "asc" },
    include: { users: { select: { id: true, name: true } } },
  });

  return lignes.map((m) => ({
    id: m.id,
    expediteurId: m.sender_id,
    expediteur: m.users?.name ?? "Inconnu",
    contenu: m.content,
    type: m.kind,
    fichier: m.file_path,
    lu: !!m.read,
    envoyeLe: m.created_at,
  }));
}

export async function envoyerMessage(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  contenu: string,
  type?: string
) {
  await exigerDossier(utilisateur, dossierId);

  const cree = await prisma.messages.create({
    data: {
      formalite_id: dossierId,
      sender_id: utilisateur.id,
      content: contenu.slice(0, LONGUEUR_MAXIMALE),
      kind: typeValide(type),
    },
  });

  return {
    id: cree.id,
    expediteurId: cree.sender_id,
    expediteur: utilisateur.nom,
    contenu: cree.content,
    type: cree.kind,
    fichier: cree.file_path,
    lu: false,
    envoyeLe: cree.created_at,
  };
}

/** Marque comme lus les messages reçus dans ce dossier. Les siens sont ignorés. */
export async function marquerLus(utilisateur: UtilisateurConnecte, dossierId: number) {
  await exigerDossier(utilisateur, dossierId);

  const { count } = await prisma.messages.updateMany({
    where: { formalite_id: dossierId, sender_id: { not: utilisateur.id }, read: false },
    data: { read: true },
  });
  return count;
}

/**
 * Les conversations visibles, une par dossier, avec le dernier message.
 *
 * Un dossier sans message apparaît quand même : il faut pouvoir écrire le premier.
 */
export async function conversations(utilisateur: UtilisateurConnecte) {
  const dossiers = await listerDossiers(utilisateur);
  if (!dossiers.length) return [];

  const identifiants = dossiers.map((d) => d.id);

  const derniers = await prisma.messages.findMany({
    where: { formalite_id: { in: identifiants } },
    orderBy: { created_at: "desc" },
    include: { users: { select: { name: true } } },
  });

  const parDossier = new Map<number, (typeof derniers)[number]>();
  for (const m of derniers) {
    if (!parDossier.has(m.formalite_id)) parDossier.set(m.formalite_id, m);
  }

  const compteurs = await prisma.messages.groupBy({
    by: ["formalite_id"],
    where: { formalite_id: { in: identifiants }, sender_id: { not: utilisateur.id }, read: false },
    _count: { _all: true },
  });
  const nonLusParDossier = new Map(compteurs.map((c) => [c.formalite_id, c._count._all]));

  return dossiers
    .map((d) => {
      const dernier = parDossier.get(d.id);
      return {
        dossierId: d.id,
        societe: d.societe || "Sans nom",
        forme: d.forme,
        dernierMessage: dernier?.content ?? null,
        dernierAuteur: dernier?.users?.name ?? null,
        dernierLe: dernier?.created_at ?? null,
        nonLus: nonLusParDossier.get(d.id) ?? 0,
      };
    })
    .sort((a, b) => (b.dernierLe?.getTime() ?? 0) - (a.dernierLe?.getTime() ?? 0));
}

/** Total des messages non lus, pour la pastille de la colonne et de la bulle. */
export async function totalNonLus(utilisateur: UtilisateurConnecte): Promise<number> {
  const dossiers = await listerDossiers(utilisateur);
  if (!dossiers.length) return 0;

  return prisma.messages.count({
    where: {
      formalite_id: { in: dossiers.map((d) => d.id) },
      sender_id: { not: utilisateur.id },
      read: false,
    },
  });
}

/**
 * Messages arrivés après un identifiant donné, pour le flux temps réel.
 *
 * Le flux interroge la base plutôt que de tenir les abonnés en mémoire comme le
 * fait lib/sse.js : une liste en mémoire ne survit pas à un redémarrage et ne
 * traverse pas deux instances, or c'est précisément ce qu'on cherche à permettre.
 */
export async function messagesDepuis(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  apresId: number
) {
  await exigerDossier(utilisateur, dossierId);

  const lignes = await prisma.messages.findMany({
    where: { formalite_id: dossierId, id: { gt: apresId } },
    orderBy: { id: "asc" },
    include: { users: { select: { name: true } } },
  });

  return lignes.map((m) => ({
    id: m.id,
    expediteurId: m.sender_id,
    expediteur: m.users?.name ?? "Inconnu",
    contenu: m.content,
    type: m.kind,
    fichier: m.file_path,
    envoyeLe: m.created_at,
  }));
}
