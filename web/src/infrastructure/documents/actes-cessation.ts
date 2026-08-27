/**
 * Les actes d'une cessation d'activité.
 *
 * La production vivait dans la route, entre la lecture du dossier et la réponse HTTP :
 * elle n'était appelable que par elle. Corriger le dossier depuis l'espace avocat, puis
 * reproduire, demandait le même enchaînement - et le recopier l'aurait fait diverger.
 *
 * Pas de renumérotation de résolutions ici : une auto-entreprise ne délibère pas. La
 * passe de typographie reste, elle, commune à tous les documents.
 */

import { verifierCessation } from "@/domain/cessation/verification";
import { donneesDeLaCessation } from "@/domain/cessation/gabarit";
import { actesDeLaCessation } from "@/domain/cessation/actes";
import type { Cessation } from "@/infrastructure/db/depots/cessation";
import { genererDocument } from "./generation";
import { typographierLeDocument } from "./typographie-docx";
import { remplacerDocumentsProduits } from "./depot";

/** Le dossier n'a pas de quoi produire : ce qui manque est nommé. */
export class CessationIncomplete extends Error {
  constructor(readonly manques: { champ: string; message: string }[]) {
    super("Le dossier est incomplet");
    this.name = "CessationIncomplete";
  }
}

export async function produireLesActesDeLaCessation(
  dossierId: number,
  cessation: Cessation,
  options: { par?: number } = {}
) {
  const manques = verifierCessation(cessation);
  if (manques.length > 0) throw new CessationIncomplete(manques);

  const donnees = donneesDeLaCessation(cessation);

  const actes = actesDeLaCessation(cessation.nature).map((acte) => ({
    titre: acte.titre,
    contenu: typographierLeDocument(genererDocument(acte.gabarit, donnees)),
  }));

  return remplacerDocumentsProduits(dossierId, actes, { aRelire: true, par: options.par });
}
