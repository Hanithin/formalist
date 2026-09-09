import { describe, it, expect } from "vitest";
import {
  CABINET,
  PIECES_DU_CABINET,
  fraicheur,
  piecesDuCabinetIncompletes,
} from "@/domain/formalite/domiciliation";

/**
 * Les pièces que le cabinet fournit quand il domicilie une société.
 *
 * Un extrait Kbis et un justificatif de domicile de plus de trois mois se font refuser
 * au guichet. Le délai court depuis la date portée par la pièce, non depuis celle du
 * téléversement : un Kbis tiré en janvier et déposé ici en juin est périmé le jour où
 * on le dépose, et rien dans le fichier ne le dit.
 */
describe("la fraîcheur d'une pièce", () => {
  const maintenant = new Date("2026-09-09T12:00:00Z");

  it("compte trois mois depuis la date de la pièce", () => {
    expect(fraicheur("2026-09-01", maintenant)).toBe("fraiche");
    expect(fraicheur("2026-06-08", maintenant)).toBe("perimee");
  });

  /* Le dernier mois alerte : de quoi en redemander un avant qu'un dossier ne bloque. */
  it("prévient un mois avant l'échéance", () => {
    expect(fraicheur("2026-07-01", maintenant)).toBe("bientot");
    expect(fraicheur("2026-07-15", maintenant)).toBe("fraiche");
  });

  it("ne devine pas une date absente ou illisible", () => {
    expect(fraicheur(null, maintenant)).toBe("sans-date");
    expect(fraicheur("", maintenant)).toBe("sans-date");
    expect(fraicheur("le 3 mars", maintenant)).toBe("sans-date");
  });
});

describe("ce qui manque au cabinet pour domicilier", () => {
  const maintenant = new Date("2026-09-09T12:00:00Z");

  it("relève les trois pièces quand rien n'est déposé", () => {
    const manques = piecesDuCabinetIncompletes([], maintenant);
    expect(manques.map((m) => m.piece.identifiant)).toEqual(
      PIECES_DU_CABINET.map((p) => p.identifiant)
    );
    expect(manques.every((m) => m.etat === "absente")).toBe(true);
  });

  it("laisse passer un jeu complet et récent", () => {
    expect(
      piecesDuCabinetIncompletes(
        [
          { identifiant: "cabinet-kbis", etabliLe: "2026-08-20" },
          { identifiant: "cabinet-identite" },
          { identifiant: "cabinet-domicile", etabliLe: "2026-08-01" },
        ],
        maintenant
      )
    ).toEqual([]);
  });

  /* Un passeport ne se périme pas au bout de trois mois : il a sa propre validité. */
  it("n'exige pas de date sur la pièce d'identité", () => {
    const manques = piecesDuCabinetIncompletes(
      [
        { identifiant: "cabinet-kbis", etabliLe: "2026-08-20" },
        { identifiant: "cabinet-identite", etabliLe: null },
        { identifiant: "cabinet-domicile", etabliLe: "2026-08-01" },
      ],
      maintenant
    );
    expect(manques).toEqual([]);
  });

  it("relève un Kbis périmé et une date manquante", () => {
    const manques = piecesDuCabinetIncompletes(
      [
        { identifiant: "cabinet-kbis", etabliLe: "2026-01-05" },
        { identifiant: "cabinet-identite" },
        { identifiant: "cabinet-domicile", etabliLe: null },
      ],
      maintenant
    );
    expect(manques.map((m) => [m.piece.identifiant, m.etat])).toEqual([
      ["cabinet-kbis", "perimee"],
      ["cabinet-domicile", "sans-date"],
    ]);
  });
});

describe("l'identité du cabinet", () => {
  /* Le président du cabinet est le mandataire : le nom ne peut pas diverger. */
  it("signe du même nom que le pouvoir", () => {
    expect(CABINET.signataire).toBe("Monsieur Hani MADFAI");
    expect(CABINET.signatureEnPied).toBe("Monsieur MADFAI Hani");
  });

  it("porte l'immatriculation du cabinet", () => {
    expect(CABINET.siren).toBe("899 979 934");
    expect(CABINET.greffe).toBe("Paris");
    expect(CABINET.adresse).toBe("34 rue Laugier, 75017 Paris");
  });
});

describe("le libellé d'un manque", () => {
  /*
   * Un manque du cabinet ne se répare pas sur le dossier.
   *
   * L'avocat lit la même liste que pour les champs manquants du dossier : elle doit lui
   * dire où aller. « à déposer dans l'administration du cabinet » l'y envoie ; « Extrait
   * Kbis manquant » l'aurait laissé chercher dans les pièces du client.
   */
  it("dit où le réparer", () => {
    const maintenant = new Date("2026-09-09T12:00:00Z");
    const manques = piecesDuCabinetIncompletes(
      [{ identifiant: "cabinet-kbis", etabliLe: "2026-01-05" }],
      maintenant
    );

    expect(manques.map((m) => m.etat)).toEqual(["perimee", "absente", "absente"]);
    expect(manques[0].piece.titre).toBe("Extrait Kbis du cabinet");
  });
});
