import { prisma } from "../client";
import { mesDossiers, exigerDossier } from "./dossiers";
import type { DossierListe } from "@/domain/formalite/liste";
import type { DocumentRange } from "@/domain/document/bibliotheque";
import { piecesAttendues } from "@/domain/formalite/documents";
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
export async function listerDocuments(utilisateur: UtilisateurConnecte) {
  const dossiers = await mesDossiers(utilisateur);
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

  /*
   * Un document du coffre peut être rattaché à un dossier : c'est le cas de ce que le
   * client dépose lui-même en désignant sa société. Le rattachement se lit dans
   * source_id, et n'est retenu que si le dossier lui est accessible - sinon un
   * identifiant recopié à la main ferait apparaître un nom de société qui n'est pas
   * le sien.
   */
  const rattachement = (ligne: { source_type: string; source_id: number | null }) => {
    if (ligne.source_type !== "upload" || ligne.source_id === null) return null;
    return dossiersParId.get(ligne.source_id) ?? null;
  };

  const tout: DocumentRange[] = [
    ...documents.map((d) => ({
      id: "dossier-" + d.id,
      nom: d.name,
      statut: d.status,
      motifRejet: d.rejection_reason,
      origine: "entreprise" as const,
      societe: dossiersParId.get(d.formalite_id)?.societe ?? null,
      societeId: d.formalite_id,
      forme: dossiersParId.get(d.formalite_id)?.forme ?? null,
      type: d.type,
      remplacable: piecesAttendues(dossiersParId.get(d.formalite_id)?.forme).some(
        (p) => p.identifiant === d.type
      ),
      fichier: d.file_path,
      creeLe: d.created_at,
      contratId: null,
    })),
    ...coffre.map((d) => {
      const dossier = rattachement(d);
      const contrat = d.source_type === "contrat";

      return {
        id: "coffre-" + d.id,
        nom: d.name,
        statut: d.status,
        motifRejet: null,
        origine: (contrat ? "contrat" : "upload") as "contrat" | "upload",
        societe: dossier?.societe ?? null,
        societeId: dossier?.id ?? null,
        forme: dossier?.forme ?? null,
        // Un dépôt libre ne répond à aucune pièce attendue : il ne se remplace pas.
        type: null,
        remplacable: false,
        fichier: d.file_path,
        creeLe: d.created_at,
        // Le fichier d'un contrat mène à son suivi : l'un est le résultat, l'autre
        // le chantier, et on passe de l'un à l'autre.
        contratId: contrat ? d.source_id : null,
      };
    }),
  ];

  return tout;
}

/**
 * Les contrats visibles : les siens, et ceux dont on a la charge.
 *
 * Un administrateur ne voit pas ceux de toute la plateforme : cette page est la sienne,
 * comme la bibliothèque de documents. La vue globale appartient à l'administration, où
 * elle est annoncée.
 */
export async function listerContrats(utilisateur: UtilisateurConnecte, filtre = "tous") {
  const contrats = await prisma.contrats.findMany({
    where: { OR: [{ user_id: utilisateur.id }, { assigned_avocat_id: utilisateur.id }] },
    orderBy: { updated_at: "desc" },
  });

  return filtre === "tous" ? contrats : contrats.filter((c) => c.status === filtre);
}

export async function listerFormalites(utilisateur: UtilisateurConnecte, filtre = "tous") {
  const dossiers = await mesDossiers(utilisateur);
  if (filtre === "tous") return dossiers;
  if (filtre === "terminee") return dossiers.filter((d) => d.status === "terminee");
  return dossiers.filter((d) => d.status !== "terminee");
}

/**
 * Les formalités telles que la liste les affiche.
 *
 * Elle les charge toutes, sans filtrer : ses quatre filtres annoncent chacun leur
 * décompte, et une liste déjà réduite ne permettrait pas de les calculer. La page
 * d'origine faisait de même, tout tenant côté navigateur.
 *
 * Deux champs ne sont pas dans la table. La banque vient du brouillon - elle nomme
 * l'étape en cours, « À déposer chez X » plutôt que « En attente du dépôt du
 * capital » - et les messages non lus se comptent, pour la pastille rouge de la
 * carte.
 */
export async function formalitesPourListe(
  utilisateur: UtilisateurConnecte
): Promise<DossierListe[]> {
  const dossiers = await mesDossiers(utilisateur);
  if (dossiers.length === 0) return [];

  const nonLus = await prisma.messages.groupBy({
    by: ["formalite_id"],
    where: {
      formalite_id: { in: dossiers.map((d) => d.id) },
      sender_id: { not: utilisateur.id },
      read: false,
    },
    _count: { _all: true },
  });
  const nonLusPar = new Map(nonLus.map((m) => [m.formalite_id, m._count._all]));

  return dossiers.map((d) => ({
    id: d.id,
    type: d.type,
    societe: d.societe,
    forme: d.forme,
    status: d.status,
    sousPhase: d.business_sub_phase,
    phase: d.phase,
    offre: d.offer,
    banque: banqueDuBrouillon(d.data_json),
    modifieLe: d.updated_at,
    nonLus: nonLusPar.get(d.id) ?? 0,
  }));
}

/** La banque choisie dans le brouillon, s'il en porte une de lisible. */
function banqueDuBrouillon(dataJson: string | null): string | null {
  if (!dataJson) return null;
  try {
    const brouillon: unknown = JSON.parse(dataJson);
    if (!brouillon || typeof brouillon !== "object") return null;
    const banque = (brouillon as { banque?: unknown }).banque;
    return typeof banque === "string" && banque.trim() ? banque : null;
  } catch {
    // Un brouillon illisible ne doit pas retirer le dossier de la liste.
    return null;
  }
}

/** Les documents d'un dossier précis, après contrôle d'accès au dossier. */
export async function documentsDuDossier(utilisateur: UtilisateurConnecte, dossierId: number) {
  await exigerDossier(utilisateur, dossierId); // lève si l'accès est refusé
  return prisma.documents.findMany({
    where: { formalite_id: dossierId },
    orderBy: { created_at: "desc" },
  });
}
