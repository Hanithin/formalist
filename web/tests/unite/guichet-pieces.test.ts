import { describe, it, expect } from "vitest";
import {
  CHEMIN_DES_PIECES,
  PIECES_DES_ACTES,
  PIECES_TELEVERSEES,
  PIECE_ATTESTATION_DOMICILE,
  pieceDuSiege,
  TAILLE_MAXIMALE,
} from "@/domain/guichet/pieces";
import { documentsAProduire } from "@/domain/formalite/documents";
import type { Forme } from "@/domain/formalite/formes";

/**
 * La traduction de nos pièces vers les codes du guichet.
 *
 * Cent soixante-sept codes chez l'INPI, huit pièces chez nous. C'est la justesse de
 * cette table qui décide qu'un dépôt passe ou se fasse refuser - et un code faux ne se
 * voit pas à la relecture d'un dossier, seulement au refus.
 */
describe("les pièces d'un dossier", () => {
  it("donnent un code à chaque acte que nous produisons", () => {
    const formes: Forme[] = ["SAS", "SASU", "SARL", "EURL", "SCI"];
    const produits = new Set<string>();

    for (const forme of formes) {
      for (const doc of documentsAProduire({ forme, aUnDirigeant: true, conjointMarie: true })) {
        produits.add(doc.type);
      }
    }

    for (const type of produits) {
      /* L'attestation de domiciliation a son propre code : elle dépend du mode. */
      if (type === "attestation-domicile") {
        expect(PIECE_ATTESTATION_DOMICILE.code).toMatch(/^PJ_\d+$/);
        continue;
      }
      expect(PIECES_DES_ACTES[type], "aucun code pour « " + type + " »").toBeDefined();
    }
  });

  /*
   * Les modèles des greffes réunissent la non-condamnation et la filiation ; le guichet
   * les sépare. Le même fichier se dépose sous les deux codes : taire l'un ferait
   * manquer une pièce au dossier.
   */
  it("déposent la déclaration sous ses deux codes", () => {
    const codes = PIECES_DES_ACTES["declaration-non-condamnation"].map((p) => p.code);
    expect(codes).toEqual(["PJ_63", "PJ_64"]);
  });

  it("suivent le mode de domiciliation pour le justificatif du siège", () => {
    expect(pieceDuSiege("Société de domiciliation").code).toBe("PJ_29");
    expect(pieceDuSiege("Domicile personnel du dirigeant").code).toBe("PJ_26");
    expect(pieceDuSiege("Bail commercial ou professionnel").code).toBe("PJ_25");
    /* Sans réponse, le justificatif de jouissance : c'est le cas le plus large. */
    expect(pieceDuSiege(undefined).code).toBe("PJ_25");
  });

  it("portent un libellé lisible à côté de chaque code", () => {
    const toutes = [
      ...Object.values(PIECES_DES_ACTES).flat(),
      ...Object.values(PIECES_TELEVERSEES),
      PIECE_ATTESTATION_DOMICILE,
    ];
    for (const piece of toutes) {
      expect(piece.code).toMatch(/^PJ_\d+$/);
      expect(piece.libelle.length).toBeGreaterThan(10);
    }
  });

  it("visent le tableau de tête du contenu", () => {
    expect(CHEMIN_DES_PIECES).toBe("piecesJointes");
  });

  it("tiennent la limite du guichet à dix mégaoctets", () => {
    expect(TAILLE_MAXIMALE).toBe(10 * 1024 * 1024);
  });
});
