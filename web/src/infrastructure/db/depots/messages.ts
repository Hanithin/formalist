import { prisma } from "../client";
import { nomDeLaSociete } from "@/domain/formalite/demande";
import { exigerDossier, mesDossiers } from "./dossiers";
import {
  typeValide,
  peutSupprimerUnMessage,
  MENTION_SUPPRIME,
  LONGUEUR_MAXIMALE,
} from "@/domain/messagerie/messages";
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
    /*
     * Un message retiré garde sa place, pas son contenu.
     *
     * Le faire disparaître laisserait un trou dans une conversation que l'autre partie
     * avait peut-être déjà lue, et rien pour dire qu'il y avait là quelque chose. La
     * mention tient la place ; ce qui ne doit plus être lu ne sort pas d'ici - ni le
     * texte, ni le nom du fichier joint, ni le geste que son type réclamait.
     */
    contenu: m.supprime_le ? MENTION_SUPPRIME : m.content,
    /* `!!` et non `!== null` : la colonne vaut `undefined` tant qu'un client Prisma
       d'avant la migration tourne, et `undefined !== null` est vrai - tout le fil
       passait alors pour supprimé. Ce qui compte est qu'une date soit posée. */
    supprime: !!m.supprime_le,
    type: m.supprime_le ? "text" : m.kind,
    fichier: m.supprime_le ? null : m.file_path,
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
    data_json: string | null;
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
    messageRecu(utilisateur.nom, nomDeLaSociete(dossier) || "votre dossier", contenu),
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
/**
 * Retire un message du fil, sans l'effacer de la base.
 *
 * L'avocat qui tient le dossier n'avait aucun moyen de le faire : ni pour son propre
 * message, écrit trop vite ou dans le mauvais fil, ni pour celui d'un client qui vient
 * de poster un relevé bancaire en clair ou un fichier destiné à un autre dossier. Il
 * fallait passer par le support, qui ouvrait la base à la main.
 *
 * N'importe quel message du fil, non les siens seulement : un message du client envoyé
 * par erreur est justement le cas où le retrait sert à quelque chose. Le client, lui,
 * ne retire rien - ce qui s'échange ici fait partie du dossier, et l'y laisser est ce
 * qui permet à chacun de s'y référer plus tard.
 *
 * La ligne reste, avec qui l'a retirée et quand. Sans cela, une suppression serait
 * indiscernable d'un message qui n'aurait jamais existé, et personne ne pourrait
 * répondre à « qu'est-ce qui a disparu de mon dossier ».
 *
 * La pièce jointe reste elle aussi sur le disque, et cesse simplement d'être nommée.
 * L'effacer détruirait un fichier que le dossier a peut-être déjà repris ailleurs - une
 * pièce versée au dossier vaut plus que l'octet qu'elle occupe.
 */
export async function supprimerMessage(utilisateur: UtilisateurConnecte, messageId: number) {
  if (!peutSupprimerUnMessage(utilisateur.roles)) {
    throw new SuppressionRefusee("Seul un avocat peut retirer un message d'un fil.");
  }

  const message = await prisma.messages.findUnique({
    where: { id: messageId },
    select: { id: true, formalite_id: true, supprime_le: true },
  });
  if (!message) return null;

  /* L'accès reste celui du dossier : un avocat ne retire pas un message d'un fil qu'il
     n'a pas le droit de lire. */
  await exigerDossier(utilisateur, message.formalite_id);

  if (message.supprime_le) return { dejaFait: true as const, dossierId: message.formalite_id };

  await prisma.messages.update({
    where: { id: message.id },
    data: { supprime_le: new Date(), supprime_par: utilisateur.id },
  });

  await prisma.audit_log.create({
    data: {
      formalite_id: message.formalite_id,
      actor_id: utilisateur.id,
      actor_role: "avocat",
      action: "message_supprime",
      target_field: String(message.id),
    },
  });

  return { dejaFait: false as const, dossierId: message.formalite_id };
}

/** Le retrait demandé par qui n'en a pas le droit. */
export class SuppressionRefusee extends Error {
  readonly statut = 403;
}

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
      contenu: dernier.supprime_le ? MENTION_SUPPRIME : dernier.content,
      /* Le type dit la nature de la demande : une pièce réclamée, une correction. Un
         message retiré n'en réclame plus aucune : le parcours ne doit pas continuer
         d'afficher le geste attendu d'un message qui n'est plus là. */
      type: !dernier.supprime_le && dernier.kind && dernier.kind !== "text" ? dernier.kind : null,
      aUnePieceJointe: !dernier.supprime_le && !!dernier.file_path,
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
        /* L'aperçu ne ressuscite pas ce que le fil ne montre plus. */
        dernierMessage: dernier ? (dernier.supprime_le ? MENTION_SUPPRIME : dernier.content) : null,
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
    contenu: m.supprime_le ? MENTION_SUPPRIME : m.content,
    /* `!!` et non `!== null` : la colonne vaut `undefined` tant qu'un client Prisma
       d'avant la migration tourne, et `undefined !== null` est vrai - tout le fil
       passait alors pour supprimé. Ce qui compte est qu'une date soit posée. */
    supprime: !!m.supprime_le,
    type: m.supprime_le ? "text" : m.kind,
    fichier: m.supprime_le ? null : m.file_path,
    repondA: m.reply_to_id,
    envoyeLe: m.created_at,
  }));
}
