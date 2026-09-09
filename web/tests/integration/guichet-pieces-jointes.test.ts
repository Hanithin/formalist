import { describe, it, expect } from "vitest";
import { corpsDeLaPiece, PieceTropLourde } from "@/infrastructure/guichet/pieces";
import { PIECES_DES_ACTES, TAILLE_MAXIMALE } from "@/domain/guichet/pieces";

/**
 * Le corps d'une pièce jointe, tel que le guichet le reçoit.
 *
 * Aucun appel réseau : c'est la mise en forme qu'on vérifie - l'encodage, l'extension,
 * le chemin de rattachement, et le refus d'une pièce que le guichet n'accepterait pas.
 */
const STATUTS = PIECES_DES_ACTES.statuts[0];

describe("le corps d'une pièce jointe", () => {
  it("encode le document en base64, et le dit en PDF", () => {
    const pdf = Buffer.from("%PDF-1.4 essai");
    const corps = corpsDeLaPiece({ nom: "Statuts constitutifs", type: STATUTS, pdf });

    expect(corps).toMatchObject({
      nomDocument: "Statuts constitutifs.pdf",
      typeDocument: "PJ_01",
      langueDocument: "fr",
      documentExtension: "pdf",
      path: "piecesJointes",
    });
    expect(Buffer.from(corps.documentBase64 as string, "base64").toString()).toBe(
      "%PDF-1.4 essai"
    );
  });

  /*
   * Le guichet refuse un nom sans extension.
   *
   * « Le document doit être un PDF (exemple : monDocument.pdf) » - une violation sur
   * `nomDocument`, alors que l'extension part déjà dans son propre champ et que le
   * contenu est bien un PDF. Éprouvé contre la démonstration : le même envoi passe avec
   * « Essai.pdf » et échoue avec « Essai sans extension ».
   */
  it("termine le nom par « .pdf », quel qu'il soit", () => {
    const pdf = Buffer.from("%PDF-1.4 essai");

    expect(corpsDeLaPiece({ nom: "Kbis du domiciliataire", type: STATUTS, pdf })).toMatchObject({
      nomDocument: "Kbis du domiciliataire.pdf",
    });
    /* Un nom qui l'a déjà ne le reçoit pas deux fois, quelle que soit sa casse. */
    expect(corpsDeLaPiece({ nom: "scan.PDF", type: STATUTS, pdf })).toMatchObject({
      nomDocument: "scan.PDF",
    });
    /* Un nom vide vaut mieux qu'une extension seule : « .pdf » n'est pas un nom. */
    expect(corpsDeLaPiece({ nom: "   ", type: STATUTS, pdf })).toMatchObject({
      nomDocument: "Document.pdf",
    });
  });

  /*
   * Dix mégaoctets est la limite du contrat. La refuser ici plutôt qu'au dépôt évite
   * d'envoyer treize mégaoctets pour apprendre qu'ils étaient de trop - et le message
   * dit laquelle des huit pièces est en cause.
   */
  it("refuse une pièce plus lourde que ce que le guichet accepte", () => {
    const trop = Buffer.alloc(TAILLE_MAXIMALE + 1);
    expect(() => corpsDeLaPiece({ nom: "Statuts constitutifs", type: STATUTS, pdf: trop })).toThrow(
      PieceTropLourde
    );

    try {
      corpsDeLaPiece({ nom: "Statuts constitutifs", type: STATUTS, pdf: trop });
    } catch (e) {
      expect((e as Error).message).toContain("Statuts constitutifs");
      expect((e as Error).message).toContain("dix");
    }
  });

  it("accepte une pièce juste sous la limite", () => {
    const juste = Buffer.alloc(TAILLE_MAXIMALE);
    expect(() =>
      corpsDeLaPiece({ nom: "Statuts constitutifs", type: STATUTS, pdf: juste })
    ).not.toThrow();
  });
});
