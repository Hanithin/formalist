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

/**
 * Les vues d'administration.
 *
 * Le serveur d'origine les servait par dix points d'entrée distincts, chacun
 * appelé séparément par la page - dix allers-retours pour un seul écran. Elles
 * sont ici demandées ensemble, en une passe.
 */
export async function vuesAdministration(utilisateur: UtilisateurConnecte) {
  exigerAdministrateur(utilisateur);

  const [dossiers, paiements, contacts, consultations, activite, usageIA] = await Promise.all([
    prisma.formalites.findMany({
      orderBy: { updated_at: "desc" },
      take: 50,
      include: { users_formalites_user_idTousers: { select: { name: true, email: true } } },
    }),
    prisma.payments.findMany({ orderBy: { paid_at: "desc" }, take: 50 }),
    prisma.contact_messages.findMany({ orderBy: { created_at: "desc" }, take: 50 }),
    prisma.lawyer_consultations.findMany({ orderBy: { scheduled_at: "desc" }, take: 50 }),
    prisma.audit_log.findMany({
      orderBy: { created_at: "desc" },
      take: 50,
      include: { users: { select: { name: true } } },
    }),
    prisma.api_usage.aggregate({
      _sum: { total_tokens: true },
      _count: { _all: true },
    }),
  ]);

  return {
    dossiers: dossiers.map((d) => ({
      id: d.id,
      societe: d.societe || "Sans nom",
      forme: d.forme,
      status: d.status,
      client: d.users_formalites_user_idTousers?.name ?? "Inconnu",
      email: d.users_formalites_user_idTousers?.email ?? null,
      avocatId: d.assigned_avocat_id,
      majLe: d.updated_at,
    })),
    paiements: paiements.map((p) => ({
      id: p.id,
      montant: (p.amount_cents ?? 0) / 100,
      statut: p.status,
      payeLe: p.paid_at,
    })),
    contacts: contacts.map((c) => ({
      id: c.id,
      nom: [c.prenom, c.nom].filter(Boolean).join(" "),
      email: c.email,
      sujet: c.sujet,
      recuLe: c.created_at,
    })),
    consultations: consultations.map((c) => ({
      id: c.id,
      debut: c.scheduled_at,
      sujet: c.topic,
      statut: c.status,
    })),
    activite: activite.map((a) => ({
      id: a.id,
      action: a.action,
      auteur: a.users?.name ?? "Système",
      dossierId: a.formalite_id,
      quand: a.created_at,
    })),
    usageIA: {
      appels: usageIA._count._all,
      jetons: usageIA._sum.total_tokens ?? 0,
    },
  };
}

/** Assigne un avocat à un dossier, depuis l'administration. */
export async function assignerDepuisAdministration(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  avocatId: number
) {
  exigerAdministrateur(utilisateur);

  const avocat = await prisma.users.findUnique({ where: { id: avocatId } });
  if (!avocat || avocat.role !== "avocat")
    throw new ChangementRefuse({
      champ: "avocat",
      message: "Ce compte n'est pas un avocat",
    });

  await prisma.formalites.update({
    where: { id: dossierId },
    data: { assigned_avocat_id: avocatId, updated_at: new Date() },
  });

  await prisma.audit_log.create({
    data: {
      formalite_id: dossierId,
      actor_id: utilisateur.id,
      actor_role: "admin",
      action: "avocat_assigne",
      after_value: avocat.name,
    },
  });

  return { avocat: avocat.name };
}

/**
 * Marque un paiement comme remboursé.
 *
 * Ne rembourse rien par soi-même : aucun prestataire de paiement n'est branché,
 * le virement se fait à la main. Cette fonction enregistre la décision, pour que
 * la comptabilité et le client la voient. Le jour où un prestataire arrivera,
 * c'est ici que l'appel viendra se greffer.
 */
export async function marquerRembourse(utilisateur: UtilisateurConnecte, paiementId: number) {
  exigerAdministrateur(utilisateur);

  const paiement = await prisma.payments.findUnique({ where: { id: paiementId } });
  if (!paiement) throw new ChangementRefuse({ champ: "paiement", message: "Paiement introuvable" });

  // Rembourser deux fois, ou rembourser un paiement qui a échoué, n'a pas de sens.
  if (paiement.status !== "paid") {
    throw new ChangementRefuse({
      champ: "paiement",
      message: "Seul un paiement encaissé peut être remboursé",
    });
  }

  await prisma.payments.update({
    where: { id: paiementId },
    data: { status: "refunded" },
  });

  await prisma.audit_log.create({
    data: {
      formalite_id: paiement.formalite_id,
      actor_id: utilisateur.id,
      actor_role: "admin",
      action: "paiement_rembourse",
      before_value: String((paiement.amount_cents ?? 0) / 100) + " euros",
    },
  });

  return { rembourse: paiementId };
}

/** Les avocats disponibles pour une assignation. */
export async function avocats(utilisateur: UtilisateurConnecte) {
  exigerAdministrateur(utilisateur);
  return prisma.users.findMany({
    where: { role: "avocat", suspended: false },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
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
