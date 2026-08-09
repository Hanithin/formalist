import { test, expect } from "@playwright/test";

/**
 * La vitrine vue par un moteur de recherche.
 *
 * Le site n'avait ni plan, ni flux, ni description : chaque article devait être
 * découvert par exploration. Ces vérifications empêchent de repartir en arrière.
 */

test("l'accueil porte un titre et une description utiles", async ({ page }) => {
  const reponse = await page.goto("/");
  expect(reponse?.status()).toBe(200);
  await expect(page).toHaveTitle(/Formalist/);

  // Le titre de page porte la marque ; le titre de niveau 1 porte la proposition.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("société");

  const description = await page.locator('meta[name="description"]').getAttribute("content");
  expect(description).toBeTruthy();
  expect(description!.length).toBeGreaterThan(70);
});

test("l'accueil décrit l'activité pour les moteurs", async ({ page }) => {
  await page.goto("/");
  const donnees = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}"
  );
  expect(donnees["@type"]).toBe("LegalService");
  expect(donnees.name).toBe("Formalist");
});

test("le plan du site liste les pages et tous les articles", async ({ request }) => {
  const reponse = await request.get("/sitemap.xml");
  expect(reponse.status()).toBe(200);

  const xml = await reponse.text();
  const adresses = xml.match(/<loc>/g) ?? [];
  expect(adresses.length).toBe(12); // 3 pages + 9 articles
  expect(xml).toContain("/blog/capital-social-creation");
});

test("le flux est servi avec le bon type et tous les articles", async ({ request }) => {
  const reponse = await request.get("/flux.xml");
  expect(reponse.status()).toBe(200);
  expect(reponse.headers()["content-type"]).toContain("application/rss+xml");
  expect((await reponse.text()).match(/<item>/g)?.length).toBe(9);
});

test("robots.txt écarte l'application et annonce le plan du site", async ({ request }) => {
  const texte = await (await request.get("/robots.txt")).text();
  expect(texte).toContain("Disallow: /tableau-de-bord");
  expect(texte).toContain("Sitemap:");
});

test("un article porte sa date et son contenu", async ({ page }) => {
  await page.goto("/blog/capital-social-creation");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Capital social");

  const donnees = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}"
  );
  expect(donnees["@type"]).toBe("Article");
  expect(donnees.datePublished).toBe("2026-01-18T00:00:00.000Z");

  // Le contenu rédactionnel d'origine, pas une coquille vide
  await expect(page.getByRole("heading", { name: /minimum légal/i })).toBeVisible();
});

test("l'index du blog liste les articles du plus récent au plus ancien", async ({ page }) => {
  await page.goto("/blog");
  const dates = await page.locator("time").evaluateAll((noeuds) =>
    noeuds.map((n) => n.getAttribute("datetime") ?? "")
  );
  expect(dates.length).toBe(9);
  expect([...dates].sort().reverse()).toEqual(dates);
});

test("un article inexistant renvoie 404, pas une page vide", async ({ request }) => {
  expect((await request.get("/blog/article-qui-n-existe-pas")).status()).toBe(404);
});
