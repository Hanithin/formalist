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
