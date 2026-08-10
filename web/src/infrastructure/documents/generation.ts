import { createRequire } from "node:module";
import { journal } from "@/lib/journal";

/**
 * Génération des documents Word.
 *
 * lib/docx.js du serveur d'origine est repris tel quel, sans réécriture : 1 199
 * lignes où sont enfouis des cas particuliers accumulés au fil des mois - mise en
 * page, injection de signature, champs dérivés - invisibles à la lecture. Le
 * réécrire coûterait cher pour ne rien gagner.
 *
 * Il est en CommonJS : on le charge tel quel plutôt que de le convertir. Il vit
 * désormais dans web/, Next ne sachant pas charger un fichier hors de son projet ;
 * l'ancien lib/docx.js le réexporte, pour qu'il n'en existe qu'une version.
 */
const requerir = createRequire(import.meta.url);

interface ModuleDocx {
  generateDocx: (nomGabarit: string, donnees: Record<string, unknown>) => Buffer;
  loadTemplate: (nom: string) => Buffer;
  injectSignature: (
    docx: Buffer,
    signatureBase64: string,
    nomSignataire: string,
    index?: number
  ) => Buffer;
}

let module_: ModuleDocx | null = null;

function charger(): ModuleDocx {
  if (module_) return module_;
  module_ = requerir("./docx.cjs") as ModuleDocx;
  return module_;
}

export class GenerationImpossible extends Error {
  readonly statut = 500;
  constructor(gabarit: string, cause?: unknown) {
    super("Le document n'a pas pu être généré");
    this.name = "GenerationImpossible";
    journal.error({ err: cause, gabarit }, "Génération de document interrompue");
  }
}

/** Produit un document Word à partir d'un gabarit et des données du dossier. */
export function genererDocument(gabarit: string, donnees: Record<string, unknown>): Buffer {
  try {
    return charger().generateDocx(gabarit, donnees);
  } catch (e) {
    throw new GenerationImpossible(gabarit, e);
  }
}

/** Le gabarit existe-t-il ? Évite d'échouer au milieu d'une série. */
export function gabaritDisponible(gabarit: string): boolean {
  try {
    charger().loadTemplate(gabarit);
    return true;
  } catch {
    return false;
  }
}
