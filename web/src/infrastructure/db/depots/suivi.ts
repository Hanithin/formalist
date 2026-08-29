import { prisma } from "../client";
import { type EtatDuDossier } from "@/domain/formalite/suivi";
import { A_RELIRE } from "@/domain/document/publication";

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
  type?: string | null;
  forme: string | null;
  status: string | null;
  business_sub_phase: string | null;
  data_json?: string | null;
  /** L'avocat qui a pris le dossier, quand il y en a un. */
  assigned_avocat_id?: number | null;
}): Promise<EtatDuDossier> {
  const types = await typesDeposes(dossier.id);

  /*
   * Qui s'occupe du dossier, et depuis quand.
   *
   * Le suivi cochait « Dossier confié à un avocat » sur le seul règlement : le client
   * lisait qu'un avocat s'en occupait alors que le dossier attendait dans la file. Le
   * nom, quand il est connu, vaut mieux qu'une formule - c'est quelqu'un, pas un
   * service.
   */
  const avocat = dossier.assigned_avocat_id
    ? await prisma.users.findUnique({
        where: { id: dossier.assigned_avocat_id },
        select: { name: true },
      })
    : null;

  return {
    type: dossier.type ?? null,
    forme: dossier.forme,
    status: dossier.status,
    sousPhase: dossier.business_sub_phase,
    aLAttestationDeCapital: types.has(TYPE_ATTESTATION_CAPITAL),
    /*
     * Sur une modification, c'est le cabinet qui publie : il n'y a pas d'attestation
     * de parution déposée, seulement une publication déclarée. Ne lire que les
     * documents laisserait l'étape en attente indéfiniment, sur un dossier avancé.
     */
    aLAnnoncePubliee: types.has(TYPE_ANNONCE_PUBLIEE) || avisDeclares(dossier.data_json),
    aLeKbis: types.has(TYPE_KBIS),
    // Le règlement vit dans la déclaration : c'est lui qui met l'auto-entreprise en
    // route, là où une société part sur une transmission.
    paye: estPayee(dossier.data_json),
    avocatAssigne: !!dossier.assigned_avocat_id,
    nomDeLAvocat: avocat?.name ?? null,
    /*
     * Des actes attendent-ils encore l'avocat ?
     *
     * Le suivi réclamait l'attestation de dépôt de capital dès le règlement, alors que
     * la banque ouvre le compte sur présentation des statuts - ceux-là mêmes que
     * l'avocat est en train de relire.
     */
    actesEnRelecture: await desActesEnRelecture(dossier.id),
  };
}

/** Reste-t-il un acte produit que l'avocat n'a pas relu ? */
async function desActesEnRelecture(dossierId: number): Promise<boolean> {
  const compte = await prisma.documents.count({
    where: { formalite_id: dossierId, uploaded_by: "system", status: A_RELIRE },
  });
  return compte > 0;
}

/** Le cabinet a-t-il déclaré la publication ? Une lecture prudente d'un JSON libre. */
function avisDeclares(dataJson: string | null | undefined): boolean {
  if (!dataJson) return false;
  try {
    const lu: unknown = JSON.parse(dataJson);
    return !!lu && typeof lu === "object" && (lu as { avisPublies?: unknown }).avisPublies === true;
  } catch {
    return false;
  }
}

/** Le dossier porte-t-il un règlement ? Une lecture prudente d'un JSON libre. */
function estPayee(dataJson: string | null | undefined): boolean {
  if (!dataJson) return false;
  try {
    const lu: unknown = JSON.parse(dataJson);
    return !!lu && typeof lu === "object" && (lu as { paye?: unknown }).paye === true;
  } catch {
    return false;
  }
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
