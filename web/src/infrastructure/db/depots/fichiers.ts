import path from "node:path";
import { prisma } from "../client";
import { peutLire } from "@/domain/acces/regles";
import type { UtilisateurConnecte } from "../sessions";

/**
 * Qui a le droit de lire un fichier déposé.
 *
 * Porté depuis lib/file-access.js, écrit pour fermer la fuite de /api/file : le
 * point d'entrée servait n'importe quelle pièce d'identité sans authentification.
 *
 * Un fichier est atteignable par celui qui l'a déposé, par les personnes qui ont
 * accès au dossier auquel il est rattaché, et par l'administrateur de la
 * plateforme. Tout le reste, y compris un fichier que rien ne référence, est
 * refusé : un fichier orphelin n'appartient à personne.
 */

/** L'équipe de l'utilisateur, dans la forme attendue par les règles d'accès. */
async function appartenanceDe(utilisateurId: number) {
  const membre = await prisma.team_members.findFirst({
    where: { user_id: utilisateurId },
    include: { teams: { select: { id: true, type: true } } },
  });
  if (!membre?.teams) return null;

  return {
    equipeId: membre.teams.id,
    type: (membre.teams.type === "cabinet" ? "cabinet" : "client") as "cabinet" | "client",
    role: (membre.role ?? "user") as "user" | "avocat" | "admin",
    voitTousLesDossiers: !!membre.can_view_all,
    peutModifier: !!membre.can_edit,
    peutCreer: !!membre.can_create,
  };
}

async function dossierAccessible(utilisateur: UtilisateurConnecte, dossierId: number | null) {
  if (!dossierId) return false;
  const dossier = await prisma.formalites.findUnique({ where: { id: dossierId } });
  if (!dossier) return false;

  return peutLire(
    utilisateur,
    {
      id: dossier.id,
      proprietaireId: dossier.user_id,
      avocatAssigneId: dossier.assigned_avocat_id,
      equipeId: dossier.team_id,
    },
    await appartenanceDe(utilisateur.id)
  );
}

/**
 * @returns le nom de fichier à servir, ou null si l'accès est refusé.
 *
 * On ne distingue pas « le fichier n'existe pas » de « il ne vous appartient pas » :
 * la réponse ne doit pas permettre de deviner ce qui est stocké.
 */
export async function fichierLisible(
  utilisateur: UtilisateurConnecte,
  nomDemande: string
): Promise<string | null> {
  // Le nom vient de l'adresse : on n'en garde que le dernier segment, sans quoi
  // ../../ sortirait du dossier de dépôt.
  const nom = path.basename(nomDemande || "");
  if (!nom) return null;

  if (utilisateur.roles.includes("admin")) return nom;

  // 1. Registre de propriété, écrit au moment du dépôt
  const registre = await prisma.uploaded_files.findUnique({ where: { filename: nom } });
  if (registre) {
    if (registre.user_id === utilisateur.id) return nom;
    if (await dossierAccessible(utilisateur, registre.formalite_id)) return nom;
  }

  // 2. Document rattaché à un dossier
  const document = await prisma.documents.findFirst({
    where: { file_path: { endsWith: nom } },
    select: { formalite_id: true },
  });
  if (document && (await dossierAccessible(utilisateur, document.formalite_id))) return nom;

  // 3. Pièce jointe d'un message de dossier
  const message = await prisma.messages.findFirst({
    where: { file_path: { endsWith: nom } },
    select: { formalite_id: true },
  });
  if (message && (await dossierAccessible(utilisateur, message.formalite_id))) return nom;

  // 4. Coffre personnel
  const coffre = await prisma.user_documents.findFirst({
    where: { file_path: { endsWith: nom } },
    select: { user_id: true },
  });
  if (coffre?.user_id === utilisateur.id) return nom;

  // 5. Contrat : le client et l'avocat qui en a la charge
  const contrat = await prisma.contrats.findFirst({
    where: { file_path: { endsWith: nom } },
    select: { user_id: true, assigned_avocat_id: true },
  });
  if (contrat && (contrat.user_id === utilisateur.id || contrat.assigned_avocat_id === utilisateur.id)) {
    return nom;
  }

  // 6. Pièce jointe du support
  const support = await prisma.support_messages.findFirst({
    where: { file_path: { endsWith: nom } },
    select: { user_id: true, sender_id: true },
  });
  if (support && (support.user_id === utilisateur.id || support.sender_id === utilisateur.id)) {
    return nom;
  }

  return null;
}
