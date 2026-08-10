import { describe, it, expect } from "vitest";
import {
  convertirEnPdf,
  conversionDisponible,
  ConversionImpossible,
} from "@/infrastructure/documents/conversion";
import { genererDocument } from "@/infrastructure/documents/generation";

/**
 * La conversion dépend de LibreOffice, une dépendance système : elle peut manquer
 * sur une machine de développement. Les tests qui en ont besoin sont ignorés dans
 * ce cas - mais celui qui vérifie le comportement en son absence, non.
 */
const disponible = await conversionDisponible();
const avecLibreOffice = disponible ? describe : describe.skip;

avecLibreOffice("conversion en PDF", () => {
  it("produit un PDF valide depuis un document Word", async () => {
    const docx = genererDocument("sasu-statuts.docx", { SOCIETE_NOM: "ESSAI CONVERSION" });
    const pdf = await convertirEnPdf(docx);

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(1000);
  }, 60_000);

  it("la deuxième conversion du même document passe par le cache", async () => {
    const donnees = { SOCIETE_NOM: "ESSAI CACHE" };
    const docx = genererDocument("sasu-statuts.docx", donnees);

    const premier = Date.now();
    await convertirEnPdf(docx, "sasu-statuts.docx", donnees);
    const dureePremiere = Date.now() - premier;

    const second = Date.now();
    await convertirEnPdf(docx, "sasu-statuts.docx", donnees);
    const dureeSeconde = Date.now() - second;

    expect(dureeSeconde).toBeLessThan(dureePremiere);
  }, 90_000);
});

describe("absence de LibreOffice", () => {
  it("échoue proprement, sans exposer la commande ni sa trace", async () => {
    if (disponible) return; // rien à vérifier ici quand la conversion marche

    const docx = genererDocument("sasu-statuts.docx", { SOCIETE_NOM: "ESSAI" });
    await expect(convertirEnPdf(docx)).rejects.toBeInstanceOf(ConversionImpossible);
    await expect(convertirEnPdf(docx)).rejects.toThrowError(
      "La conversion en PDF est momentanément indisponible"
    );
  }, 60_000);
});
