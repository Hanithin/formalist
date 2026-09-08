import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { demanderLaLecture } from "@/infrastructure/documents/lecture-en-cours";

/**
 * La lecture des statuts, rendue à la requête plutôt que gardée dedans.
 *
 * La reconnaissance de caractères tournait dans la requête qui ouvre l'éditeur : sur un
 * conteneur à un demi-cœur, dix-sept pages numérisées prennent plusieurs minutes, la
 * requête est coupée en route, et l'écran conclut que les statuts manquent - alors
 * qu'ils sont au dossier. Le travail se fait maintenant à côté, et la requête répond
 * avec ce qu'elle a.
 */

async function statutsLisibles(): Promise<Buffer> {
  const document = await PDFDocument.create();
  const police = await document.embedFont(StandardFonts.TimesRoman);
  document.addPage([595, 842]).drawText("Siege social : 34 Rue Laugier, 75017 Paris", {
    x: 60,
    y: 700,
    size: 11,
    font: police,
  });
  return Buffer.from(await document.save());
}

describe("demander la lecture des statuts", () => {
  /*
   * Un document à couche texte se lit en une seconde.
   *
   * Faire revenir l'écran une seconde fois pour lui ajouterait un aller-retour à tous
   * les dossiers pour le confort des seuls documents numérisés : la requête patiente
   * donc un court instant avant de rendre la main.
   */
  it("rend la lecture tout de suite quand elle est rapide", async () => {
    const etat = await demanderLaLecture(await statutsLisibles());

    expect(etat.etat).toBe("prete");
    if (etat.etat !== "prete") return;
    expect(etat.lecture.pages).toHaveLength(1);
    expect(etat.lecture.mots.map((m) => m.texte)).toContain("Laugier,");
  });

  /*
   * Un échec ne se garde pas.
   *
   * Il vient souvent de la machine - mémoire, minuteur dépassé - et non du document :
   * « Reprendre la lecture » doit relancer un vrai travail, non resservir l'échec.
   */
  it("dit l'échec sans le garder", async () => {
    const abime = Buffer.from("%PDF-1.4 ceci n'est pas un document");

    const premier = await demanderLaLecture(abime);
    expect(premier.etat).toBe("echec");

    const second = await demanderLaLecture(abime);
    expect(second.etat).toBe("echec");
  });
});
