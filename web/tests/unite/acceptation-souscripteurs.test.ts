import { describe, expect, it } from "vitest";
import { acceptationsDesSouscripteurs } from "@/domain/modification/gabarit";

/**
 * L'acceptation du souscripteur, jointe à la lettre de renonciation.
 *
 * Une renonciation faite au profit de personnes dénommées n'est complète que si elle
 * porte leur acceptation - article R. 225-122 du code de commerce. Le champ demande une
 * ligne par souscripteur : il faut donc un bloc par ligne, faute de quoi un seul paraphe
 * vaudrait pour tout le monde.
 */
describe("acceptationsDesSouscripteurs", () => {
  it("fait un bloc par souscripteur", () => {
    const blocs = acceptationsDesSouscripteurs(
      "Monsieur Marc BERTIN, 1 500 actions\nMadame Sofia NAKACHE, 1 000 actions",
      "Jean DUPONT"
    );
    expect(blocs).toHaveLength(2);
  });

  it("accorde la formule sur la civilité du souscripteur", () => {
    const [homme] = acceptationsDesSouscripteurs("Monsieur Marc BERTIN, 1 500 actions", "Jean DUPONT");
    const [femme] = acceptationsDesSouscripteurs("Madame Sofia NAKACHE, 1 000 actions", "Jean DUPONT");
    expect(homme.PHRASE).toMatch(/^Je soussigné Marc BERTIN,/);
    expect(femme.PHRASE).toMatch(/^Je soussignée Sofia NAKACHE,/);
  });

  /* Une société n'a pas de main : elle accepte par qui la représente. */
  it("laisse une personne morale à la troisième personne", () => {
    const [bloc] = acceptationsDesSouscripteurs("La société HOLDING VAUBAN, 500 actions", "Jean DUPONT");
    expect(bloc.PHRASE).toBe(
      "La société HOLDING VAUBAN, 500 actions, accepte la renonciation qui précède, faite à son profit par Jean DUPONT."
    );
  });

  /* « Je soussigné Marc BERTIN, accepte » : une virgule entre le sujet et son verbe. */
  it("ne pose la virgule que si le nom porte une apposition", () => {
    const [seul] = acceptationsDesSouscripteurs("Monsieur Marc BERTIN", "Jean DUPONT");
    expect(seul.PHRASE).toBe(
      "Je soussigné Marc BERTIN accepte la renonciation qui précède, faite à mon profit par Jean DUPONT."
    );
  });

  /* Le bloc dit de quelle renonciation il s'agit, même s'il change de page. */
  it("nomme le renonçant", () => {
    const [bloc] = acceptationsDesSouscripteurs("Monsieur Marc BERTIN, 1 500 actions", "Claire MARTIN");
    expect(bloc.PHRASE).toContain("faite à mon profit par Claire MARTIN.");
  });

  it("ignore les lignes vides et les puces", () => {
    const blocs = acceptationsDesSouscripteurs(
      "- Monsieur Marc BERTIN, 1 500 actions.\n\n   \n- Madame Sofia NAKACHE, 1 000 actions.",
      "Jean DUPONT"
    );
    expect(blocs).toHaveLength(2);
    expect(blocs[0].PHRASE).toMatch(/^Je soussigné Marc BERTIN, 1 500 actions, accepte/);
  });

  it("ne rend rien quand personne n'est nommé", () => {
    expect(acceptationsDesSouscripteurs("", "Jean DUPONT")).toEqual([]);
  });
});
