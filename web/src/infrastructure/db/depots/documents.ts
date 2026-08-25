import { prisma } from "../client";
import { mesDossiers, exigerDossier } from "./dossiers";
import { paiementDuBrouillon } from "./brouillons";
import {
  A_RELIRE,
  visibleParLeClient,
  type ActeProduit,
} from "@/domain/document/publication";
import type { DossierListe } from "@/domain/formalite/liste";
import type { DocumentRange } from "@/domain/document/bibliotheque";
import { piecesAttendues } from "@/domain/formalite/documents";
import { TITRE_STATUTS_EN_VIGUEUR } from "@/domain/modification/formalites";
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

  /*
   * Les actes en relecture figurent dans la liste, sans leur fichier.
   *
   * On les écartait : la bibliothèque paraissait vide juste après le règlement, et le
   * client rappelait pour demander où étaient les actes qu'il venait de payer. Il les
   * voit maintenant, marqués « chez l'avocat » - mais `visibleParLeClient` continue de
   * décider qui reçoit un chemin de fichier, et un acte non relu n'en a pas.
   */
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
      enRelecture: !visibleParLeClient(d),
      // Ce que le cabinet a écrit, par opposition à ce que le client a déposé.
      parLeCabinet: d.uploaded_by === "system",
      origine: "entreprise" as const,
      societe: dossiersParId.get(d.formalite_id)?.societe ?? null,
      societeId: d.formalite_id,
      forme: dossiersParId.get(d.formalite_id)?.forme ?? null,
      type: d.type,
      remplacable: piecesAttendues(dossiersParId.get(d.formalite_id)?.forme).some(
        (p) => p.identifiant === d.type
      ),
      // Pas de chemin tant que l'avocat ne l'a pas rendu : rien avec quoi l'ouvrir.
      fichier: visibleParLeClient(d) ? d.file_path : null,
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
        // Un dépôt du client n'attend personne : il est à lui, tout de suite.
        enRelecture: false,
        parLeCabinet: false,
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
  const brouillons = await brouillonsParmi(dossiers);

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
    brouillon: brouillons.has(d.id),
  }));
}

/**
 * Lesquels de ces dossiers ne sont encore que des brouillons ?
 *
 * Un brouillon n'a jamais quitté les mains de son propriétaire : rien de réglé, rien
 * de transmis, aucune signature demandée. La carte le dit, et c'est le seul dossier
 * que le client peut retirer lui-même.
 *
 * Les deux requêtes ne portent que sur les dossiers restés candidats après les
 * conditions lisibles sur la ligne : sur un compte qui n'a que des dossiers en cours
 * de traitement, elles ne sont pas envoyées.
 */
async function brouillonsParmi(
  dossiers: { id: number; status: string; assigned_avocat_id: number | null; finalized_at: Date | null; data_json: string | null }[]
): Promise<Set<number>> {
  const candidats = dossiers.filter(
    (d) =>
      d.status === "en_cours" &&
      d.assigned_avocat_id === null &&
      d.finalized_at === null &&
      !paiementDuBrouillon(d.data_json)
  );
  if (candidats.length === 0) return new Set();

  const identifiants = candidats.map((d) => d.id);
  const [reglements, signatures] = await Promise.all([
    prisma.payments.findMany({
      where: { formalite_id: { in: identifiants }, status: "paid" },
      select: { formalite_id: true },
    }),
    prisma.signature_requests.findMany({
      where: { formalite_id: { in: identifiants } },
      select: { formalite_id: true },
    }),
  ]);

  const engages = new Set<number>();
  for (const r of reglements) if (r.formalite_id !== null) engages.add(r.formalite_id);
  for (const s of signatures) engages.add(s.formalite_id);

  return new Set(identifiants.filter((id) => !engages.has(id)));
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
/**
 * Les documents d'un dossier.
 *
 * `pourLeCabinet` rend tout, projets d'actes compris : c'est ce que l'avocat relit.
 * Sans lui, on ne rend que ce que le client peut voir - un acte produit reste un
 * projet jusqu'à la relecture.
 */
export async function documentsDuDossier(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  options: { pourLeCabinet?: boolean } = {}
) {
  await exigerDossier(utilisateur, dossierId); // lève si l'accès est refusé
  const lignes = await prisma.documents.findMany({
    where: { formalite_id: dossierId },
    orderBy: { created_at: "desc" },
  });

  return options.pourLeCabinet ? lignes : lignes.filter(visibleParLeClient);
}

/**
 * Les actes qu'un dossier a déjà produits, pour l'étape qui les produit.
 *
 * documentsDuDossier écarte les projets en relecture, et c'est bien ce qu'il doit
 * faire : un acte non relu n'est pas un document, et la bibliothèque du client ne
 * doit pas le lui remettre. Mais l'étape qui vient de le produire a besoin de dire
 * qu'il existe, sans quoi elle affiche un écran vide juste après le clic - et propose
 * de reproduire ce qui est déjà là.
 *
 * Le titre et l'état sortent, jamais le chemin du fichier : il n'y a donc rien ici
 * avec quoi ouvrir un acte avant sa relecture. La règle tient par ce que la fonction
 * ne rend pas, non par la discipline des écrans qui l'appellent.
 */
export async function actesDuDossier(
  utilisateur: UtilisateurConnecte,
  dossierId: number
): Promise<ActeProduit[]> {
  await exigerDossier(utilisateur, dossierId);

  const lignes = await prisma.documents.findMany({
    where: {
      formalite_id: dossierId,
      uploaded_by: "system",
      /*
       * Les statuts en vigueur ne sont pas un acte produit.
       *
       * Ils sont joints au dossier - l'éditeur de retouches les relit page par page -
       * mais ils viennent du registre ou du client. Ils s'affichaient parmi « vos
       * actes », marqués « Relu, à votre disposition », comme si le cabinet les avait
       * rédigés.
       */
      name: { not: TITRE_STATUTS_EN_VIGUEUR },
    },
    orderBy: { created_at: "asc" },
    select: { id: true, name: true, status: true },
  });

  return lignes.map((l) => ({
    id: l.id,
    titre: l.name,
    enRelecture: l.status === A_RELIRE,
  }));
}
