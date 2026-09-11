import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { apposerSignature } from "@/infrastructure/documents/generation";

/**
 * Deux signataires, deux images.
 *
 * Le rang partait de zéro et `sigIndex || 1` le prenait pour une absence : les deux
 * premières signatures d'un acte écrivaient le même `signature1.png` et la même
 * relation. La seconde écrasait la première, et les deux emplacements affichaient la
 * dernière image - un acte portait la signature de la mauvaise personne sous le nom de
 * l'autre.
 *
 * Le contrôle porte sur le zip produit plutôt que sur le rendu : c'est là que la
 * collision se voyait, et cela n'exige ni gabarit réel ni conversion.
 */

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** Un document Word minimal, avec deux lignes de signature et leurs noms. */
function documentDEssai(): Buffer {
  const ligne = (texte: string) => "<w:p><w:r><w:t>" + texte + "</w:t></w:r></w:p>";

  const document =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' +
    ligne("Fait le 6 septembre 2026 a Lyon.") +
    ligne("______________________") +
    ligne("Monsieur Jean DUPONT") +
    ligne("______________________") +
    ligne("Madame Claire MARTIN") +
    "</w:body></w:document>";

  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>'
  );
  zip.file(
    "word/_rels/document.xml.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
  );
  zip.file("word/document.xml", document);
  return zip.generate({ type: "nodebuffer" });
}

describe("l'apposition des signatures dans un acte", () => {
  it("donne son propre fichier image à chaque signataire", () => {
    let docx = documentDEssai();
    docx = apposerSignature(docx, PIXEL, "Jean Dupont", 0).docx;
    docx = apposerSignature(docx, PIXEL, "Claire Martin", 1).docx;

    const zip = new PizZip(docx);
    expect(zip.file("word/media/signature1.png")).not.toBeNull();
    expect(zip.file("word/media/signature2.png")).not.toBeNull();
  });

  it("relie chaque emplacement à sa propre image", () => {
    let docx = documentDEssai();
    docx = apposerSignature(docx, PIXEL, "Jean Dupont", 0).docx;
    docx = apposerSignature(docx, PIXEL, "Claire Martin", 1).docx;

    const zip = new PizZip(docx);
    const rels = zip.file("word/_rels/document.xml.rels")!.asText();
    expect(rels).toContain('Id="rIdSig1"');
    expect(rels).toContain('Id="rIdSig2"');
    expect(rels).toContain("media/signature1.png");
    expect(rels).toContain("media/signature2.png");

    /* Le document doit citer les deux relations : une seule signifierait que la même
       image occupe les deux emplacements. */
    const document = zip.file("word/document.xml")!.asText();
    expect(document).toContain('r:embed="rIdSig1"');
    expect(document).toContain('r:embed="rIdSig2"');
  });

  it("ne donne pas le même identifiant de dessin à deux images", () => {
    let docx = documentDEssai();
    docx = apposerSignature(docx, PIXEL, "Jean Dupont", 0).docx;
    docx = apposerSignature(docx, PIXEL, "Claire Martin", 1).docx;

    const document = new PizZip(docx).file("word/document.xml")!.asText();
    const identifiants = [...document.matchAll(/<wp:docPr id="(\d+)"/g)].map((m) => m[1]);

    expect(identifiants).toHaveLength(2);
    expect(new Set(identifiants).size).toBe(2);
  });

  it("dit qu'il n'a rien apposé sur un document sans emplacement de signature", () => {
    /*
     * Un acte que ces personnes ne signent pas - une attestation du cabinet - n'a pas
     * d'emplacement pour elles. Le savoir décide si leur paraphe descend au bas de ses
     * pages : sans cela, toutes les initiales tombaient sur n'importe quel document.
     */
    const zip = new PizZip();
    zip.file(
      "[Content_Types].xml",
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>'
    );
    zip.file(
      "word/_rels/document.xml.rels",
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
    );
    zip.file(
      "word/document.xml",
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
        "<w:p><w:r><w:t>Attestation de domiciliation</w:t></w:r></w:p>" +
        "</w:body></w:document>"
    );

    const resultat = apposerSignature(
      zip.generate({ type: "nodebuffer" }),
      PIXEL,
      "Jean Dupont",
      0
    );
    expect(resultat.apposee).toBe(false);
  });

  it("dit qu'il a apposé quand l'emplacement existe", () => {
    const resultat = apposerSignature(documentDEssai(), PIXEL, "Jean Dupont", 0);
    expect(resultat.apposee).toBe(true);
  });

  it("reconnaît un emplacement annoncé par le mot « Signature »", () => {
    /*
     * Tous les gabarits ne tirent pas un trait au-dessus du nom. sasu-pv-nomination.docx
     * pose le mot « Signature » et laisse l'espace vide en dessous : ne reconnaître que
     * le trait faisait ressortir ce procès-verbal vierge, alors que tous les autres
     * actes du même dossier portaient bien la signature - et rien ne le signalait.
     */
    const zip = new PizZip();
    zip.file(
      "[Content_Types].xml",
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>'
    );
    zip.file(
      "word/_rels/document.xml.rels",
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
    );

    const ligne = (texte: string) => "<w:p><w:r><w:t>" + texte + "</w:t></w:r></w:p>";
    zip.file(
      "word/document.xml",
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' +
        ligne("Fait le 10 septembre 2026 a Paris.") +
        ligne("Signature") +
        ligne("") +
        ligne("Madame Amel BELOUAFI") +
        "</w:body></w:document>"
    );

    const resultat = apposerSignature(
      zip.generate({ type: "nodebuffer" }),
      PIXEL,
      "Amel Belouafi",
      0
    );
    expect(resultat.apposee).toBe(true);

    /* La mention reste : c'est une légende, non la place de la signature. L'image se
       pose entre elle et le nom, dans l'espace laissé vide pour cela. */
    const document = new PizZip(resultat.docx).file("word/document.xml")!.asText();
    expect(document).toContain("Signature");
    expect(document).toContain('r:embed="rIdSig1"');
    expect(document.indexOf("rIdSig1")).toBeLessThan(document.indexOf("BELOUAFI"));
  });

  it("retombe sur le premier rang quand aucun n'est donné", () => {
    const docx = apposerSignature(documentDEssai(), PIXEL, "Jean Dupont").docx;
    expect(new PizZip(docx).file("word/media/signature1.png")).not.toBeNull();
  });
});
