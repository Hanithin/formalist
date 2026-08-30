import { prisma } from "../client";
import { Interdit } from "../utilisateur-courant";
import { peutLire, peutModifier, type Appartenance, type Dossier } from "@/domain/acces/regles";
import type { UtilisateurConnecte } from "../sessions";

/**
 * Accès aux dossiers.
 *
 * Toutes les fonctions exigent l'utilisateur en premier argument. Il n'existe
 * volontairement aucun `trouverParId(id)` : on ne peut pas charger un dossier sans
 * dire pour qui, donc on ne peut pas oublier le contrôle. C'est la faille de
 * /api/file rendue impossible par la forme du code plutôt que par la vigilance.
 */

/** Appartenance de l'utilisateur à son équipe, avec les droits attachés. */
async function appartenanceDe(utilisateurId: number): Promise<Appartenance | null> {
  const membre = await prisma.team_members.findFirst({
    where: { user_id: utilisateurId },
    include: { teams: { select: { id: true, type: true } } },
  });
  if (!membre?.teams) return null;

  return {
    equipeId: membre.teams.id,
    type: membre.teams.type === "cabinet" ? "cabinet" : "client",
    role: (membre.role ?? "user") as Appartenance["role"],
    voitTousLesDossiers: !!membre.can_view_all,
    peutModifier: !!membre.can_edit,
    peutCreer: !!membre.can_create,
  };
}

function versDossier(
  ligne: {
    id: number;
    user_id: number;
    assigned_avocat_id: number | null;
    team_id: number | null;
    status?: string | null;
  },
  invites: number[] = []
): Dossier {
  return {
    id: ligne.id,
    proprietaireId: ligne.user_id,
    avocatAssigneId: ligne.assigned_avocat_id,
    equipeId: ligne.team_id,
    // Le statut sert à la seule règle des dossiers proposés aux avocats.
    statut: ligne.status ?? null,
    avocatsInvites: invites,
  };
}

/**
 * Les avocats invités sur un dossier.
 *
 * Lus à part plutôt que joints à la formalité : la lecture d'un dossier est le chemin
 * le plus emprunté de l'application, et la table est vide pour l'immense majorité
 * d'entre eux. On ne la consulte donc que si la question se pose - c'est-à-dire quand
 * l'utilisateur est avocat et que le dossier n'est déjà ni le sien ni celui de son
 * client.
 */
export async function avocatsInvitesDe(dossierId: number): Promise<number[]> {
  const lignes = await prisma.avocats_invites.findMany({
    where: { formalite_id: dossierId },
    select: { avocat_id: true },
  });
  return lignes.map((l) => l.avocat_id);
}

/**
 * Charge un dossier pour cet utilisateur.
 *
 * Rend null quand le dossier n'existe pas ou qu'il n'y a pas droit : l'appelant ne
 * doit pas pouvoir distinguer les deux, sans quoi l'existence d'un dossier se
 * déduit de la réponse.
 */
export async function lireDossier(utilisateur: UtilisateurConnecte, id: number) {
  const ligne = await prisma.formalites.findUnique({ where: { id } });
  if (!ligne) return null;

  const appartenance = await appartenanceDe(utilisateur.id);
  if (peutLire(utilisateur, versDossier(ligne), appartenance)) return ligne;

  /* Reste l'invitation, la seule voie qui demande une lecture de plus. */
  if (!utilisateur.roles.includes("avocat")) return null;
  const invites = await avocatsInvitesDe(id);
  if (!peutLire(utilisateur, versDossier(ligne, invites), appartenance)) return null;
  return ligne;
}

/** Comme lireDossier, mais lève Interdit plutôt que de rendre null. */
export async function exigerDossier(utilisateur: UtilisateurConnecte, id: number) {
  const dossier = await lireDossier(utilisateur, id);
  if (!dossier) throw new Interdit("Ce dossier n'existe pas ou ne vous est pas accessible");
  return dossier;
}

/** Charge un dossier en vue de le modifier. Lire ne suffit pas. */
export async function exigerDossierModifiable(utilisateur: UtilisateurConnecte, id: number) {
  const ligne = await prisma.formalites.findUnique({ where: { id } });
  if (!ligne) throw new Interdit("Ce dossier n'existe pas ou ne vous est pas accessible");

  const appartenance = await appartenanceDe(utilisateur.id);
  if (peutModifier(utilisateur, versDossier(ligne), appartenance)) return ligne;

  const invites = utilisateur.roles.includes("avocat") ? await avocatsInvitesDe(id) : [];
  if (!peutModifier(utilisateur, versDossier(ligne, invites), appartenance)) {
    throw new Interdit("Vous n'avez pas le droit de modifier ce dossier");
  }
  return ligne;
}

/** Les dossiers visibles par cet utilisateur. */
/**
 * Les dossiers qui sont les siens, quel que soit son rôle.
 *
 * listerDossiers rend tout à un administrateur, ce qui est juste pour l'administration
 * et faux partout ailleurs : dans une bibliothèque personnelle, cela mélange ses
 * propres documents et ceux de tous les clients, et le choix d'une société devient une
 * liste de trente dossiers dont on n'a jamais entendu parler.
 *
 * Un administrateur qui veut voir le dossier d'un client passe par l'administration ou
 * l'espace avocat, où c'est annoncé.
 */
export async function mesDossiers(utilisateur: UtilisateurConnecte) {
  const appartenance = await appartenanceDe(utilisateur.id);
  const conditions: object[] = [
    { user_id: utilisateur.id },
    { assigned_avocat_id: utilisateur.id },
  ];

  if (
    appartenance &&
    peutLire(
      utilisateur,
      { id: 0, proprietaireId: -1, avocatAssigneId: null, equipeId: appartenance.equipeId },
      appartenance
    )
  ) {
    conditions.push({ team_id: appartenance.equipeId });
  }

  return prisma.formalites.findMany({
    where: { OR: conditions },
    orderBy: { updated_at: "desc" },
  });
}

export async function listerDossiers(utilisateur: UtilisateurConnecte) {
  if (utilisateur.roles.includes("admin")) {
    return prisma.formalites.findMany({ orderBy: { updated_at: "desc" } });
  }

  const appartenance = await appartenanceDe(utilisateur.id);
  const conditions: object[] = [
    { user_id: utilisateur.id },
    { assigned_avocat_id: utilisateur.id },
  ];

  // L'équipe n'élargit la vue que si le droit est accordé
  if (
    appartenance &&
    peutLire(
      utilisateur,
      { id: 0, proprietaireId: -1, avocatAssigneId: null, equipeId: appartenance.equipeId },
      appartenance
    )
  ) {
    conditions.push({ team_id: appartenance.equipeId });
  }

  return prisma.formalites.findMany({
    where: { OR: conditions },
    orderBy: { updated_at: "desc" },
  });
}
