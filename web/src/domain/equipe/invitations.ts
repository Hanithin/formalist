import type { Role, TypeEquipe } from "@/domain/acces/regles";

/**
 * Règles d'invitation dans une équipe, portées depuis routes/team.js.
 *
 * Deux natures d'équipe coexistent. Une équipe cliente réunit les gens d'une même
 * société : son administrateur invite. Un cabinet réunit des avocats : seuls les
 * avocats y invitent, y compris des collaborateurs, parce qu'ils engagent leur
 * responsabilité professionnelle sur les dossiers que ces derniers manipulent.
 */

export type RoleEquipe = "collaborateur" | "admin" | "avocat";

export interface Membre {
  utilisateurId: number;
  role: RoleEquipe;
}

export interface Equipe {
  id: number;
  type: TypeEquipe;
}

/** Qui peut inviter, retirer un membre ou changer des droits. */
export function peutGererLEquipe(
  equipe: Equipe,
  membre: Membre | null,
  rolesPlateforme: Role[]
): boolean {
  if (rolesPlateforme.includes("admin")) return true;
  if (!membre) return false;

  if (equipe.type === "cabinet") return membre.role === "avocat";
  return membre.role === "admin";
}

/**
 * Le rôle réellement accordé.
 *
 * Un rôle d'avocat n'a pas de sens hors d'un cabinet : demandé ailleurs, il est
 * ramené à collaborateur plutôt que refusé, pour ne pas bloquer une invitation
 * sur un choix qui n'était de toute façon pas proposé.
 */
export function roleAccorde(equipe: Equipe, demande: string): RoleEquipe {
  if (demande === "avocat") return equipe.type === "cabinet" ? "avocat" : "collaborateur";
  if (demande === "admin") return "admin";
  return "collaborateur";
}

/** Les rôles proposables dans une équipe de ce type. */
export function rolesProposables(equipe: Equipe): RoleEquipe[] {
  return equipe.type === "cabinet"
    ? ["collaborateur", "avocat", "admin"]
    : ["collaborateur", "admin"];
}

export const DUREE_INVITATION_MS = 7 * 24 * 60 * 60 * 1000;

export type EtatInvitation = "en_attente" | "acceptee" | "revoquee" | "expiree";

export function etatInvitation(
  invitation: { accepteeLe: Date | null; revoqueeLe: Date | null; expireLe: Date },
  maintenant: Date = new Date()
): EtatInvitation {
  if (invitation.accepteeLe) return "acceptee";
  if (invitation.revoqueeLe) return "revoquee";
  if (invitation.expireLe.getTime() <= maintenant.getTime()) return "expiree";
  return "en_attente";
}

/**
 * Se retirer soi-même du dernier poste de direction laisserait l'équipe sans
 * personne pour inviter ou gérer les droits.
 */
export function peutRetirer(
  equipe: Equipe,
  membres: Membre[],
  cible: Membre
): { autorise: boolean; raison?: string } {
  const roleDirigeant: RoleEquipe = equipe.type === "cabinet" ? "avocat" : "admin";

  if (cible.role !== roleDirigeant) return { autorise: true };

  const dirigeants = membres.filter((m) => m.role === roleDirigeant);
  if (dirigeants.length > 1) return { autorise: true };

  return {
    autorise: false,
    raison:
      equipe.type === "cabinet"
        ? "Le cabinet doit garder au moins un avocat"
        : "L'équipe doit garder au moins un administrateur",
  };
}
