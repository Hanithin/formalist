import { prisma } from "../client";
import { Interdit } from "../utilisateur-courant";
import { revoquerToutesLesSessions } from "../sessions";
import {
  verifierChangementDeRoles,
  verifierSuspension,
  type Anomalie,
} from "@/domain/acces/administration";
import type { Role } from "@/domain/acces/regles";
import type { UtilisateurConnecte } from "../sessions";

/**
 * Administration de la plateforme.
 *
 * Chaque fonction exige le rôle administrateur. C'est le seul endroit où l'on
 * accorde le rôle avocat, ce qui ouvre l'accès aux dossiers d'un cabinet.
 */

function exigerAdministrateur(utilisateur: UtilisateurConnecte) {
  if (!utilisateur.roles.includes("admin")) {
    throw new Interdit("Cette page est réservée aux administrateurs");
  }
}

export class ChangementRefuse extends Error {
  readonly statut = 400;
  readonly anomalie: Anomalie;
  constructor(anomalie: Anomalie) {
    super(anomalie.message);
    this.name = "ChangementRefuse";
    this.anomalie = anomalie;
  }
}

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

export async function tableauAdministration(utilisateur: UtilisateurConnecte) {
  exigerAdministrateur(utilisateur);

  const [comptes, dossiers, parStatut] = await Promise.all([
    prisma.users.findMany({
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        roles: true,
        suspended: true,
        created_at: true,
        last_login_at: true,
      },
    }),
    prisma.formalites.count(),
    prisma.formalites.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const statuts = Object.fromEntries(parStatut.map((s) => [s.status, s._count._all]));

  return {
    comptes: comptes.map((c) => ({
      id: c.id,
      nom: c.name,
      email: c.email,
      roles: lireRoles(c.roles, c.role),
      suspendu: !!c.suspended,
      creeLe: c.created_at,
      derniereConnexion: c.last_login_at,
    })),
    chiffres: {
      comptes: comptes.length,
      dossiers,
      enCours: statuts.en_cours ?? 0,
      termines: statuts.terminee ?? 0,
    },
  };
}

export async function changerLesRoles(
  utilisateur: UtilisateurConnecte,
  cibleId: number,
  demandes: unknown
) {
  exigerAdministrateur(utilisateur);

  const administrateurs = await prisma.users.count({ where: { role: "admin" } });
  const verdict = verifierChangementDeRoles(demandes, cibleId, utilisateur.id, administrateurs);
  if (!verdict.ok) throw new ChangementRefuse(verdict.anomalie);

  const { roles, principal } = verdict.changement;

  await prisma.users.update({
    where: { id: cibleId },
    data: { roles: JSON.stringify(roles), role: principal },
  });

  // Les rôles sont lus à chaque requête depuis la base : les sessions ouvertes
  // en tiennent compte immédiatement, sans qu'il faille les fermer.
  await prisma.audit_log.create({
    data: {
      // Aucun dossier : cette action porte sur un compte.
      formalite_id: null,
      actor_id: utilisateur.id,
      actor_role: "admin",
      action: "roles_modifies",
      target_field: String(cibleId),
      after_value: roles.join(", "),
    },
  });

  return { roles, principal };
}

export async function suspendre(
  utilisateur: UtilisateurConnecte,
  cibleId: number,
  suspendu: boolean
) {
  exigerAdministrateur(utilisateur);

  const verdict = verifierSuspension(cibleId, utilisateur.id, suspendu);
  if (!verdict.ok) throw new ChangementRefuse(verdict.anomalie);

  await prisma.users.update({ where: { id: cibleId }, data: { suspended: suspendu } });

  await prisma.audit_log.create({
    data: {
      formalite_id: null,
      actor_id: utilisateur.id,
      actor_role: "admin",
      action: suspendu ? "compte_suspendu" : "compte_reactive",
      target_field: String(cibleId),
    },
  });

  // Suspendre doit couper l'accès tout de suite, pas à l'expiration des sessions.
  if (suspendu) await revoquerToutesLesSessions(cibleId);

  return { suspendu };
}
