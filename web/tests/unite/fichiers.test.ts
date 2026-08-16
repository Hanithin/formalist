import { describe, it, expect } from "vitest";
import { verifierDepot, signatureValide, extensionDe, nomDeStockage, DepotRefuse } from "@/lib/fichiers";

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const html = new TextEncoder().encode("<html><script>alert(1)</script>");

describe("signature de fichier", () => {
  it("reconnaît un vrai PDF", () => {
    expect(signatureValide(pdf, ".pdf")).toBe(true);
  });

  it("refuse un HTML déguisé en PDF", () => {
    // C'est le cas qui compte : servi en ligne, il s'exécuterait dans le domaine.
    expect(signatureValide(html, ".pdf")).toBe(false);
  });

  it("refuse un format non listé plutôt que de supposer", () => {
    expect(signatureValide(pdf, ".svg")).toBe(false);
  });
});

describe("dépôt", () => {
  it("accepte un PDF conforme", () => {
    expect(verifierDepot("piece.pdf", pdf)).toBe(".pdf");
  });

  it("accepte une image conforme", () => {
    expect(verifierDepot("photo.PNG", png)).toBe(".png");
  });

  it("refuse un fichier vide", () => {
    expect(() => verifierDepot("vide.pdf", new Uint8Array())).toThrowError("vide");
  });

  it("refuse une extension hors liste", () => {
    expect(() => verifierDepot("script.js", pdf)).toThrowError("Format non accepté");
  });

  it("refuse un contenu qui ne correspond pas à l'extension", () => {
    expect(() => verifierDepot("piege.pdf", html)).toThrowError("ne correspond pas");
  });

  it("respecte une liste restreinte quand elle est donnée", () => {
    // L'attestation de dépôt n'accepte que le PDF
    expect(() => verifierDepot("photo.png", png, [".pdf"])).toThrowError("Format non accepté");
  });
});

describe("nom de stockage", () => {
  it("ne conserve rien du nom d'origine", () => {
    const nom = nomDeStockage(".pdf");
    expect(nom).toMatch(/^[0-9a-f]{32}\.pdf$/);
  });

  it("deux dépôts ne se heurtent pas", () => {
    expect(nomDeStockage(".pdf")).not.toBe(nomDeStockage(".pdf"));
  });

  it("l'extension est lue sans tenir compte de la casse", () => {
    expect(extensionDe("Document.PDF")).toBe(".pdf");
    expect(extensionDe("sans-extension")).toBe("");
  });
});

describe("la forme des extensions attendues", () => {
  it("« pdf » vaut « .pdf »", () => {
    /*
     * La convention est la forme pointée, mais les deux se lisent pareil dans une
     * liste de chaînes : écrire « pdf » refusait tout dépôt, avec un message qui
     * annonçait pourtant « Formats attendus : pdf ». C'est arrivé sur les statuts.
     */
    expect(verifierDepot("statuts.pdf", pdf, ["pdf"])).toBe(".pdf");
    expect(verifierDepot("statuts.pdf", pdf, [".pdf"])).toBe(".pdf");
  });

  it("la souplesse sur le point n'ouvre rien d'autre", () => {
    const texte = new Uint8Array([0x62, 0x6f, 0x6e]);
    expect(() => verifierDepot("note.txt", texte, ["pdf"])).toThrow(DepotRefuse);
  });
});
