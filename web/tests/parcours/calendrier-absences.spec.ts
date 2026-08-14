import { test, expect } from "@playwright/test";

/**
 * Le calendrier de période, côté avocat.
 *
 * Il remplace deux champs de date natifs, dont chacun ouvrait le calendrier du
 * navigateur par-dessus la fenêtre, sans jamais montrer la période obtenue. Ce que
 * ces essais vérifient est justement ce qui manquait : qu'on voie la période, qu'on
 * la pose en deux clics, et qu'on ne repose pas une période déjà bloquée.
 */
test.describe("calendrier des absences", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  /** Ouvre la fenêtre et avance de deux mois, pour ne pas dépendre du jour courant. */
  async function ouvrirSurUnMoisLibre(page: import("@playwright/test").Page) {
    await page.goto("/avocat/disponibilites");
    await page.getByRole("button", { name: /Ajouter une absence/ }).click();

    const fenetre = page.getByRole("dialog", { name: "Ajouter une absence" });
    await fenetre.getByRole("button", { name: "Mois suivant" }).click();
    await fenetre.getByRole("button", { name: "Mois suivant" }).click();
    return fenetre;
  }

  test("deux clics posent une période, et le résumé la dit", async ({ page }) => {
    const fenetre = await ouvrirSurUnMoisLibre(page);
    await expect(fenetre.getByText(/Cliquez sur un jour/)).toBeVisible();

    // Premier clic : une journée seule, validable telle quelle.
    await fenetre.getByRole("gridcell", { name: /-10$/ }).click();
    await expect(fenetre.getByText(/^Le /)).toBeVisible();

    // Second clic : la période se ferme, et le nombre de jours s'affiche.
    await fenetre.getByRole("gridcell", { name: /-17$/ }).click();
    await expect(fenetre.getByText(/Du 10 au 17 .+ · 8 jours/)).toBeVisible();

    await fenetre.getByLabel("Motif (facultatif)").fill("Essai calendrier");
    await fenetre.getByRole("button", { name: "Ajouter", exact: true }).click();

    await expect(page.getByText("Essai calendrier")).toBeVisible();

    // Ménage : cette absence servirait de décor aux autres essais.
    await page
      .getByRole("button", { name: /Supprimer l'absence du 10/ })
      .first()
      .click();
    await expect(page.getByText("Essai calendrier")).toHaveCount(0);
  });

  test("un raccourci pose une semaine sans compter les jours", async ({ page }) => {
    await page.goto("/avocat/disponibilites");
    await page.getByRole("button", { name: /Ajouter une absence/ }).click();

    const fenetre = page.getByRole("dialog", { name: "Ajouter une absence" });
    await fenetre.getByRole("button", { name: "1 semaine" }).click();
    await expect(fenetre.getByText(/· 7 jours/)).toBeVisible();

    await fenetre.getByRole("button", { name: "2 semaines" }).click();
    await expect(fenetre.getByText(/· 14 jours/)).toBeVisible();
  });

  test("les jours déjà bloqués ne se resélectionnent pas", async ({ page, request }) => {
    /*
     * Sans cela on repose la même semaine sans s'en apercevoir : deux absences
     * superposées bloquent les mêmes journées, et on ne sait plus laquelle retirer
     * pour redevenir disponible.
     */
    const dans = (jours: number) => {
      const d = new Date();
      d.setDate(d.getDate() + jours);
      return (
        d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0")
      );
    };
    const debut = dans(200);
    const fin = dans(202);

    const creation = await request.post("/api/avocat/disponibilites", {
      data: { quoi: "absence", debut, fin, motif: "Essai jours bloqués" },
    });
    expect(creation.status()).toBe(201);
    const { absence } = await creation.json();

    try {
      await page.goto("/avocat/disponibilites");
      await page.getByRole("button", { name: /Ajouter une absence/ }).click();
      const fenetre = page.getByRole("dialog", { name: "Ajouter une absence" });

      // Le calendrier s'ouvre sur le mois courant : on avance jusqu'à la période.
      for (let i = 0; i < 12; i++) {
        if ((await fenetre.getByRole("gridcell", { name: debut }).count()) > 0) break;
        await fenetre.getByRole("button", { name: "Mois suivant" }).click();
      }

      const bloque = fenetre.getByRole("gridcell", { name: debut + " (déjà bloqué)" });
      await expect(bloque).toBeVisible();
      await expect(bloque).toBeDisabled();
    } finally {
      await request.delete("/api/avocat/disponibilites", {
        data: { quoi: "absence", identifiant: absence.id },
      });
    }
  });

  test("la fenêtre reste utilisable sur un petit écran", async ({ page }) => {
    /*
     * Le calendrier a rendu la fenêtre plus haute que l'écran : son pied sortait par
     * le bas et le bouton « Ajouter » devenait inatteignable. On remplissait un
     * formulaire qu'on ne pouvait pas valider.
     */
    await page.setViewportSize({ width: 1280, height: 620 });
    await page.goto("/avocat/disponibilites");
    await page.getByRole("button", { name: /Ajouter une absence/ }).click();

    const fenetre = page.getByRole("dialog", { name: "Ajouter une absence" });
    const valider = fenetre.getByRole("button", { name: "Ajouter", exact: true });
    await expect(valider).toBeInViewport();
  });
});
