import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { aAppliquer } from "../../scripts/appliquer-les-migrations.mjs";

/**
 * L'ordre et le choix de ce qui reste à passer.
 *
 * Le reste du script parle à Postgres ; ce qu'on peut vérifier sans base, c'est la
 * décision : lesquelles, et dans quel ordre.
 */
describe("les migrations à appliquer", () => {
  it("ne garde que ce qui n'est pas déjà passé", () => {
    const restantes = aAppliquer(
      ["001_a.sql", "002_b.sql", "003_c.sql"],
      ["001_a.sql", "002_b.sql"]
    );
    expect(restantes).toEqual(["003_c.sql"]);
  });

  it("les rend dans l'ordre des numéros, non celui du disque", () => {
    // readdir ne promet aucun ordre : une migration qui en suppose une autre passerait
    // avant elle, et échouerait sur une table qui n'existe pas encore.
    const restantes = aAppliquer(["010_j.sql", "002_b.sql", "001_a.sql"], []);
    expect(restantes).toEqual(["001_a.sql", "002_b.sql", "010_j.sql"]);
  });

  it("ignore ce qui n'est pas du SQL", () => {
    expect(aAppliquer(["001_a.sql", "notes.md", ".DS_Store"], [])).toEqual(["001_a.sql"]);
  });

  it("ne rend rien quand tout est passé", () => {
    expect(aAppliquer(["001_a.sql"], ["001_a.sql"])).toEqual([]);
  });
});

/**
 * Les fichiers eux-mêmes doivent supporter d'être rejoués.
 *
 * La table `schema_migrations` ne dit pas ce que la base contient : sur une base déjà
 * en service, la première exécution du script les rejoue tous. C'est ce qui rattrape
 * les migrations restées en arrière - mais cela ne tient que si chacune est écrite
 * pour être passée deux fois.
 */
describe("les fichiers de migration", () => {
  const DOSSIER = path.join(process.cwd(), "..", "migrations");
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql"));

  it("il y en a", () => {
    expect(fichiers.length).toBeGreaterThan(0);
  });

  it.each(fichiers)("%s se rejoue sans casser", (nom) => {
    const sql = readFileSync(path.join(DOSSIER, nom), "utf8");
    /* Les commentaires racontent le pourquoi : ils ne comptent pas comme des gardes. */
    const code = sql
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");

    for (const [motif, garde] of [
      [/CREATE TABLE\s+(?!IF NOT EXISTS)/i, "CREATE TABLE sans IF NOT EXISTS"],
      [/CREATE INDEX\s+(?!IF NOT EXISTS)/i, "CREATE INDEX sans IF NOT EXISTS"],
      [/CREATE UNIQUE INDEX\s+(?!IF NOT EXISTS)/i, "CREATE UNIQUE INDEX sans IF NOT EXISTS"],
      [/ADD COLUMN\s+(?!IF NOT EXISTS)/i, "ADD COLUMN sans IF NOT EXISTS"],
    ] as [RegExp, string][]) {
      expect(motif.test(code), nom + " : " + garde).toBe(false);
    }

    /* Une contrainte se retire avant d'être reposée : la reposer telle quelle échoue. */
    const contraintesAjoutees = (code.match(/ADD CONSTRAINT\s+(\w+)/gi) ?? []).map((m) =>
      m.split(/\s+/).pop()
    );
    for (const contrainte of contraintesAjoutees) {
      expect(
        new RegExp("DROP CONSTRAINT IF EXISTS\\s+" + contrainte, "i").test(code),
        nom + " : « " + contrainte + " » est ajoutée sans être retirée d'abord"
      ).toBe(true);
    }
  });
});
