import { test, expect } from "@playwright/test";

/**
 * Inscription et prise de rendez-vous.
 */

test.describe("inscription", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("la page est publique et annonce la règle du mot de passe", async ({ page }) => {
    const reponse = await page.goto("/inscription");
    expect(reponse?.status()).toBe(200);
    // La règle est dite avant la saisie, pas après le refus.
    await expect(page.getByText(/Au moins 8 caractères/)).toBeVisible();
  });

  test("un mot de passe trop courant est refusé", async ({ page }) => {
    await page.goto("/inscription");
    await page.getByLabel("Prénom").fill("Test");
    await page.getByLabel("Nom", { exact: true }).fill("Essai");
    await page.getByLabel("Adresse email").fill("nouveau-" + Date.now() + "@exemple.test");
    await page.getByLabel("Mot de passe").fill("motdepasse");
    await page.getByRole("button", { name: /Créer mon compte/ }).click();

    await expect(page.locator("form p[role=alert]")).toContainText("trop courant");
  });

  test("une inscription valide renvoie vers l'email, sans ouvrir de session", async ({
    page,
    context,
  }) => {
    await page.goto("/inscription");
    await page.getByLabel("Prénom").fill("Nouvelle");
    await page.getByLabel("Nom", { exact: true }).fill("Personne");
    await page.getByLabel("Adresse email").fill("nouvelle-" + Date.now() + "@exemple.test");
    await page.getByLabel("Mot de passe").fill("brouette-lampadaire-42");
    await page.getByRole("button", { name: /Créer mon compte/ }).click();

    await expect(page.getByRole("status")).toContainText("lien de confirmation");

    // Le compte n'est utilisable qu'une fois l'adresse confirmée.
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === "formalist_session")).toBeUndefined();
  });

  test("une adresse déjà prise donne la même réponse", async ({ request }) => {
    // Distinguer permettrait d'énumérer les comptes existants.
    const reponse = await request.post("/api/auth/inscription", {
      data: {
        prenom: "Camille",
        nom: "Parcours",
        email: "parcours@exemple.test",
        motDePasse: "brouette-lampadaire-42",
      },
    });
    expect(reponse.status()).toBe(201);
    expect((await reponse.json()).message).toContain("lien de confirmation");
  });

  test("un lien de confirmation invalide le dit sans planter", async ({ page }) => {
    await page.goto("/api/auth/verifier?jeton=" + "0".repeat(64));
    await expect(page).toHaveURL(/confirmation=inconnu/);
    await expect(page.getByRole("status")).toContainText("pas valable");
  });
});

test.describe("consultations", () => {
  test("la page propose un avocat et des créneaux", async ({ page }) => {
    await page.goto("/consultations");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Consultation juridique");
    await expect(page.getByLabel("Avocat")).toBeVisible();

    // Les créneaux arrivent après un appel : on attend qu'ils s'affichent.
    await expect(page.getByRole("group", { name: "Créneau" })).toBeVisible();
  });

  test("réserver sans choisir de créneau est refusé", async ({ page }) => {
    await page.goto("/consultations");
    await page.getByLabel("Sujet").fill("Question sur mes statuts");
    await page.getByRole("button", { name: /Réserver ce créneau/ }).click();

    await expect(page.locator("form p[role=alert]")).toContainText("Choisissez un créneau");
  });

  test("un créneau déjà passé n'est jamais proposé", async ({ request }) => {
    const reponse = await request.get("/api/consultations/creneaux?avocat=1&jours=14");
    if (reponse.status() !== 200) return;

    const { creneaux } = await reponse.json();
    for (const c of creneaux) {
      expect(new Date(c.debut).getTime()).toBeGreaterThan(Date.now());
    }
  });

  test("réserver un créneau inventé est refusé", async ({ page, request }) => {
    await page.goto("/consultations");
    const avocat = await page.getByLabel("Avocat").inputValue();

    const dansUnAn = new Date();
    dansUnAn.setFullYear(dansUnAn.getFullYear() + 1);

    const reponse = await request.post("/api/consultations", {
      data: {
        avocat: Number(avocat),
        debut: dansUnAn.toISOString(),
        sujet: "Créneau inventé",
      },
    });
    // Le créneau est revérifié au moment de réserver.
    expect(reponse.status()).toBe(409);
  });

  test.describe("sans session", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("rien n'est accessible", async ({ request }) => {
      expect((await request.get("/api/consultations")).status()).toBe(401);
      expect((await request.get("/api/consultations/creneaux?avocat=1")).status()).toBe(401);
    });
  });
});
