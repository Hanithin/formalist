import { describe, it, expect } from "vitest";
import { analyserDateFrancaise, trierParDate, type Article } from "@/domain/contenu/articles";

describe("dates d'articles", () => {
  it("lit les dates écrites en français des pages existantes", () => {
    expect(analyserDateFrancaise("18 janvier 2026")?.toISOString()).toBe("2026-01-18T00:00:00.000Z");
    expect(analyserDateFrancaise("12 mars 2026")?.toISOString()).toBe("2026-03-12T00:00:00.000Z");
  });

  it("accepte les mois accentués", () => {
    expect(analyserDateFrancaise("3 février 2026")?.getUTCMonth()).toBe(1);
    expect(analyserDateFrancaise("9 août 2026")?.getUTCMonth()).toBe(7);
    expect(analyserDateFrancaise("1 décembre 2026")?.getUTCMonth()).toBe(11);
  });

  it("accepte aussi une date déjà normalisée", () => {
    expect(analyserDateFrancaise("2026-01-18")?.toISOString()).toBe("2026-01-18T00:00:00.000Z");
  });

  it("rend null plutôt qu'une date fausse", () => {
    expect(analyserDateFrancaise("bientôt")).toBeNull();
    expect(analyserDateFrancaise("18 brumaire 2026")).toBeNull();
    expect(analyserDateFrancaise(null)).toBeNull();
    expect(analyserDateFrancaise("")).toBeNull();
  });
});

describe("ordre d'affichage", () => {
  const article = (identifiant: string, iso: string): Article => ({
    identifiant,
    titre: identifiant,
    resume: "",
    publieLe: new Date(iso),
  });

  it("du plus récent au plus ancien", () => {
    const tries = trierParDate([
      article("ancien", "2026-01-10T00:00:00Z"),
      article("recent", "2026-03-12T00:00:00Z"),
      article("moyen", "2026-01-25T00:00:00Z"),
    ]);
    expect(tries.map((a) => a.identifiant)).toEqual(["recent", "moyen", "ancien"]);
  });

  it("ne modifie pas la liste reçue", () => {
    const liste = [article("a", "2026-01-01T00:00:00Z"), article("b", "2026-02-01T00:00:00Z")];
    trierParDate(liste);
    expect(liste.map((a) => a.identifiant)).toEqual(["a", "b"]);
  });
});
