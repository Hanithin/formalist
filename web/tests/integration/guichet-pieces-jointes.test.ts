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
      nomDocument: "Statuts constitutifs",
      typeDocument: "PJ_01",
      langueDocument: "FRA",
      documentExtension: ".pdf",
      path: "piecesJointes",
    });
    expect(Buffer.from(corps.documentBase64 as string, "base64").toString()).toBe(
      "%PDF-1.4 essai"
    );
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
