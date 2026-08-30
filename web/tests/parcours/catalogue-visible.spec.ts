import { test, expect } from "@playwright/test";
import { PARCOURS } from "../../src/domain/navigation/parcours";

/**
 * Ce que Formalist sait faire, dit à qui a déjà une société.
 *
 * Le catalogue s'affiche en entier sur le tableau de bord d'un compte sans société, et
 * disparaissait au premier dossier : de là, les huit parcours ne vivaient plus que
 * derrière le bouton « Nouvelle formalité » de la colonne. Le client qui a une SAS
 * depuis mars est justement celui qui voudra transférer son siège en juin, déposer ses
 * comptes en septembre, et peut-être la fermer un jour - et il n'avait plus nulle part
 * où l'apprendre.
 *
 * Le compte partagé des parcours porte des dossiers : c'est donc l'état « avec
 * sociétés » que cet essai regarde, celui que l'autre fichier ne peut pas voir.
 */

test("le tableau de bord nomme les huit parcours, dossiers ou pas", async ({ page }) => {
  await page.goto("/tableau-de-bord");

  const bande = page.getByRole("region", { name: "Que pouvons-nous faire pour vous ?" });
  await expect(bande).toBeVisible();

  for (const parcours of PARCOURS) {
    await expect(bande.getByText(parcours.titre, { exact: true }), parcours.titre).toBeVisible();
  }
});

test("chaque entrée mène à son parcours", async ({ page }) => {
  await page.goto("/tableau-de-bord");
  const bande = page.getByRole("region", { name: "Que pouvons-nous faire pour vous ?" });

  for (const parcours of PARCOURS.filter((p) => !p.bientot)) {
    await expect(
      bande.getByRole("link", { name: parcours.titre, exact: true }),
      parcours.titre
    ).toHaveAttribute("href", parcours.lien);
  }
});

test("le bouton de la colonne dit qu'il ouvre un choix", async ({ page }) => {
  /*
   * Le « + » seul promet une page vierge - c'est ce qu'il veut dire partout ailleurs,
   * « + Ajouter un associé ». Le bouton est pourtant la porte des huit formalités.
   */
  await page.goto("/tableau-de-bord");

  const bouton = page.getByRole("button", { name: "Nouvelle formalité" });
  await expect(bouton).toHaveAttribute("aria-haspopup", "dialog");
  await expect(bouton).toHaveAttribute("aria-expanded", "false");

  await bouton.click();
  await expect(bouton).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("dialog", { name: "Nouvelle formalité" })).toBeVisible();
});

test("la fenêtre dit ce que chaque formalité coûte et prend de temps", async ({ page }) => {
  /*
   * Elle montrait une version appauvrie de la carte de l'accueil : ni durée, ni prix,
   * ni flèche, ni la mention du parcours recommandé - au moment précis où l'on choisit
   * entre créer une société et créer une auto-entreprise. Les deux endroits où le
   * catalogue paraît emploient désormais la même carte.
   */
  await page.goto("/tableau-de-bord");
  await page.getByRole("button", { name: "Nouvelle formalité" }).click();

  const fenetre = page.getByRole("dialog", { name: "Nouvelle formalité" });
  await expect(fenetre).toBeVisible();

  for (const parcours of PARCOURS.filter((p) => !p.bientot)) {
    const carte = fenetre.getByRole("link", { name: new RegExp(parcours.titre) });
    await expect(carte, parcours.titre).toHaveAttribute("href", parcours.lien);
    await expect(carte, parcours.titre).toContainText(parcours.duree!);
    await expect(carte, parcours.titre).toContainText(parcours.prix!);
  }

  /*
   * Le parcours mis en avant se distingue sans se vanter.
   *
   * Il portait le mot « Recommandé » : nous annoncions un conseil que nous ne donnons
   * pas - créer une société n'est pas plus indiqué que la fermer. C'est le trait de la
   * carte qui le dit maintenant, et rien d'autre.
   */
  const enAvant = PARCOURS.find((p) => p.enAvant)!;
  const mise = fenetre.getByRole("link", { name: new RegExp(enAvant.titre) });
  await expect(mise).not.toContainText("Recommandé");
  await expect(fenetre.getByText("Recommandé")).toHaveCount(0);
});

test("le catalogue tient dans l'écran sans se couper", async ({ page }) => {
  /*
   * Quatre familles empilées faisaient descendre l'œil sur autant d'écrans de liste ;
   * rangées par deux, le catalogue se voit d'un coup. La fenêtre défilait par ailleurs
   * de la hauteur de son propre retrait - dix-huit pixels, que payait la dernière
   * ligne de cartes, et qui donnaient l'air d'un contenu tronqué.
   */
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tableau-de-bord");
  await page.getByRole("button", { name: "Nouvelle formalité" }).click();

  const mesures = await page.evaluate(() => {
    const fenetre = document.querySelector('[role="dialog"]')!;
    const familles = fenetre.querySelector('[class*="familles"]') as HTMLElement;
    return {
      defile: familles.scrollHeight > familles.clientHeight,
      dansLEcran: fenetre.getBoundingClientRect().bottom <= window.innerHeight,
    };
  });

  expect(mesures.defile).toBe(false);
  expect(mesures.dansLEcran).toBe(true);
});

test("le survol n'emprunte pas la marque du parcours mis en avant", async ({ page }) => {
  /*
   * La flèche prenait l'encre pleine au survol - celle qui distingue justement la carte
   * mise en avant. Survoler « Modifier ma société » lui donnait la flèche de « Créer une
   * société », et les deux ne se distinguaient plus qu'au cadre. Une marque qui
   * disparaît sous le curseur n'en est plus une.
   */
  await page.goto("/tableau-de-bord");
  await page.getByRole("button", { name: "Nouvelle formalité" }).click();
  const fenetre = page.getByRole("dialog", { name: "Nouvelle formalité" });

  const ordinaire = fenetre.getByRole("link", { name: /Modifier ma société/ });
  await ordinaire.hover();

  const encre = "rgb(24, 24, 27)";
  const fondDeLaFleche = (carte: typeof ordinaire) =>
    carte.locator("span").last().evaluate((n) => getComputedStyle(n).backgroundColor);

  expect(await fondDeLaFleche(ordinaire)).not.toBe(encre);

  /* Celle du parcours mis en avant la garde, survolée ou non. */
  const misEnAvant = fenetre.getByRole("link", { name: /Créer une société/ });
  expect(await fondDeLaFleche(misEnAvant)).toBe(encre);
});
