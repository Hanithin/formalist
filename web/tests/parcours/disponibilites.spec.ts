import { test, expect } from "@playwright/test";

/**
 * « Mes disponibilités », côté avocat.
 *
 * La série tourne sous le compte avocat préparé par preparer.ts. Les plages ajoutées
 * ici sont retirées par le test lui-même : elles serviraient sinon de créneaux aux
 * autres essais, qui réservent de vrais rendez-vous.
 */
test.describe("disponibilités de l'avocat", () => {
  // La session par défaut est celle d'un client : cette page est réservée à l'avocat.
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  test("la page se trouve depuis l'espace avocat", async ({ page }) => {
    await page.goto("/avocat");
    await page
      .getByRole("navigation", { name: "Navigation principale" })
      .getByRole("link", { name: "Mes disponibilités" })
      .click();

    await expect(page).toHaveURL(/\/avocat\/disponibilites$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Mes disponibilités");
    await expect(page.getByRole("heading", { name: "Créneaux hebdomadaires" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Vacances et absences" })).toBeVisible();
  });

  test("ajouter puis retirer un créneau", async ({ page }) => {
    await page.goto("/avocat/disponibilites");
    await page.getByRole("button", { name: /Ajouter un créneau/ }).click();

    const fenetre = page.getByRole("dialog", { name: "Ajouter un créneau" });
    // Le dimanche est choisi exprès : aucun autre essai ne réserve ce jour-là.
    await fenetre.getByRole("button", { name: "Effacer" }).click();
    await fenetre.getByRole("button", { name: "Dim", exact: true }).click();
    await fenetre.getByLabel("Début").fill("07:00");
    await fenetre.getByLabel("Fin").fill("08:00");
    await fenetre.getByRole("button", { name: "Ajouter", exact: true }).click();

    const plage = page.getByText("07:00 - 08:00");
    await expect(plage).toBeVisible();
    await expect(page.getByText("Dimanche")).toBeVisible();

    await page.getByRole("button", { name: /Supprimer le créneau du Dimanche 07:00/ }).click();
    await expect(plage).toHaveCount(0);
  });

  test("un créneau qui en chevauche un autre est refusé, et le dit", async ({ page }) => {
    await page.goto("/avocat/disponibilites");

    async function ajouter(debut: string, fin: string) {
      await page.getByRole("button", { name: /Ajouter un créneau/ }).click();
      const fenetre = page.getByRole("dialog", { name: "Ajouter un créneau" });
      await fenetre.getByRole("button", { name: "Effacer" }).click();
      await fenetre.getByRole("button", { name: "Dim", exact: true }).click();
      await fenetre.getByLabel("Début").fill(debut);
      await fenetre.getByLabel("Fin").fill(fin);
      await fenetre.getByRole("button", { name: "Ajouter", exact: true }).click();
      return fenetre;
    }

    /*
     * Des heures distinctes de l'essai voisin : la série tourne en parallèle sous le
     * même compte avocat, et deux essais qui posent le même créneau se percutent.
     */
    await ajouter("05:00", "06:00");
    await expect(page.getByText("05:00 - 06:00")).toBeVisible();

    /*
     * Le refus vient du serveur, pas de la page : c'est ce qui compte, un contrôle
     * qui ne vivrait que dans le navigateur se contournerait par un appel direct.
     */
    const fenetre = await ajouter("05:30", "06:30");
    await expect(fenetre.getByRole("alert")).toContainText("chevauche");

    await page.getByRole("button", { name: "Annuler" }).click();
    await page.getByRole("button", { name: /Supprimer le créneau du Dimanche 05:00/ }).click();
    await expect(page.getByText("05:00 - 06:00")).toHaveCount(0);
  });

  test("les onglets restent visibles depuis l'onglet Consultations", async ({ page }) => {
    /*
     * La page des consultations est partagée avec le client, et n'affichait donc pas
     * la barre d'onglets : en cliquant dessus depuis l'espace avocat, on perdait
     * « Mes disponibilités » sans autre issue que de repasser par « Espace avocat ».
     */
    await page.goto("/avocat/disponibilites");
    await page.getByRole("link", { name: "Consultations" }).click();

    await expect(page).toHaveURL(/\/consultations$/);
    await expect(
      page
        .getByRole("navigation", { name: "Navigation principale" })
        .getByRole("link", { name: "Mes disponibilités" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Dossiers", exact: true })).toBeVisible();
  });

  test("un client n'accède pas à la page", async ({ browser, baseURL }) => {
    // Un 404 plutôt qu'un refus explicite : la réponse ne renseigne pas sur ce qui
    // existe, comme sur le reste de l'espace avocat.
    const contexte = await browser.newContext({
      baseURL,
      storageState: "./tests/parcours/session.json",
    });
    const page = await contexte.newPage();
    const reponse = await page.goto("/avocat/disponibilites");
    expect(reponse?.status()).toBe(404);
    await contexte.close();
  });

  test("sans session, l'API refuse", async ({ browser, baseURL }) => {
    const contexte = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const reponse = await contexte.request.get("/api/avocat/disponibilites");
    expect(reponse.status()).toBe(401);
    await contexte.close();
  });
});
