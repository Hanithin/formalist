import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Deux règles de mise en forme que seul un iPhone sanctionne.
 *
 * Elles ne cassent rien sur un écran d'ordinateur : la page s'affiche, les tests de
 * parcours passent, et le défaut ne se voit qu'en tenant un téléphone. C'est
 * exactement le genre de chose qui revient six mois plus tard - d'où ce contrôle sur
 * les feuilles elles-mêmes, qui ne demande ni navigateur ni serveur.
 */

/** Toutes les feuilles de l'application, parcourues à la main : pas de dépendance. */
function feuilles(dossier: string): string[] {
  const trouvees: string[] = [];
  for (const entree of readdirSync(path.join(process.cwd(), dossier), { withFileTypes: true })) {
    const chemin = dossier + "/" + entree.name;
    if (entree.isDirectory()) trouvees.push(...feuilles(chemin));
    else if (entree.name.endsWith(".css")) trouvees.push(chemin);
  }
  return trouvees;
}

const FEUILLES = feuilles("src");

function lire(fichier: string): string {
  return readFileSync(path.join(process.cwd(), fichier), "utf8");
}

/** Les lignes de code, sans les commentaires : un exemple cité n'est pas une règle. */
function sansCommentaires(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("la hauteur d'écran", () => {
  it("se dit en dvh partout où elle se dit en vh", () => {
    /*
     * Sur iOS, `100vh` vaut la hauteur qu'aurait l'écran sans la barre d'adresse -
     * toujours plus que ce qu'on voit. Une coquille qui ne défile pas et qui dépasse
     * par le bas rend inatteignable ce qui s'y trouve : le bouton « Continuer » d'un
     * parcours passait sous la barre d'outils de Safari.
     */
    const manques: string[] = [];

    for (const feuille of FEUILLES) {
      const css = sansCommentaires(lire(feuille));
      const lignes = css.split("\n");

      lignes.forEach((ligne, rang) => {
        if (!/\d+vh/.test(ligne)) return;
        const declaration = ligne.match(/^\s*((?:min-|max-)?height)\s*:/);
        if (!declaration) return;

        const suivante = lignes[rang + 1] ?? "";
        const memeProprieteEnDvh =
          suivante.trim().startsWith(declaration[1] + ":") && /\d+dvh/.test(suivante);

        if (!memeProprieteEnDvh) manques.push(feuille + ":" + (rang + 1) + " " + ligne.trim());
      });
    }

    expect(manques).toEqual([]);
  });
});

describe("la taille des champs de saisie", () => {
  it("ne descend jamais sous seize pixels sur téléphone", () => {
    /*
     * Safari sur iOS zoome l'écran dès qu'on touche un champ dont la police est sous
     * seize pixels, et il ne dézoome pas ensuite : le client tapait « Prénom », la
     * page sautait en avant, et il remplissait le reste en poussant l'écran de gauche
     * à droite.
     *
     * La règle est posée une fois dans globals.css, sous 700 px de large. Ce test
     * garde cette règle plutôt que d'inspecter chaque feuille : c'est elle qui gagne,
     * et la retirer suffirait à faire revenir le défaut partout.
     */
    const globals = lire("src/app/globals.css");

    const regle = globals.match(
      /@media\s*\(max-width:\s*700px\)\s*\{\s*input,\s*select,\s*textarea\s*\{\s*font-size:\s*([\d.]+)px/
    );
    expect(regle, "la règle des champs à seize pixels").not.toBeNull();
    expect(Number(regle![1])).toBeGreaterThanOrEqual(16);

    /*
     * Et elle doit venir après la règle qu'elle corrige.
     *
     * Elles ont la même spécificité : c'est l'ordre qui tranche. Placée avant, elle se
     * faisait recouvrir par les quinze pixels de la règle de base, et la mesure dans
     * le navigateur était le seul moyen de s'en apercevoir.
     */
    const base = globals.search(/^input,\s*\nselect,\s*\ntextarea\s*\{/m);
    expect(base, "la règle de base des champs").toBeGreaterThan(-1);
    expect(globals.indexOf(regle![0])).toBeGreaterThan(base);
  });
});
