import { prisma } from "../client";
import { listerDossiers, exigerDossier } from "./dossiers";
import type { UtilisateurConnecte } from "../sessions";

/**
 * Accès aux documents et aux contrats.
 *
 * Même règle que pour les dossiers : l'utilisateur est toujours le premier
 * argument, et il n'existe aucune fonction qui charge par identifiant seul.
 */

/**
 * Les documents visibles : ceux des dossiers accessibles, plus le coffre personnel.
 *
 * On part des dossiers plutôt que de filtrer les documents directement : la règle
 * de visibilité d'un document est celle de son dossier, et la dupliquer ici la
 * ferait diverger le jour où elle change.
 */
export async function listerDocuments(utilisateur: UtilisateurConnecte, filtre = "tous") {
  const dossiers = await listerDossiers(utilisateur);
  const dossiersParId = new Map(dossiers.map((d) => [d.id, d]));

  const documents = dossiers.length
    ? await prisma.documents.findMany({
        where: { formalite_id: { in: [...dossiersParId.keys()] } },
        orderBy: { created_at: "desc" },
      })
    : [];

  const coffre = await prisma.user_documents.findMany({
    where: { user_id: utilisateur.id },
    orderBy: { created_at: "desc" },
  });

  const tout = [
    ...documents.map((d) => ({
      id: "dossier-" + d.id,
      nom: d.name,
      statut: d.status,
      motifRejet: d.rejection_reason,
      origine: "entreprise" as const,
      societe: dossiersParId.get(d.formalite_id)?.societe ?? null,
      fichier: d.file_path,
      creeLe: d.created_at,
    })),
    ...coffre.map((d) => ({
      id: "coffre-" + d.id,
      nom: d.name,
      statut: d.status,
      motifRejet: null,
      origine: (d.source_type === "contrat" ? "contrat" : "upload") as "contrat" | "upload",
      societe: null,
      fichier: d.file_path,
      creeLe: d.created_at,
    })),
  ].sort((a, b) => (b.creeLe?.getTime() ?? 0) - (a.creeLe?.getTime() ?? 0));

  return filtre === "tous" ? tout : tout.filter((d) => d.origine === filtre);
}

export async function listerContrats(utilisateur: UtilisateurConnecte, filtre = "tous") {
  const contrats = await prisma.contrats.findMany({
    where: utilisateur.roles.includes("admin")
      ? {}
      : { OR: [{ user_id: utilisateur.id }, { assigned_avocat_id: utilisateur.id }] },
    orderBy: { updated_at: "desc" },
  });

  return filtre === "tous" ? contrats : contrats.filter((c) => c.status === filtre);
}

export async function listerFormalites(utilisateur: UtilisateurConnecte, filtre = "tous") {
  const dossiers = await listerDossiers(utilisateur);
  if (filtre === "tous") return dossiers;
  if (filtre === "terminee") return dossiers.filter((d) => d.status === "terminee");
  return dossiers.filter((d) => d.status !== "terminee");
}

/** Les documents d'un dossier précis, après contrôle d'accès au dossier. */
export async function documentsDuDossier(utilisateur: UtilisateurConnecte, dossierId: number) {
  await exigerDossier(utilisateur, dossierId); // lève si l'accès est refusé
  return prisma.documents.findMany({
    where: { formalite_id: dossierId },
    orderBy: { created_at: "desc" },
  });
}
