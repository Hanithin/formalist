import { test, expect } from "@playwright/test";

test("la page d'accueil répond et porte le nom du produit", async ({ page }) => {
  const reponse = await page.goto("/");
  expect(reponse?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Formalist");
});
