import { describe, it, expect } from "vitest";
import {
  A_RELIRE,
  aRelire,
  mentionDAttente,
  visibleParLeClient,
} from "@/domain/document/publication";

/**
 * Ce que le client peut voir d'un acte, et quand.
 *
 * Un acte sorti du gabarit n'est pas un acte : c'est un projet. Il était pourtant versé
 * dans la bibliothèque du client à la seconde où il était produit - le client pouvait
 * le télécharger, l'envoyer à sa banque ou le signer avant que quiconque l'ait lu.
 */

describe("ce que le client voit", () => {
  it("un projet d'acte reste invisible", () => {
    expect(visibleParLeClient({ uploaded_by: "system", status: A_RELIRE })).toBe(false);
  });

  it("un acte relu se voit", () => {
    expect(visibleParLeClient({ uploaded_by: "system", status: "generated" })).toBe(true);
  });

  it("ce que le client a déposé lui-même se voit toujours", () => {
    /*
     * La règle ne porte que sur ce que nous produisons : retenir la pièce d'identité
     * que le client vient de déposer n'aurait aucun sens.
     */
    expect(visibleParLeClient({ uploaded_by: "user", status: "uploaded" })).toBe(true);
    expect(visibleParLeClient({ uploaded_by: "user", status: A_RELIRE })).toBe(true);
  });

  it("un acte signé ou vérifié reste visible", () => {
    expect(visibleParLeClient({ uploaded_by: "system", status: "signed" })).toBe(true);
    expect(visibleParLeClient({ uploaded_by: "system", status: "verified" })).toBe(true);
  });
});

describe("ce qui reste à relire", () => {
  it("ne compte que nos productions en attente", () => {
    const documents = [
      { uploaded_by: "system", status: A_RELIRE },
      { uploaded_by: "system", status: "generated" },
      { uploaded_by: "user", status: A_RELIRE },
    ];
    expect(aRelire(documents)).toHaveLength(1);
  });

  it("se dit au client, plutôt que de laisser un dossier vide", () => {
    // Le silence le ferait rappeler pour demander où sont ses actes.
    expect(mentionDAttente(1)).toContain("Un acte est en cours de relecture");
    expect(mentionDAttente(3)).toContain("3 actes sont en cours de relecture");
  });
});
