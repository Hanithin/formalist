import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * La feuille globale ne doit pas surclasser les feuilles des pages.
 *
 * Ce test existe pour un défaut qui ne se voit pas en lisant le code : globals.css
 * habille les <button> pour les formulaires, et ses règles de survol étaient écrites
 * button:hover:not(:disabled). Or :not() compte dans la spécificité. Ce sélecteur
 * valait donc une classe de plus qu'un .maClasse:hover écrit dans un module, et
 * gagnait contre lui.
 *
 * Le symptôme est discret et se disperse : une pastille de filtre, un onglet, une
 * carte cliquable passaient au gris de formulaire au survol au lieu de leur couleur
 * propre, sur toutes les pages à la fois, et la règle de la page semblait ignorée.
 * :where() se comporte pareil sans compter dans la spécificité.
 */
const GLOBAL = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");

describe("spécificité de la feuille globale", () => {
  it("les survols de bouton ne comptent pas plus qu'une classe", () => {
    const survols = GLOBAL.match(/^\s*button[^\n{]*:hover[^\n{]*\{/gm) ?? [];
    expect(survols.length).toBeGreaterThan(0);

    for (const selecteur of survols) {
      // :not() compterait ; :where(:not(...)) se comporte pareil sans compter.
      expect(selecteur).not.toMatch(/(?<!:where\():not\(/);
    }
  });

  it("aucune règle globale n'impose sa volonté par !important", () => {
    /*
     * Une déclaration !important dans la feuille globale ne se contourne plus depuis
     * une page : la page n'a aucun recours, quelle que soit sa spécificité.
     */
    expect(GLOBAL).not.toMatch(/!important/);
  });
});
