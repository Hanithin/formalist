/**
 * Les actes d'une fermeture, selon la voie et la phase.
 *
 * La production vivait dans la route, entre la lecture du dossier et la réponse HTTP :
 * elle n'était appelable que par elle. Corriger le dossier depuis l'espace avocat, puis
 * reproduire, demandait le même enchaînement - et le recopier l'aurait fait diverger.
 *
 * La phase compte autant que la voie. Produire les comptes définitifs en même temps que
 * la dissolution donnerait au client un quitus signé avant la première opération de
 * liquidation, c'est-à-dire un acte antidaté - et une pièce que le greffe rapproche des
 * dates de l'annonce légale.
 */

import { manquesDeLaPhase, unipersonnelleDans } from "@/domain/fermeture/verification";
import { donneesDeLaFermeture } from "@/domain/fermeture/gabarit";
import { actesDeLaFermeture } from "@/domain/fermeture/actes";
import { delaiDOpposition } from "@/domain/fermeture/delais";
import type { Fermeture } from "@/infrastructure/db/depots/fermeture";
import { genererDocument } from "./generation";
import { renumeroterLesResolutions } from "./resolutions";
import { typographierLeDocument } from "./typographie-docx";
import { remplacerDocumentsProduits } from "./depot";
import { villeDuRcs } from "./rcs";

/** Le dossier n'a pas de quoi produire : ce qui manque est nommé. */
export class FermetureIncomplete extends Error {
  constructor(readonly manques: { champ: string; message: string }[]) {
    super("Le dossier est incomplet");
    this.name = "FermetureIncomplete";
  }
}

/** Une société en cessation des paiements ne se ferme pas à l'amiable. */
export class VoieImpossible extends Error {
  constructor() {
    super(
      "Cette société ne peut pas être fermée à l'amiable : la cessation des paiements se déclare au tribunal"
    );
    this.name = "VoieImpossible";
  }
}

export async function produireLesActesDeLaFermeture(
  dossierId: number,
  fermeture: Fermeture,
  options: { par?: number } = {}
) {
  if (fermeture.voie === null || fermeture.voie === "liquidation-judiciaire") {
    throw new VoieImpossible();
  }

  const societe = {
    ...fermeture.societe,
    villeRcs:
      fermeture.societe.villeRcs ||
      villeDuRcs(fermeture.societe.codePostal, fermeture.societe.ville),
  };

  const manques = manquesDeLaPhase({
    voie: fermeture.voie,
    phase: fermeture.phase,
    societe,
    valeurs: fermeture.valeurs,
    nombreDAssocies: fermeture.associes.length,
  });
  if (manques.length > 0) throw new FermetureIncomplete(manques);

  const opposition = delaiDOpposition(String(fermeture.valeurs.publicationBodacc ?? ""));

  const aProduire = actesDeLaFermeture({
    voie: fermeture.voie,
    phase: fermeture.phase,
    unipersonnelle: unipersonnelleDans({ societe, nombreDAssocies: fermeture.associes.length }),
    oppositionEcoulee: Boolean(opposition?.ecoule),
  });

  const donnees = donneesDeLaFermeture({
    voie: fermeture.voie,
    societe,
    associes: fermeture.associes,
    valeurs: fermeture.valeurs,
  });

  const actes = aProduire.map((acte) => ({
    titre: acte.titre,
    contenu: typographierLeDocument(
      renumeroterLesResolutions(genererDocument(acte.gabarit, donnees))
    ),
  }));

  return remplacerDocumentsProduits(dossierId, actes, { aRelire: true, par: options.par });
}
