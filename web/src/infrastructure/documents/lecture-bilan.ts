import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { journal } from "@/lib/journal";

const executer = promisify(execFile);

/**
 * Le texte d'une liasse fiscale déposée.
 *
 * Deux chemins, dans cet ordre. La couche texte d'abord : une liasse produite par un
 * logiciel comptable en a une, et pdftotext la rend exactement, sans erreur de lecture
 * possible. La reconnaissance de caractères ensuite, pour les liasses scannées - plus
 * lente, et faillible sur des chiffres, ce qui est précisément ce qu'on cherche ici.
 *
 * C'est pourquoi rien de ce qui sort de ce module n'est jamais posé sans que l'écran
 * puisse le corriger : un chiffre mal lu dans un bilan devient un dividende faux dans
 * un acte, et il porterait l'autorité d'une valeur « extraite du document ».
 */

/** Au-delà, ce n'est plus une liasse : on ne va pas y chercher un résultat. */
const PAGES_MAXIMUM = 30;
const PPP = 200;

export class BilanIllisible extends Error {
  readonly statut = 422;
  constructor(message = "Le document n'a pas pu être lu") {
    super(message);
    this.name = "BilanIllisible";
  }
}

/** Le texte du document, et par quel chemin il a été obtenu. */
export interface TexteDuBilan {
  texte: string;
  source: "couche-texte" | "reconnaissance";
  pages: number;
}

export async function lireLeBilan(pdf: Buffer): Promise<TexteDuBilan> {
  const dossier = await mkdtemp(join(tmpdir(), "bilan-"));
  const source = join(dossier, "bilan.pdf");

  try {
    await writeFile(source, pdf);

    const pages = await compterLesPages(source);
    if (pages === 0) throw new BilanIllisible("Ce fichier n'est pas un PDF lisible");

    const couche = await coucheTexte(source, dossier);
    /*
     * Le seuil est bas volontairement.
     *
     * Une liasse scannée rend parfois quelques dizaines de caractères - des en-têtes
     * vectoriels, un filigrane - sans le moindre chiffre exploitable. En dessous, on
     * considère qu'il n'y a pas de couche texte et l'on passe à la reconnaissance.
     */
    if (couche.replace(/\s/g, "").length > 400) {
      return { texte: couche, source: "couche-texte", pages };
    }

    return { texte: await reconnaissance(source, dossier), source: "reconnaissance", pages };
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}

async function compterLesPages(source: string): Promise<number> {
  try {
    const { stdout } = await executer("pdfinfo", [source], { timeout: 15_000 });
    const trouve = /^Pages:\s+(\d+)/m.exec(stdout);
    return trouve ? Number(trouve[1]) : 0;
  } catch {
    return 0;
  }
}

async function coucheTexte(source: string, dossier: string): Promise<string> {
  const sortie = join(dossier, "bilan.txt");
  try {
    // -layout conserve les colonnes : dans une liasse, le libellé et son montant se
    // lisent sur la même ligne, et les séparer les rendrait impossibles à rapprocher.
    await executer("pdftotext", ["-layout", "-f", "1", "-l", String(PAGES_MAXIMUM), source, sortie], {
      timeout: 60_000,
    });
    return await readFile(sortie, "utf8");
  } catch (e) {
    journal.warn({ err: e }, "Couche texte du bilan illisible");
    return "";
  }
}

async function reconnaissance(source: string, dossier: string): Promise<string> {
  try {
    await executer(
      "pdftoppm",
      ["-r", String(PPP), "-f", "1", "-l", String(PAGES_MAXIMUM), "-png", source, join(dossier, "p")],
      { timeout: 240_000 }
    );
  } catch (e) {
    journal.warn({ err: e }, "Pages du bilan non converties en images");
    throw new BilanIllisible();
  }

  const images = (await readdir(dossier)).filter((f) => f.startsWith("p") && f.endsWith(".png")).sort();
  if (images.length === 0) throw new BilanIllisible();

  const morceaux: string[] = [];
  for (const image of images) {
    try {
      const { stdout } = await executer(
        "tesseract",
        [join(dossier, image), "stdout", "-l", "fra"],
        { timeout: 120_000, maxBuffer: 32 * 1024 * 1024 }
      );
      morceaux.push(stdout);
    } catch (e) {
      journal.warn({ err: e, image }, "Page du bilan non reconnue");
    }
  }

  if (morceaux.join("").trim().length === 0) throw new BilanIllisible();
  return morceaux.join("\n");
}
