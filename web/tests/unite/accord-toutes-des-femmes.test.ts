import { describe, it, expect } from "vitest";
import { toutesDesFemmes } from "@/domain/formalite/etat-civil";

/**
 * Faut-il accorder l'acte au féminin ?
 *
 * La question se posait dans les cinq parcours, et chacun y répondait à sa façon - ou
 * n'y répondait pas. Une seule réponse, donc, pour que la corriger la corrige partout.
 */
describe("toutes des femmes", () => {
  it("accorde quand toutes les signataires sont des femmes", () => {
    expect(toutesDesFemmes([{ civilite: "Madame" }])).toBe(true);
    expect(toutesDesFemmes([{ civilite: "Madame" }, { civilite: "Mme" }])).toBe(true);
    expect(toutesDesFemmes([{ civilite: "  madame  " }])).toBe(true);
  });

  /* Le masculin l'emporte : un seul homme suffit à garder la forme du texte de loi. */
  it("n'accorde pas dès qu'un homme signe", () => {
    expect(toutesDesFemmes([{ civilite: "Madame" }, { civilite: "Monsieur" }])).toBe(false);
  });

  /*
   * Une civilité manquante compte comme un homme : mieux vaut un acte au masculin qu'un
   * acte accordé à tort au nom de quelqu'un.
   */
  it("n'accorde pas sur une civilité qu'on n'a pas", () => {
    expect(toutesDesFemmes([{ civilite: "Madame" }, {}])).toBe(false);
    expect(toutesDesFemmes([{ civilite: null }])).toBe(false);
    expect(toutesDesFemmes([{ civilite: "Docteur" }])).toBe(false);
  });

  /*
   * Une société n'a pas de genre grammatical. L'écarter permet à une associée unique de
   * signer face à une holding sans que l'acte repasse au masculin - et empêche un acte
   * entre deux sociétés de s'accorder sur rien.
   */
  it("écarte les personnes morales sans repasser au masculin", () => {
    expect(
      toutesDesFemmes([{ civilite: "Madame" }, { denomination: "HOLDING KERN" }])
    ).toBe(true);
    expect(toutesDesFemmes([{ denomination: "HOLDING KERN" }])).toBe(false);
    expect(toutesDesFemmes([])).toBe(false);
  });

  /*
   * Un champ vide n'est pas une dénomination. La distinction compte : les gabarits
   * remplacent une valeur absente par un tiret, que cette fonction ne saurait pas
   * distinguer d'un vrai nom de société - chaque personne physique de la liste rendue
   * passerait pour une société, et plus rien ne s'accorderait. Les appelants lui
   * passent donc les associés du contexte, jamais la liste rendue.
   */
  it("ne prend pas un champ vide pour une dénomination", () => {
    expect(toutesDesFemmes([{ civilite: "Madame", denomination: "" }])).toBe(true);
    expect(toutesDesFemmes([{ civilite: "Madame", denomination: "   " }])).toBe(true);
    expect(toutesDesFemmes([{ civilite: "Madame", denomination: "-" }])).toBe(false);
  });
});
