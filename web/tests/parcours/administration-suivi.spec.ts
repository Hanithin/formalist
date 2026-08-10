import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

/**
 * Vues de suivi de l'administration.
 *
 * Le serveur d'origine les servait par dix points d'entrée distincts, chacun
 * appelé séparément : dix allers-retours pour un seul écran.
 */

function comptes() {
  return JSON.parse(readFileSync(path.join(import.meta.dirname, "comptes.json"), "utf8")) as {
    client: number;
    avocat: number;
    admin: number;
  };
}

test.describe("accès refusé", () => {
  test("un client ne voit pas le suivi", async ({ page }) => {
    const reponse = await page.goto("/administration/dossiers");
    expect(reponse?.status()).toBe(404);
  });

  test("un client ne peut pas assigner un avocat", async ({ request }) => {
    const reponse = await request.put("/api/administration/assignation", {
      data: { dossier: 1, avocat: 1 },
    });
    expect(reponse.status()).toBe(403);
  });

  test("sans session non plus", async ({ browser }) => {
    const anonyme = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const reponse = await anonyme.request.put("/api/administration/assignation", { data: {} });
    expect(reponse.status()).toBe(401);
    await anonyme.close();
  });
});

test.describe("un avocat n'est pas administrateur", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  test("il ne voit pas le suivi", async ({ page }) => {
    const reponse = await page.goto("/administration/dossiers");
    expect(reponse?.status()).toBe(404);
  });
});

test.describe("administrateur", () => {
  test.use({ storageState: "./tests/parcours/session-admin.json" });

  test("le suivi réunit dossiers, activité, contacts et paiements", async ({ page }) => {
    await page.goto("/administration/dossiers");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Suivi de la plateforme");
    await expect(page.getByRole("heading", { name: "Dossiers" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Activité récente" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Messages de contact" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Paiements" })).toBeVisible();
  });

  test("les dossiers du jeu d'essai y figurent, avec leur état lisible", async ({ page }) => {
    await page.goto("/administration/dossiers");
    const dossiers = page.locator("section", { hasText: "Dossiers" }).first();
    await expect(dossiers.getByText("PARCOURS EN COURS").first()).toBeVisible();

    // L'état est traduit, pas affiché en valeur technique. On vise la section :
    // le nom des actions tracées contient « terminee » en toutes lettres.
    await expect(dossiers.getByText(/·\s*(Immatriculée|En cours|Validé)/).first()).toBeVisible();
  });

  test("l'activité montre les actions tracées, y compris hors dossier", async ({ page }) => {
    await page.goto("/administration/dossiers");
    // Les changements de rôle sont tracés sans dossier : ils doivent apparaître.
    const activite = page.locator("section", { hasText: "Activité récente" });
    await expect(activite.getByText(/plateforme|dossier \d+/).first()).toBeVisible();
  });

  test("un avocat s'assigne à un dossier", async ({ request }) => {
    const { avocat } = comptes();
    const vues = await (await request.get("/api/formalites")).json();
    const cible = vues.dossiers.find((d: { societe: string }) => d.societe === "PARCOURS EN COURS");

    const reponse = await request.put("/api/administration/assignation", {
      data: { dossier: cible.id, avocat },
    });
    expect(reponse.status()).toBe(200);
    expect((await reponse.json()).avocat).toBe("Maître Dupont");
  });

  test("assigner quelqu'un qui n'est pas avocat est refusé", async ({ request }) => {
    const { client } = comptes();
    const vues = await (await request.get("/api/formalites")).json();
    const cible = vues.dossiers[0];

    const reponse = await request.put("/api/administration/assignation", {
      data: { dossier: cible.id, avocat: client },
    });
    expect(reponse.status()).toBe(400);
    expect((await reponse.json()).error).toContain("pas un avocat");
  });

  test("la page principale mène au suivi", async ({ page }) => {
    await page.goto("/administration");
    await page.getByRole("link", { name: /Suivi des dossiers/ }).click();
    await page.waitForURL(/\/administration\/dossiers/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Suivi");
  });
});
