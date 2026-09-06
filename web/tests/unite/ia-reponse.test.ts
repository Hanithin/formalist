import { describe, it, expect } from "vitest";
import { texteDeLaReponse } from "@/infrastructure/ia/reponse";

/**
 * La réponse du modèle se lit sur tous ses morceaux.
 *
 * Elle n'en portait qu'un, et on prenait le premier. Les modèles récents rendent leur
 * raisonnement dans un morceau à part, marqué comme tel, avant la réponse : le premier
 * venu ramènerait ce brouillon - ou rien, s'il ne porte pas de texte. C'est la rédaction
 * d'un objet social et la lecture d'un bilan qui en dépendent, et l'une comme l'autre
 * échouerait sans un mot.
 */
describe("la réponse du modèle", () => {
  it("recolle les morceaux, dans l'ordre", () => {
    expect(
      texteDeLaReponse({
        candidates: [{ content: { parts: [{ text: "La vente " }, { text: "de vêtements" }] } }],
      })
    ).toBe("La vente de vêtements");
  });

  it("écarte le raisonnement, et garde la réponse", () => {
    expect(
      texteDeLaReponse({
        candidates: [
          {
            content: {
              parts: [
                { text: "Réfléchissons : restauration…", thought: true },
                { text: "L'exploitation d'un restaurant" },
              ],
            },
          },
        ],
      })
    ).toBe("L'exploitation d'un restaurant");
  });

  /* Un morceau sans texte - une image, une signature - ne casse pas la lecture. */
  it("passe sur les morceaux sans texte", () => {
    expect(
      texteDeLaReponse({
        candidates: [{ content: { parts: [{}, { text: "Bonjour" }] } }],
      })
    ).toBe("Bonjour");
  });

  /* Une réponse vide, refusée ou d'une forme inattendue rend une chaîne vide : c'est
     l'appelant qui décide alors de la dire indisponible. */
  it("rend une chaîne vide sur une réponse qu'elle ne reconnaît pas", () => {
    expect(texteDeLaReponse(null)).toBe("");
    expect(texteDeLaReponse({})).toBe("");
    expect(texteDeLaReponse({ candidates: [] })).toBe("");
    expect(texteDeLaReponse({ candidates: [{ content: {} }] })).toBe("");
  });
});
