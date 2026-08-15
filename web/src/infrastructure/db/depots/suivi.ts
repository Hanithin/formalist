import { prisma } from "../client";
import { type EtatDuDossier } from "@/domain/formalite/suivi";

/**
 * L'état d'un dossier, tel que le domaine le demande.
 *
 * Les pièces se reconnaissent à leur type, jamais à leur nom : la page d'origine
 * cherchait « kbis » dans le libellé du document, ce qui prenait aussi « ancien Kbis »
 * déposé par le client dans son coffre, et ratait « Extrait K-BIS ».
 */

/** Les types de pièce qui marquent une étape franchie. */
export const TYPE_ATTESTATION_CAPITAL = "depot-capital";
export const TYPE_ANNONCE_PUBLIEE = "annonce-parution";
export const TYPE_KBIS = "kbis";
export const TYPE_RBE = "rbe";

/**
 * Les pièces déposées sur un dossier, par type.
 *
 * Une pièce refusée ne compte pas : elle est présente sans être acquise, et l'étape
 * qu'elle porte reste à faire tant que le remplacement n'est pas venu.
 */
export async function typesDeposes(dossierId: number): Promise<Set<string>> {
  const documents = await prisma.documents.findMany({
    where: { formalite_id: dossierId, rejection_reason: null },
    select: { type: true },
  });

  return new Set(documents.map((d) => d.type).filter((t): t is string => !!t));
}

export async function etatDuDossier(dossier: {
  id: number;
  forme: string | null;
  status: string | null;
  business_sub_phase: string | null;
}): Promise<EtatDuDossier> {
  const types = await typesDeposes(dossier.id);

  return {
    forme: dossier.forme,
    status: dossier.status,
    sousPhase: dossier.business_sub_phase,
    aLAttestationDeCapital: types.has(TYPE_ATTESTATION_CAPITAL),
    aLAnnoncePubliee: types.has(TYPE_ANNONCE_PUBLIEE),
    aLeKbis: types.has(TYPE_KBIS),
  };
}

/**
 * La date à laquelle les actes doivent être datés.
 *
 * L'attestation de dépôt de capital est délivrée par la banque après le versement ;
 * c'est à cette date qu'on signe les statuts, et c'est donc elle que les actes
 * portent. Sans attestation, la date du jour : un acte produit avant le versement est
 * une lecture de travail, pas un acte signé.
 *
 * On prend la plus ancienne : redéposer l'attestation - parce que le premier fichier
 * était illisible - ne doit pas repousser la date de signature de vos statuts.
 */
export async function dateDeSignature(dossierId: number): Promise<Date | undefined> {
  const attestation = await prisma.documents.findFirst({
    where: {
      formalite_id: dossierId,
      type: TYPE_ATTESTATION_CAPITAL,
      rejection_reason: null,
    },
    orderBy: { created_at: "asc" },
    select: { created_at: true },
  });

  return attestation?.created_at ?? undefined;
}
