import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

/**
 * L'administration.
 *
 * C'est le seul endroit où l'on accorde le rôle avocat, qui ouvre l'accès aux
 * dossiers d'un cabinet. Les vérifications portent donc surtout sur qui peut y
 * entrer et sur ce qu'on ne peut pas s'y faire à soi-même.
 */

test.describe("accès refusé", () => {
  test("un client ne voit pas l'administration", async ({ page }) => {
    const reponse = await page.goto("/administration");
    expect(reponse?.status()).toBe(404);
  });

  test("un client ne peut pas s'accorder un rôle", async ({ request }) => {
    const reponse = await request.put("/api/administration/roles", {
      data: { compte: 1, roles: ["admin"] },
    });
    expect(reponse.status()).toBe(403);
  });

  test("un client ne peut pas suspendre quelqu'un", async ({ request }) => {
    const reponse = await request.put("/api/administration/suspension", {
      data: { compte: 1, suspendu: true },
    });
    expect(reponse.status()).toBe(403);
  });

  test("sans session, rien n'est accessible", async ({ browser }) => {
    const anonyme = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const reponse = await anonyme.request.put("/api/administration/roles", { data: {} });
    expect(reponse.status()).toBe(401);
    await anonyme.close();
  });
});

test.describe("un avocat n'est pas administrateur", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  test("il ne voit pas l'administration non plus", async ({ page }) => {
    const reponse = await page.goto("/administration");
    expect(reponse?.status()).toBe(404);
  });

  test("il ne peut accorder aucun rôle", async ({ request }) => {
    const reponse = await request.put("/api/administration/roles", {
      data: { compte: 1, roles: ["admin"] },
    });
    expect(reponse.status()).toBe(403);
  });
});

test.describe("administrateur", () => {
  test.use({ storageState: "./tests/parcours/session-admin.json" });

  test("voit les chiffres de la plateforme et les comptes", async ({ page }) => {
    await page.goto("/administration");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Plateforme");
    await expect(page.getByRole("heading", { name: "Comptes" })).toBeVisible();
    // Les trois adresses d'essai se terminent pareil : on vise l'exacte.
    await expect(page.getByText("parcours@exemple.test", { exact: true })).toBeVisible();
  });

  test("la recherche filtre les comptes", async ({ page }) => {
    await page.goto("/administration");
    await page.getByLabel("Rechercher un compte").fill("avocat-parcours");

    await expect(page.getByText("avocat-parcours@exemple.test")).toBeVisible();
    await expect(page.getByText("parcours@exemple.test", { exact: true })).toHaveCount(0);
  });

  test("accorde et retire le rôle avocat", async ({ page, request }) => {
    // Un compte réservé à ce test : plusieurs tests modifient des rôles en
    // parallèle, et partager une cible les faisait se marcher dessus.
    const cible = JSON.parse(
      readFileSync(path.join(import.meta.dirname, "comptes.json"), "utf8")
    ).cibleA as number;

    const accorde = await request.put("/api/administration/roles", {
      data: { compte: cible, roles: ["user", "avocat"] },
    });
    expect(accorde.status()).toBe(200);
    expect((await accorde.json()).principal).toBe("avocat");

    await page.goto("/administration");
    const ligne = page.locator("li").filter({
      has: page.getByText("cible-role-a@exemple.test", { exact: true }),
    });
    await expect(ligne.getByLabel("Avocat")).toBeChecked();

    const retire = await request.put("/api/administration/roles", {
      data: { compte: cible, roles: ["user"] },
    });
    expect(retire.status()).toBe(200);
  });

  test("ne peut pas retirer son propre accès administrateur", async ({ request }) => {
    const moi = JSON.parse(
      readFileSync(path.join(import.meta.dirname, "comptes.json"), "utf8")
    ).admin as number;

    const reponse = await request.put("/api/administration/roles", {
      data: { compte: moi, roles: ["user"] },
    });
    expect(reponse.status()).toBe(400);
    expect((await reponse.json()).error).toContain("votre propre accès");
  });

  test("ne peut pas suspendre son propre compte", async ({ request }) => {
    const moi = JSON.parse(
      readFileSync(path.join(import.meta.dirname, "comptes.json"), "utf8")
    ).admin as number;

    const reponse = await request.put("/api/administration/suspension", {
      data: { compte: moi, suspendu: true },
    });
    expect(reponse.status()).toBe(400);
  });

  test("une liste de rôles vide est refusée", async ({ request }) => {
    const cible = JSON.parse(
      readFileSync(path.join(import.meta.dirname, "comptes.json"), "utf8")
    ).cibleB as number;

    const reponse = await request.put("/api/administration/roles", {
      data: { compte: cible, roles: [] },
    });
    expect(reponse.status()).toBe(400);
  });

  test("un rôle inventé est écarté sans faire échouer le reste", async ({ request }) => {
    const cible = JSON.parse(
      readFileSync(path.join(import.meta.dirname, "comptes.json"), "utf8")
    ).cibleB as number;

    const reponse = await request.put("/api/administration/roles", {
      data: { compte: cible, roles: ["user", "super-admin"] },
    });
    expect(reponse.status()).toBe(200);
    expect((await reponse.json()).roles).toEqual(["user"]);
  });
});
