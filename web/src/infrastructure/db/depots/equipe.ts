import { prisma } from "../client";
import { Interdit } from "../utilisateur-courant";
import {
  peutGererLEquipe,
  etatInvitation,
  DUREE_INVITATION_MS,
  type Equipe,
  type Membre,
} from "@/domain/equipe/invitations";
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

  return brutes.map((i) => ({
    ...i,
    etat: etatInvitation({
      accepteeLe: i.accepted_at,
      revoqueeLe: i.revoked_at,
      expireLe: i.expires_at,
    }),
  }));
}

/** Vue complète de l'équipe pour la page, avec le droit de gérer déjà calculé. */
export async function tableauDeLEquipe(utilisateur: UtilisateurConnecte) {
  const equipe = await equipeDe(utilisateur);
  const membres = await membresDe(equipe.id);
  const moi = membres.find((m) => m.user_id === utilisateur.id);

  const description: Equipe = { id: equipe.id, type: equipe.type === "cabinet" ? "cabinet" : "client" };
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

  const description: Equipe = { id: equipe.id, type: equipe.type === "cabinet" ? "cabinet" : "client" };
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
