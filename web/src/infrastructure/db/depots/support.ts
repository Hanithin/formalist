import { prisma } from "../client";
import { Interdit } from "../utilisateur-courant";
import type { UtilisateurConnecte } from "../sessions";

/**
 * Messagerie de support.
 *
 * Distincte de celle des dossiers : elle relie un client à l'équipe de la
 * plateforme, sans avocat ni dossier. Un administrateur voit toutes les
 * conversations ; un client ne voit que la sienne.
 */

export const LONGUEUR_MAXIMALE = 5000;

/** La conversation d'un client, créée au premier message. */
export async function conversationDe(utilisateurId: number) {
  // La table a le compte pour clé : une conversation par client, pas davantage.
  return prisma.support_conversations.upsert({
    where: { user_id: utilisateurId },
    update: {},
    create: { user_id: utilisateurId },
  });
}

export async function messagesDe(utilisateur: UtilisateurConnecte, clientId?: number) {
  const estAdmin = utilisateur.roles.includes("admin");

  // Un client qui désigne quelqu'un d'autre se voit refuser, plutôt que redirigé
  // en silence vers sa propre conversation : une demande qu'on n'honore pas doit
  // se voir, c'est soit un défaut, soit une tentative.
  if (!estAdmin && clientId !== undefined && clientId !== utilisateur.id) {
    throw new Interdit("Vous ne pouvez consulter que votre propre conversation");
  }

  const cible = estAdmin ? (clientId ?? utilisateur.id) : utilisateur.id;

  const lignes = await prisma.support_messages.findMany({
    where: { user_id: cible },
    orderBy: { created_at: "asc" },
    include: { users_support_messages_sender_idTousers: { select: { name: true } } },
  });

  return lignes.map((m) => ({
    id: m.id,
    // Un message peut n'être qu'une pièce jointe : le contenu est alors vide.
    contenu: m.content ?? "",
    fichier: m.file_path,
    expediteurId: m.sender_id,
    expediteur: m.users_support_messages_sender_idTousers?.name ?? "Support",
    // Un message écrit par quelqu'un d'autre que le client vient du support.
    duSupport: m.sender_id !== cible,
    lu: !!m.read,
    envoyeLe: m.created_at,
  }));
}

export async function ecrireAuSupport(
  utilisateur: UtilisateurConnecte,
  contenu: string,
  clientId?: number
) {
  const estAdmin = utilisateur.roles.includes("admin");

  if (!estAdmin && clientId !== undefined && clientId !== utilisateur.id) {
    throw new Interdit("Vous ne pouvez écrire que dans votre propre conversation");
  }

  const cible = estAdmin ? clientId : utilisateur.id;
  if (!cible) throw new Interdit("Destinataire manquant");

  await conversationDe(cible);

  const message = await prisma.support_messages.create({
    data: {
      user_id: cible,
      sender_id: utilisateur.id,
      content: contenu.slice(0, LONGUEUR_MAXIMALE),
      read: false,
    },
  });

  return {
    id: message.id,
    contenu: message.content ?? "",
    expediteurId: message.sender_id,
    expediteur: utilisateur.nom,
    duSupport: estAdmin,
    envoyeLe: message.created_at,
  };
}

export async function marquerLus(utilisateur: UtilisateurConnecte) {
  const { count } = await prisma.support_messages.updateMany({
    where: { user_id: utilisateur.id, sender_id: { not: utilisateur.id }, read: false },
    data: { read: true },
  });
  return count;
}

export async function nonLus(utilisateur: UtilisateurConnecte) {
  return prisma.support_messages.count({
    where: { user_id: utilisateur.id, sender_id: { not: utilisateur.id }, read: false },
  });
}

/**
 * Archive une conversation.
 *
 * Elle disparaît de la liste sans que rien ne soit effacé : les échanges restent
 * consultables, et une nouvelle question rouvre la conversation.
 */
export async function archiver(utilisateur: UtilisateurConnecte, clientId: number, archivee = true) {
  if (!utilisateur.roles.includes("admin")) {
    throw new Interdit("Réservé aux administrateurs");
  }

  await prisma.support_conversations.upsert({
    where: { user_id: clientId },
    update: { archived: archivee, archived_at: archivee ? new Date() : null },
    create: { user_id: clientId, archived: archivee, archived_at: archivee ? new Date() : null },
  });

  return { archivee };
}

/** Les conversations, pour l'administration. Les archivées sont écartées. */
export async function conversations(utilisateur: UtilisateurConnecte) {
  if (!utilisateur.roles.includes("admin")) {
    throw new Interdit("Cette vue est réservée aux administrateurs");
  }

  const archivees = new Set(
    (await prisma.support_conversations.findMany({ where: { archived: true } })).map(
      (c) => c.user_id
    )
  );

  const derniers = await prisma.support_messages.findMany({
    orderBy: { created_at: "desc" },
    include: { users_support_messages_user_idTousers: { select: { id: true, name: true, email: true } } },
  });

  const parClient = new Map<number, (typeof derniers)[number]>();
  for (const m of derniers) {
    if (archivees.has(m.user_id)) continue;
    if (!parClient.has(m.user_id)) parClient.set(m.user_id, m);
  }

  return [...parClient.values()].map((m) => ({
    clientId: m.user_id,
    client: m.users_support_messages_user_idTousers?.name ?? "Client",
    email: m.users_support_messages_user_idTousers?.email ?? null,
    dernierMessage: m.content ?? "Pièce jointe",
    dernierLe: m.created_at,
  }));
}
