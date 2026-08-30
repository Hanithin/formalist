import { prisma } from "../client";
import { exigerDossier, mesDossiers } from "./dossiers";
import { typeValide, LONGUEUR_MAXIMALE } from "@/domain/messagerie/messages";
import type { UtilisateurConnecte } from "../sessions";
import { prevenir } from "./avis";
import { messageRecu, redireParCourriel } from "@/domain/formalite/avis";

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
    // Le message auquel celui-ci répond : la bulle en cite un extrait.
    repondA: m.reply_to_id,
    lu: !!m.read,
    envoyeLe: m.created_at,
  }));
}

export async function envoyerMessage(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  contenu: string,
  type?: string,
  options: {
    repondA?: number | null;
    fichier?: string | null;
    /**
     * Prévenir l'autre partie, ou non.
     *
     * Les messages que le cabinet pose lui-même en refusant une pièce n'en envoient
     * pas un second : l'avis du refus dit déjà tout, et part par courriel avec son
     * motif.
     */
    prevenirLAutre?: boolean;
  } = {}
) {
  const dossier = await exigerDossier(utilisateur, dossierId);

  // On ne cite que dans son propre fil : un identifiant venu de l'extérieur ne doit
  // pas permettre de recopier un extrait du dossier de quelqu'un d'autre.
  let repondA: number | null = null;
  if (options.repondA) {
    const cible = await prisma.messages.findUnique({
      where: { id: options.repondA },
      select: { formalite_id: true },
    });
    if (cible?.formalite_id === dossierId) repondA = options.repondA;
  }

  const cree = await prisma.messages.create({
    data: {
      formalite_id: dossierId,
      sender_id: utilisateur.id,
      content: contenu.slice(0, LONGUEUR_MAXIMALE),
      kind: typeValide(type),
      reply_to_id: repondA,
      file_path: options.fichier ?? null,
    },
  });

  if (options.prevenirLAutre !== false) {
    await prevenirLAutrePartie(utilisateur, dossier, cree.id, cree.content);
  }

  return {
    id: cree.id,
    expediteurId: cree.sender_id,
    expediteur: utilisateur.nom,
    contenu: cree.content,
    type: cree.kind,
    fichier: cree.file_path,
    repondA: cree.reply_to_id,
    lu: false,
    envoyeLe: cree.created_at,
  };
}

/**
 * L'autre partie apprend qu'on lui a écrit.
 *
 * Le fil s'écrivait en base et rien d'autre : ni cloche, ni courriel. Un avocat qui
 * demandait une pièce dans la conversation n'était lu que si le client repassait sur
 * le site ; un client qui répondait attendait de même. Le refus d'une pièce, lui,
 * prévenait par les deux canaux depuis toujours - c'est la même urgence, et le même
 * fil.
 *
 * Une réserve : on ne redit pas ce qui n'a pas encore été lu. Trois messages écrits
 * dans la même minute feraient trois courriels dont les deux derniers n'apprendraient
 * rien, et l'on cesse d'ouvrir ceux qui comptent. La cloche, elle, prend tout.
 */
async function prevenirLAutrePartie(
  utilisateur: UtilisateurConnecte,
  dossier: {
    id: number;
    user_id: number;
    assigned_avocat_id: number | null;
    societe: string | null;
  },
  messageId: number,
  contenu: string
) {
  const destinataire =
    utilisateur.id === dossier.user_id ? dossier.assigned_avocat_id : dossier.user_id;

  /* Un dossier que personne n'a pris n'a pas d'autre partie à qui écrire. */
  if (!destinataire || destinataire === utilisateur.id) return;

  const enAttente = await prisma.messages.count({
    where: {
      formalite_id: dossier.id,
      read: false,
      sender_id: { not: destinataire },
      id: { not: messageId },
    },
  });

  await prevenir(
    destinataire,
    dossier.id,
    messageRecu(utilisateur.nom, dossier.societe || "votre dossier", contenu),
    { courriel: redireParCourriel(enAttente) }
  );
}

/** Marque comme lus les messages reçus dans ce dossier. Les siens sont ignorés. */
/**
 * Le dernier mot du cabinet sur ce dossier, et ce qui reste à lire.
 *
 * Le parcours n'a pas à porter une messagerie : elle existe, complète, à sa place. Il
 * lui suffit de dire qu'on a écrit - « l'avocat demande une pièce » - et d'y mener.
 * Sans cette ligne, un client qui remplit son dossier ne saurait pas qu'on l'attend
 * ailleurs.
 */
export async function dernierMotDuCabinet(utilisateur: UtilisateurConnecte, dossierId: number) {
  await exigerDossier(utilisateur, dossierId);

  const [dernier, nonLus] = await Promise.all([
    prisma.messages.findFirst({
      where: { formalite_id: dossierId, sender_id: { not: utilisateur.id } },
      orderBy: { created_at: "desc" },
      include: { users: { select: { name: true } } },
    }),
    prisma.messages.count({
      where: { formalite_id: dossierId, sender_id: { not: utilisateur.id }, read: false },
    }),
  ]);

  if (!dernier) return { message: null, nonLus: 0 };

  return {
    message: {
      auteur: dernier.users?.name ?? "Le cabinet",
      contenu: dernier.content,
      /* Le type dit la nature de la demande : une pièce réclamée, une correction. */
      type: dernier.kind && dernier.kind !== "text" ? dernier.kind : null,
      aUnePieceJointe: !!dernier.file_path,
      envoyeLe: dernier.created_at.toISOString(),
    },
    nonLus,
  };
}

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
 *
 * Les siens, jamais ceux de toute la plateforme. listerDossiers rendait tout à un
 * administrateur : sa pastille comptait alors les messages reçus dans les dossiers de
 * tous les comptes, qu'il ne lit jamais - elle revenait donc indéfiniment, et ne
 * s'accordait pas avec celle de la colonne, qui compte déjà les siens.
 */
export async function conversations(utilisateur: UtilisateurConnecte) {
  const dossiers = await mesDossiers(utilisateur);
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

  // Le nom de l'avocat en charge : c'est lui qu'on annonce sous le nom du dossier,
  // et son absence qui dit qu'il n'y a encore personne à qui écrire.
  const avocats = [...new Set(dossiers.map((d) => d.assigned_avocat_id).filter(Boolean))];
  const nomsDAvocat = new Map(
    avocats.length
      ? (
          await prisma.users.findMany({
            where: { id: { in: avocats as number[] } },
            select: { id: true, name: true },
          })
        ).map((u) => [u.id, u.name])
      : []
  );

  return dossiers
    .map((d) => {
      const dernier = parDossier.get(d.id);
      return {
        dossierId: d.id,
        // Le client du dossier : c'est lui qui parle à droite dans le fil.
        clientId: d.user_id,
        societe: d.societe || "Sans nom",
        forme: d.forme,
        avocat: d.assigned_avocat_id ? (nomsDAvocat.get(d.assigned_avocat_id) ?? null) : null,
        dernierMessage: dernier?.content ?? null,
        dernierAuteur: dernier?.users?.name ?? null,
        // « Vous : » devant l'aperçu quand c'est soi qui a écrit en dernier.
        dernierDeMoi: dernier ? dernier.sender_id === utilisateur.id : false,
        dernierLe: dernier?.created_at ?? null,
        nonLus: nonLusParDossier.get(d.id) ?? 0,
      };
    })
    .sort((a, b) => (b.dernierLe?.getTime() ?? 0) - (a.dernierLe?.getTime() ?? 0));
}

/**
 * Total des messages non lus, pour la pastille de la colonne et de la bulle.
 *
 * Même périmètre que les conversations : ce qui se compte doit pouvoir se lire.
 */
export async function totalNonLus(utilisateur: UtilisateurConnecte): Promise<number> {
  const dossiers = await mesDossiers(utilisateur);
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
    repondA: m.reply_to_id,
    envoyeLe: m.created_at,
  }));
}
