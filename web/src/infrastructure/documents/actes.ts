import { ouvrirBrouillon } from "@/infrastructure/db/depots/brouillons";
import { dateDeSignature, desActesEnRelecture } from "@/infrastructure/db/depots/suivi";
import { documentsAProduire } from "@/domain/formalite/documents";
import { premiereEtapeIncomplete } from "@/domain/formalite/parcours";
import { donneesDeGabarit } from "@/domain/formalite/gabarit";
import { villeDuRcs } from "@/infrastructure/documents/rcs";
import { genererDocument } from "@/infrastructure/documents/generation";
import { remplacerDocumentsProduits } from "@/infrastructure/documents/depot";
import type { Brouillon } from "@/domain/formalite/parcours";
import type { UtilisateurConnecte } from "@/infrastructure/db/sessions";

/**
 * La production des actes d'un dossier.
 *
 * Elle vivait dans sa route, ce qui suffisait tant qu'un seul geste la déclenchait.
 * Le dépôt de l'attestation de dépôt de capital la déclenche aussi - c'est lui qui
 * fixe la date portée par les statuts - et une seconde copie de ces vingt lignes
 * aurait fini par diverger de la première.
 */

export class DossierIncomplet extends Error {
  constructor(readonly etape: number) {
    super("Le dossier est incomplet");
  }
}

/**
 * Produit les actes d'un dossier ouvert par son propriétaire.
 *
 * C'est le chemin du client : le bouton de la dernière étape, et le dépôt de
 * l'attestation de capital. La session sert au contrôle d'accès, non à la production.
 *
 * Régénérer ne publie pas. Un acte en relecture le reste : sans cette précaution, un
 * client dont le dossier est chez l'avocat déverrouillait les cinq actes d'un clic sur
 * « Régénérer les documents », et pouvait les signer avant que quiconque les ait lus.
 *
 * `forcerLaRelecture` sert au cas inverse : l'acte change - il est re-daté du jour de
 * l'attestation - et doit repasser devant l'avocat même s'il était déjà remis.
 */
export async function produireLesActes(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  options: { forcerLaRelecture?: boolean } = {}
) {
  const { brouillon } = await ouvrirBrouillon(utilisateur, dossierId);
  const aRelire = options.forcerLaRelecture || (await desActesEnRelecture(dossierId));
  return produireLesActesDuBrouillon(dossierId, brouillon, { aRelire });
}

/**
 * Produit les actes depuis un brouillon déjà lu, sans session.
 *
 * L'encaissement passe par ici : le relais de Stripe appelle depuis ses serveurs, il
 * n'a pas de session chez nous, et exiger un utilisateur connecté rendrait la
 * production impossible au seul moment où elle doit être automatique.
 *
 * `aRelire` marque les actes comme projets en attente de l'avocat : c'est ce que font
 * déjà la modification, la fermeture, la cessation et le dépôt des comptes. Les actes
 * produits par le bouton, avant règlement, restent des lectures de travail - aucun
 * avocat ne les a vus, et l'annoncer « en relecture » serait faux.
 */
export async function produireLesActesDuBrouillon(
  dossierId: number,
  brouillon: Brouillon,
  options: { aRelire?: boolean } = {}
) {
  // Un dossier incomplet produirait des documents troués, qui seraient déposés
  // au greffe en l'état. Mieux vaut dire ce qui manque.
  const bloquante = premiereEtapeIncomplete(brouillon);
  if (bloquante !== null && bloquante < 5) throw new DossierIncomplet(bloquante);

  const aProduire = documentsAProduire({
    forme: brouillon.forme ?? "",
    aUnDirigeant: (brouillon.dirigeants ?? []).length > 0,
  });

  /*
   * Les actes portent la date de l'attestation de dépôt de capital.
   *
   * La banque la délivre après le versement, et c'est ce jour-là qu'on signe les
   * statuts. Les dater du jour de leur production donnerait des statuts signés avant
   * que le capital n'existe. Sans attestation, la date du jour : ce qu'on produit
   * alors est une lecture de travail, pas un acte signé.
   */
  const signeLe = await dateDeSignature(dossierId);

  // La ville du RCS vient de la table du registre, pas de la commune du siège :
  // Sainte-Foy-lès-Lyon relève du tribunal de commerce de Lyon.
  const donnees = donneesDeGabarit(brouillon, {
    villeRcs: villeDuRcs(brouillon.codePostal, brouillon.ville),
    maintenant: signeLe,
  });

  // Tout est produit avant d'écrire quoi que ce soit : un gabarit qui échoue ne doit
  // pas laisser le dossier avec la moitié d'un jeu d'actes.
  const actes = aProduire.map((document) => ({
    titre: document.titre,
    contenu: genererDocument(document.gabarit, donnees),
  }));

  return remplacerDocumentsProduits(dossierId, actes, { aRelire: options.aRelire });
}
