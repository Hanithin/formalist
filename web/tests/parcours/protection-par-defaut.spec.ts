import { test, expect } from "@playwright/test";

/**
 * La protection par défaut, vue depuis un navigateur.
 *
 * Les tests de domaine vérifient la liste des adresses publiques ; ceux-ci
 * vérifient qu'elle est réellement appliquée à l'entrée, sur les vraies adresses.
 */

// Aucune session : c'est précisément ce qu'on vérifie ici.
test.use({ storageState: { cookies: [], origins: [] } });

test("une page protégée renvoie vers la connexion", async ({ page }) => {
  await page.goto("/tableau-de-bord");
  await expect(page).toHaveURL(/\/connexion/);
});

test("la destination est conservée pour y revenir après connexion", async ({ page }) => {
  await page.goto("/tableau-de-bord");
  expect(new URL(page.url()).searchParams.get("suite")).toBe("/tableau-de-bord");
});

test("une requête d'API refuse au lieu de rediriger", async ({ request }) => {
  const reponse = await request.get("/api/formalites");
  expect(reponse.status()).toBe(401);
  expect(await reponse.json()).toEqual({ error: "Authentification requise" });
});

test("un cookie inventé ne donne pas accès aux données", async ({ request }) => {
  const reponse = await request.get("/api/formalites", {
    headers: { cookie: "formalist_session=jeton-invente-de-toutes-pieces" },
  });
  expect(reponse.status()).toBe(401);
});

test("les pages publiques restent accessibles", async ({ page }) => {
  for (const chemin of ["/", "/connexion"]) {
    const reponse = await page.goto(chemin);
    expect(reponse?.status()).toBe(200);
  }
});
