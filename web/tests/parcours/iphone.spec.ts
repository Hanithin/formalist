import { test, expect, devices } from "@playwright/test";

/**
 * Ce qu'un iPhone sanctionne et qu'un écran d'ordinateur laisse passer.
 *
 * Deux défauts vivaient dans l'application sans qu'aucun test ne les voie. Un champ
 * dont la police descend sous seize pixels fait zoomer Safari à la mise au point, et
 * il ne dézoome pas : le client tapait « Prénom », la page sautait en avant, et il
 * remplissait le reste en poussant l'écran de gauche à droite. Une page plus large que
 * l'écran, elle, se pousse de côté à chaque geste.
 *
 * Les deux se mesurent, donc ils se gardent. Le viewport est celui de l'iPhone SE -
 * le plus étroit encore en circulation : ce qui tient là tient partout.
 */

const IPHONE_SE = { width: 375, height: 667 };

test.use({ ...devices["iPhone 13"], viewport: IPHONE_SE });

const PAGES = [
  ["l'accueil", "/tableau-de-bord"],
  ["les formalités", "/formalites"],
  ["les sociétés", "/societes"],
  ["les documents", "/documents"],
  ["la messagerie", "/messagerie"],
  ["les paramètres", "/parametres"],
  ["l'équipe", "/equipe"],
  ["le choix d'une modification", "/modification"],
  ["la création", "/creation"],
  ["l'auto-entrepreneur", "/auto-entrepreneur"],
] as const;

for (const [nom, chemin] of PAGES) {
  test(nom + " tient dans la largeur d'un iPhone", async ({ page }) => {
    await page.goto(chemin);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(800);

    const largeur = await page.evaluate(() => document.documentElement.scrollWidth);
    // Un pixel de tolérance : les bordures fractionnaires en produisent parfois un.
    expect(largeur, "la page déborde de " + (largeur - 375) + " px").toBeLessThanOrEqual(376);
  });

  test(nom + " n'a aucun champ sous seize pixels", async ({ page }) => {
    await page.goto(chemin);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(800);

    const petits = await page.evaluate(() => {
      const trouves: string[] = [];
      for (const champ of document.querySelectorAll("input, select, textarea")) {
        const cadre = champ.getBoundingClientRect();
        if (cadre.width < 2 || cadre.height < 2) continue;
        const taille = parseFloat(getComputedStyle(champ).fontSize);
        if (taille < 16) {
          trouves.push(
            champ.tagName.toLowerCase() +
              (champ.getAttribute("name") ? "[" + champ.getAttribute("name") + "]" : "") +
              " à " +
              taille +
              "px"
          );
        }
      }
      return trouves;
    });

    expect(petits, "Safari zoomerait sur ces champs").toEqual([]);
  });
}
