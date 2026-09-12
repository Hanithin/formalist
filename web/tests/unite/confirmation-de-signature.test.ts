import { describe, expect, it } from "vitest";
import { confirmation } from "@/app/(public)/signer/[jeton]/ZoneDeSignature";

/**
 * Ce que l'écran annonce à qui vient de signer.
 *
 * « Tous les associés ont signé » s'affichait à l'associée unique d'une SASU, qui venait
 * de signer seule : la phrase parle d'un collectif qui n'existe pas. Et « nous attendons
 * encore les autres » ne disait pas combien, alors que le chiffre est connu et que c'est
 * la seule chose qu'on veuille savoir à ce moment-là.
 */
describe("la confirmation de signature", () => {
  it("ne parle pas des associés quand on a signé seule", () => {
    const texte = confirmation({ complet: true, seul: true, restants: 0 });
    expect(texte).toBe("Votre signature est enregistrée. Le dossier peut avancer.");
    expect(texte).not.toContain("associés");
  });

  it("dit le collectif quand il y en a un", () => {
    expect(confirmation({ complet: true, seul: false, restants: 0 })).toContain(
      "Tous les associés ont signé"
    );
  });

  it("compte ce qui reste, au singulier", () => {
    expect(confirmation({ complet: false, restants: 1 })).toBe(
      "Signature enregistrée. Il reste une signature à recueillir."
    );
  });

  it("compte ce qui reste, au pluriel", () => {
    expect(confirmation({ complet: false, restants: 3 })).toContain("Il reste 3 signatures");
  });

  it("se contente du fait quand le serveur ne dit rien de plus", () => {
    /* Une réponse d'une version antérieure, ou un champ absent : la phrase reste vraie
       plutôt que d'annoncer « il reste 0 signature ». */
    expect(confirmation({})).toBe("Signature enregistrée.");
  });
});
