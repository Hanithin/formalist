import { prisma } from "../client";
import { Interdit } from "../utilisateur-courant";
import {
  peutGererLEquipe,
  etatInvitation,
  peutRetirer,
  peutChangerLeRole,
  roleAccorde,
  DUREE_INVITATION_MS,
  type Equipe,
  type Membre,
} from "@/domain/equipe/invitations";
import { droitsDemandes, type Droits } from "@/domain/equipe/droits";
import { jeton } from "@/lib/mots-de-passe";
import { adresseApplication } from "@/lib/site";
import type { UtilisateurConnecte } from "../sessions";

/**
 * Accès à l'équipe.
 *
 * Comme pour les dossiers, chaque fonction exige l'utilisateur : on ne peut pas
 * lire une équipe sans dire pour qui.
 */

/**
 * L'équipe de l'utilisateur, créée au premier accès.
 *
 * Un avocat ouvre un cabinet, tout le monde une équipe cliente : le type
 * détermine ensuite qui peut inviter, et il ne change plus.
 */
export async function equipeDe(utilisateur: UtilisateurConnecte) {
  const existante = await prisma.team_members.findFirst({
    where: { user_id: utilisateur.id },
    include: { teams: true },
  });
  if (existante?.teams) return existante.teams;

  const estAvocat = utilisateur.roles.includes("avocat");
  const equipe = await prisma.teams.create({
    data: {
      name: estAvocat ? "Cabinet de " + utilisateur.nom : "Équipe de " + utilisateur.nom,
      type: estAvocat ? "cabinet" : "client",
      owner_id: utilisateur.id,
    },
  });

  await prisma.team_members.create({
    data: {
      team_id: equipe.id,
      user_id: utilisateur.id,
      role: estAvocat ? "avocat" : "admin",
      can_create: true,
      can_edit: true,
      can_view_all: true,
    },
  });

  return equipe;
}

export async function membresDe(equipeId: number) {
  return prisma.team_members.findMany({
    where: { team_id: equipeId },
    include: { users: { select: { id: true, name: true, email: true } } },
    orderBy: { created_at: "asc" },
  });
}

export async function invitationsDe(equipeId: number) {
  const brutes = await prisma.team_invitations.findMany({
    where: { team_id: equipeId },
    orderBy: { created_at: "desc" },
  });

  return brutes.map((i) => {
    const etat = etatInvitation({
      accepteeLe: i.accepted_at,
      revoqueeLe: i.revoked_at,
      expireLe: i.expires_at,
    });

    return {
      ...i,
      etat,
      /*
       * Le lien d'acceptation, pour celles qui en ont encore un.
       *
       * Il vaut jeton : on ne le sort que pour une invitation vivante, et jamais pour
       * une invitation acceptée, révoquée ou périmée - le geste « copier le lien »
       * n'aurait alors rien à donner qui fonctionne.
       */
      lien:
        etat === "en_attente"
          ? adresseApplication() + "/api/equipe/accepter?jeton=" + encodeURIComponent(i.token)
          : null,
    };
  });
}

/** Vue complète de l'équipe pour la page, avec le droit de gérer déjà calculé. */
export async function tableauDeLEquipe(utilisateur: UtilisateurConnecte) {
  const equipe = await equipeDe(utilisateur);
  const membres = await membresDe(equipe.id);
  const moi = membres.find((m) => m.user_id === utilisateur.id);

  const description: Equipe = {
    id: equipe.id,
    type: equipe.type === "cabinet" ? "cabinet" : "client",
  };
  const membreCourant: Membre | null = moi
    ? { utilisateurId: moi.user_id, role: moi.role as Membre["role"] }
    : null;

  return {
    equipe: description,
    nom: equipe.name,
    membres,
    invitations: await invitationsDe(equipe.id),
    peutGerer: peutGererLEquipe(description, membreCourant, utilisateur.roles),
  };
}

/** Lève Interdit si l'utilisateur n'a pas le droit de gérer son équipe. */
export async function exigerGestionDEquipe(utilisateur: UtilisateurConnecte) {
  const equipe = await equipeDe(utilisateur);
  const membres = await membresDe(equipe.id);
  const moi = membres.find((m) => m.user_id === utilisateur.id);

  const description: Equipe = {
    id: equipe.id,
    type: equipe.type === "cabinet" ? "cabinet" : "client",
  };
  const membreCourant: Membre | null = moi
    ? { utilisateurId: moi.user_id, role: moi.role as Membre["role"] }
    : null;

  if (!peutGererLEquipe(description, membreCourant, utilisateur.roles)) {
    throw new Interdit(
      description.type === "cabinet"
        ? "Seul un avocat du cabinet peut gérer les membres"
        : "Seul un administrateur de l'équipe peut gérer les membres"
    );
  }

  return { equipe: description, nom: equipe.name, membres };
}

export const EXPIRATION_INVITATION = DUREE_INVITATION_MS;

/**
 * Accepte une invitation.
 *
 * Le jeton fait foi : la personne invitée n'est pas forcément connectée, et son
 * adresse peut différer de celle du compte qu'elle utilise. On exige donc une
 * session, et que son adresse corresponde à l'invitation - sans quoi un jeton
 * intercepté ferait entrer n'importe qui dans l'équipe.
 */
export async function accepterInvitation(utilisateur: UtilisateurConnecte, jeton: string) {
  const invitation = await prisma.team_invitations.findUnique({ where: { token: jeton } });

  const etat = invitation
    ? etatInvitation({
        accepteeLe: invitation.accepted_at,
        revoqueeLe: invitation.revoked_at,
        expireLe: invitation.expires_at,
      })
    : null;

  if (!invitation || etat !== "en_attente") return { ok: false as const, etat: etat ?? "inconnue" };

  if (invitation.email.toLowerCase() !== utilisateur.email.toLowerCase()) {
    return { ok: false as const, etat: "autre_compte" as const };
  }

  // Déjà membre : on n'ajoute pas une seconde fois, mais on clôt l'invitation.
  const deja = await prisma.team_members.findFirst({
    where: { team_id: invitation.team_id, user_id: utilisateur.id },
  });

  if (!deja) {
    await prisma.team_members.create({
      data: {
        team_id: invitation.team_id,
        user_id: utilisateur.id,
        role: invitation.role,
        can_view_all: invitation.can_view_all,
        can_edit: invitation.can_edit,
        can_create: invitation.can_create,
      },
    });
  }

  await prisma.team_invitations.update({
    where: { id: invitation.id },
    data: { accepted_at: new Date() },
  });

  return { ok: true as const, equipeId: invitation.team_id };
}

/**
 * Renvoie une invitation en attente : nouveau jeton, nouveau délai.
 *
 * Le nom de l'équipe repart avec, parce que l'appelant a un courriel à envoyer et
 * qu'il ne l'a pas autrement sous la main.
 */
export async function renvoyerInvitation(utilisateur: UtilisateurConnecte, invitationId: number) {
  const { equipe, nom } = await exigerGestionDEquipe(utilisateur);

  const invitation = await prisma.team_invitations.findUnique({ where: { id: invitationId } });
  if (!invitation || invitation.team_id !== equipe.id) {
    throw new Interdit("Cette invitation n'existe pas ou ne vous est pas accessible");
  }
  if (invitation.accepted_at) throw new Interdit("Cette invitation a déjà été acceptée");

  const renvoyee = await prisma.team_invitations.update({
    where: { id: invitationId },
    data: {
      token: jeton(),
      expires_at: new Date(Date.now() + DUREE_INVITATION_MS),
      revoked_at: null,
    },
  });

  return { invitation: renvoyee, nom };
}

/**
 * Change le rôle et les droits d'un membre déjà en place.
 *
 * Les droits absents de la demande gardent leur valeur : un panneau qui n'expose que
 * le rôle ne doit pas remettre les trois cases à zéro en passant.
 */
export async function modifierMembre(
  utilisateur: UtilisateurConnecte,
  membreId: number,
  demande: { role?: string } & Partial<Droits>
) {
  const { equipe, membres } = await exigerGestionDEquipe(utilisateur);

  const cible = membres.find((m) => m.id === membreId);
  if (!cible) throw new Interdit("Ce membre n'existe pas ou ne vous est pas accessible");

  const role =
    demande.role === undefined
      ? (cible.role as Membre["role"])
      : roleAccorde(equipe, demande.role);

  const verdict = peutChangerLeRole(
    equipe,
    membres.map((m) => ({ utilisateurId: m.user_id, role: m.role as Membre["role"] })),
    { utilisateurId: cible.user_id, role: cible.role as Membre["role"] },
    role
  );
  if (!verdict.autorise) throw new Interdit(verdict.raison ?? "Ce rôle ne peut pas être changé");

  const droits = droitsDemandes(demande, {
    voitTousLesDossiers: cible.can_view_all,
    peutModifier: cible.can_edit,
    peutCreer: cible.can_create,
  });

  await prisma.team_members.update({
    where: { id: membreId },
    data: {
      role,
      can_view_all: droits.voitTousLesDossiers,
      can_edit: droits.peutModifier,
      can_create: droits.peutCreer,
    },
  });

  return { membre: membreId, role, ...droits };
}

export async function revoquerInvitation(utilisateur: UtilisateurConnecte, invitationId: number) {
  const { equipe } = await exigerGestionDEquipe(utilisateur);

  const invitation = await prisma.team_invitations.findUnique({ where: { id: invitationId } });
  if (!invitation || invitation.team_id !== equipe.id) {
    throw new Interdit("Cette invitation n'existe pas ou ne vous est pas accessible");
  }

  return prisma.team_invitations.update({
    where: { id: invitationId },
    data: { revoked_at: new Date() },
  });
}

/** Retire un membre, sauf si l'équipe se retrouverait sans personne pour la gérer. */
export async function retirerMembre(utilisateur: UtilisateurConnecte, membreId: number) {
  const { equipe, membres } = await exigerGestionDEquipe(utilisateur);

  const cible = membres.find((m) => m.id === membreId);
  if (!cible) throw new Interdit("Ce membre n'existe pas ou ne vous est pas accessible");

  const verdict = peutRetirer(
    equipe,
    membres.map((m) => ({ utilisateurId: m.user_id, role: m.role as Membre["role"] })),
    { utilisateurId: cible.user_id, role: cible.role as Membre["role"] }
  );
  if (!verdict.autorise) throw new Interdit(verdict.raison ?? "Ce membre ne peut pas être retiré");

  await prisma.team_members.delete({ where: { id: membreId } });
  return { retire: cible.user_id };
}
