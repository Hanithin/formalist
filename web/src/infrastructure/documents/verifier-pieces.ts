import { prisma } from "@/infrastructure/db/client";
import { etatDesPieces, phraseDesPieces, type EtatDesPieces } from "@/domain/formalite/pieces";
import { piecesAttenduesDuDossier } from "./pieces-attendues";

/**
 * L'état des pièces d'un dossier, lu en base.
 *
 * Le même verdict sert trois usages qui divergeaient : le blocage du règlement, la
 * liste des tâches du cabinet, et ce qu'on dit au client de son dossier.
 */
export async function etatDesPiecesDuDossier(dossierId: number): Promise<EtatDesPieces> {
  const dossier = await prisma.formalites.findUnique({
    where: { id: dossierId },
    select: { type: true, data_json: true },
  });
  if (!dossier) return etatDesPieces([], []);

  const documents = await prisma.documents.findMany({
    where: { formalite_id: dossierId },
    select: { type: true, status: true, rejection_reason: true },
  });

  /*
   * La forme se lit dans les données du dossier : c'est elle qui décide des pièces
   * d'une création - un apport en nature n'appelle pas les mêmes qu'un apport en
   * numéraire.
   */
  let forme: string | null = null;
  try {
    const donnees = JSON.parse(dossier.data_json ?? "{}") as Record<string, unknown>;
    if (typeof donnees.forme === "string") forme = donnees.forme;
  } catch {
    /* Un dossier illisible n'attend rien : il sera relevé ailleurs. */
  }

  return etatDesPieces(
    piecesAttenduesDuDossier({ type: dossier.type, data_json: dossier.data_json, forme }),
    documents
  );
}

/**
 * Ce qui empêche de régler, s'il y a lieu.
 *
 * Le contrôle vivait dans l'écran de saisie, qui refusait bien le règlement tant qu'un
 * justificatif manquait. Mais un écran se contourne, et la route n'en savait rien :
 * payer sans les pièces fait partir un dossier que l'avocat ne peut pas déposer. Il
 * relance alors quelqu'un qui a quitté l'application, et la formalité attend.
 *
 * @returns le message à rendre au client, ou `null` si tout est là
 */
export async function cequiRetientLeReglement(dossierId: number): Promise<string | null> {
  const etat = await etatDesPiecesDuDossier(dossierId);
  if (etat.complet) return null;
  return phraseDesPieces(etat);
}
