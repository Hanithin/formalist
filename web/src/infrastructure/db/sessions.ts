import { prisma } from "./client";
import {
  DUREE_ABSOLUE_MS,
  doitRafraichir,
  sessionValide,
  type Session,
} from "@/domain/acces/session";
import type { Role } from "@/domain/acces/regles";

/**
 * Lecture et écriture des sessions.
 *
 * Les décisions - une session est-elle encore valide, faut-il rafraîchir - sont
 * prises par le domaine. Ce module ne fait que parler à la base.
 */

export interface UtilisateurConnecte {
  id: number;
  email: string;
  nom: string;
  roles: Role[];
  jeton: string;
}

/** Les rôles sont stockés en JSON, avec une colonne role héritée en secours. */
function lireRoles(brut: string | null, secours: string | null): Role[] {
  if (brut) {
    try {
      const analyse: unknown = JSON.parse(brut);
      if (Array.isArray(analyse) && analyse.length) return analyse as Role[];
    } catch {
      // colonne mal formée : on retombe sur le rôle unique
    }
  }
  return [(secours ?? "user") as Role];
}

export async function creerSession(utilisateurId: number, jeton: string): Promise<void> {
  await prisma.sessions.create({
    data: {
      token: jeton,
      user_id: utilisateurId,
      expires_at: new Date(Date.now() + DUREE_ABSOLUE_MS),
    },
  });
}

/**
 * Rend l'utilisateur derrière un jeton, ou null.
 *
 * Une session invalide est révoquée au passage : la laisser en base laisserait un
 * jeton mort utilisable si les règles d'expiration changeaient un jour.
 */
export async function utilisateurDuJeton(jeton: string): Promise<UtilisateurConnecte | null> {
  if (!jeton) return null;

  const ligne = await prisma.sessions.findUnique({
    where: { token: jeton },
    include: {
      users: {
        select: { id: true, email: true, name: true, roles: true, role: true, suspended: true },
      },
    },
  });
  if (!ligne?.users) return null;
  if (ligne.users.suspended) return null;

  const session: Session = {
    jeton,
    utilisateurId: ligne.user_id,
    creeeLe: ligne.created_at ?? new Date(0),
    vueLe: ligne.last_seen_at ?? ligne.created_at ?? new Date(0),
    revoqueeLe: ligne.revoked_at ?? null,
  };

  if (!sessionValide(session)) {
    await revoquerSession(jeton);
    return null;
  }

  if (doitRafraichir(session)) {
    await prisma.sessions.update({
      where: { token: jeton },
      data: { last_seen_at: new Date() },
    });
  }

  return {
    id: ligne.users.id,
    email: ligne.users.email,
    nom: ligne.users.name,
    roles: lireRoles(ligne.users.roles, ligne.users.role),
    jeton,
  };
}

export async function revoquerSession(jeton: string): Promise<void> {
  await prisma.sessions
    .update({ where: { token: jeton }, data: { revoked_at: new Date() } })
    .catch(() => undefined); // session déjà absente : rien à révoquer
}

/**
 * Ferme toutes les sessions d'un compte.
 *
 * Appelé au changement de mot de passe : sans ça, quelqu'un qui a volé une session
 * la garde alors même que le mot de passe a été changé pour l'en chasser.
 */
export async function revoquerToutesLesSessions(utilisateurId: number): Promise<number> {
  const { count } = await prisma.sessions.updateMany({
    where: { user_id: utilisateurId, revoked_at: null },
    data: { revoked_at: new Date() },
  });
  return count;
}
