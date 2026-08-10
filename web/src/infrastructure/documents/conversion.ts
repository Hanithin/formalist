import { createRequire } from "node:module";
import { journal } from "@/lib/journal";

/**
 * Conversion Word vers PDF.
 *
 * lib/pdf.js est repris tel quel : il enchaîne les conversions une à une, parce
 * que plusieurs LibreOffice lancés en parallèle se gênent et finissent par
 * échouer. Il garde aussi un cache, la conversion coûtant plusieurs secondes.
 *
 * LibreOffice est une dépendance système, pas un paquet : elle peut manquer sur
 * une machine de développement. L'échec doit donc être clair et sans conséquence
 * sur le reste - un document Word reste consultable même sans son PDF.
 */
const requerir = createRequire(import.meta.url);

interface ModulePdf {
  enqueueConversion: (docx: Buffer) => Promise<Buffer>;
  getPdfCacheKey: (gabarit: string, donnees: unknown) => string;
  getCachedPdf: (cle: string) => Buffer | null;
  setCachedPdf: (cle: string, pdf: Buffer) => void;
  TMP: string;
}

let module_: ModulePdf | null = null;

function charger(): ModulePdf {
  if (module_) return module_;
  module_ = requerir("./pdf.cjs") as ModulePdf;
  return module_;
}

export class ConversionImpossible extends Error {
  readonly statut = 503;
  constructor(cause?: unknown) {
    super("La conversion en PDF est momentanément indisponible");
    this.name = "ConversionImpossible";
    journal.error({ err: cause }, "Conversion PDF interrompue");
  }
}

/**
 * Convertit un document Word en PDF, en passant par le cache.
 *
 * @param gabarit et @param donnees ne servent qu'à la clé de cache : deux
 * conversions du même document ne relancent pas LibreOffice.
 */
export async function convertirEnPdf(
  docx: Buffer,
  gabarit?: string,
  donnees?: unknown
): Promise<Buffer> {
  const pdf = charger();

  const cle = gabarit ? pdf.getPdfCacheKey(gabarit, donnees ?? {}) : null;
  if (cle) {
    const enCache = pdf.getCachedPdf(cle);
    if (enCache) return enCache;
  }

  try {
    const converti = await pdf.enqueueConversion(docx);
    if (cle) pdf.setCachedPdf(cle, converti);
    return converti;
  } catch (e) {
    throw new ConversionImpossible(e);
  }
}

/** LibreOffice est-il utilisable ? Sert à ne pas proposer un PDF impossible. */
export async function conversionDisponible(): Promise<boolean> {
  try {
    const { execFile } = await import("node:child_process");
    return await new Promise((resoudre) => {
      execFile("soffice", ["--version"], { timeout: 10_000 }, (erreur) => resoudre(!erreur));
    });
  } catch {
    return false;
  }
}
