import { test, expect } from "@playwright/test";

/**
 * La ligne de tête de chaque écran s'aligne sur le logo.
 *
 * Le titre d'une page et le logo de la colonne se lisent côte à côte, à deux
 * centimètres l'un de l'autre : un décalage de quelques pixels se voit, et il se
 * voyait - « Documents » montait plus haut que « Mes sociétés », qui descendait plus
 * bas que « Espace avocat ». Chaque page posait sa marge de tête au jugé, et personne
 * ne comparait.
 *
 * On mesure le milieu du logo et celui du titre. Deux pixels d'écart passent : c'est
 * le creux que la fonte réserve sous la ligne de base, que les capitales n'occupent
 * pas.
 */
const PAGES = [
  ["l'accueil", "/tableau-de-bord"],
  ["les formalités", "/formalites"],
  ["les sociétés", "/societes"],
  ["les documents", "/documents"],
  ["les contrats", "/contrats"],
  ["les consultations", "/consultations"],
  ["l'équipe", "/equipe"],
  ["les paramètres", "/parametres"],
] as const;

for (const [nom, chemin] of PAGES) {
  test(nom + " : le titre est sur la ligne du logo", async ({ page }) => {
    await page.goto(chemin);

    const logo = await page.locator("img[alt='Formalist']").boundingBox();
    const titre = await page.locator("main h1").first().boundingBox();

    expect(logo, "logo").not.toBeNull();
    expect(titre, "titre").not.toBeNull();

    const milieuLogo = logo!.y + logo!.height / 2;
    const milieuTitre = titre!.y + titre!.height / 2;

    expect(
      Math.abs(milieuTitre - milieuLogo),
      nom + " : " + Math.round(milieuTitre) + " contre " + Math.round(milieuLogo)
    ).toBeLessThanOrEqual(2);
  });
}

/*
 * L'espace avocat pose son propre bandeau, avec ses pastilles à côté du titre : sa
 * ligne de tête doit tomber sur la même que celle du client.
 */
test.describe("l'espace avocat", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  for (const [nom, chemin] of [
    ["les dossiers", "/avocat"],
    ["les disponibilités", "/avocat/disponibilites"],
  ] as const) {
    test(nom + " : le titre est sur la ligne du logo", async ({ page }) => {
      await page.goto(chemin);

      const logo = await page.locator("img[alt='Formalist']").boundingBox();
      const titre = await page.locator("main h1").first().boundingBox();

      const milieuLogo = logo!.y + logo!.height / 2;
      const milieuTitre = titre!.y + titre!.height / 2;

      expect(
        Math.abs(milieuTitre - milieuLogo),
        nom + " : " + Math.round(milieuTitre) + " contre " + Math.round(milieuLogo)
      ).toBeLessThanOrEqual(2);
    });
  }
});
