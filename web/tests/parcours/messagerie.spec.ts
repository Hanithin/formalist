import { test, expect } from "@playwright/test";

/**
 * La messagerie, vue depuis un navigateur.
 *
 * Le jeu de données comprend un avocat assigné et deux messages, dont une
 * demande de document non lue.
 */

test("la conversation s'ouvre avec le champ de saisie prêt", async ({ page }) => {
  await page.goto("/messagerie");

  // Le champ est là d'emblée : rien à ouvrir pour écrire.
  await expect(page.getByLabel("Votre message")).toBeVisible();
  await expect(page.getByText("PARCOURS EN COURS")).toBeVisible();
});

test("les messages existants sont affichés, avec leur intention", async ({ page }) => {
  await page.goto("/messagerie");

  await expect(page.getByRole("log").getByText("il manque une pièce d'identité lisible")).toBeVisible();
  // Une demande de document ne doit pas ressembler à un bavardage
  await expect(page.getByText("Document demandé")).toBeVisible();
});

test("un message envoyé apparaît dans le fil", async ({ page }) => {
  await page.goto("/messagerie");

  const texte = "Message de parcours " + Date.now();
  await page.getByLabel("Votre message").fill(texte);
  await page.getByRole("button", { name: "Envoyer" }).click();

  // Dans le fil : l'aperçu de la conversation le montre aussi, c'est normal.
  await expect(page.getByRole("log").getByText(texte)).toBeVisible();
});

test("la touche Entrée envoie le message", async ({ page }) => {
  await page.goto("/messagerie");

  const texte = "Envoyé au clavier " + Date.now();
  await page.getByLabel("Votre message").fill(texte);
  await page.getByLabel("Votre message").press("Enter");

  await expect(page.getByRole("log").getByText(texte)).toBeVisible();
});

test("le fil porte des séparateurs de journée lisibles", async ({ page }) => {
  await page.goto("/messagerie");
  await expect(page.getByRole("log").getByText("Aujourd'hui").first()).toBeVisible();
});

test("ouvrir la conversation marque les messages reçus comme lus", async ({ page }) => {
  await page.goto("/messagerie");
  await expect(page.getByRole("log").getByText("il manque une pièce")).toBeVisible();

  // La pastille de non-lus disparaît au rechargement suivant
  await page.reload();
  await expect(page.locator('nav[aria-label="Conversations"] button[aria-current] span').last()).not.toHaveText("1");
});

test("un dossier inventé dans l'adresse n'ouvre rien d'autre", async ({ page }) => {
  await page.goto("/messagerie?dossier=999999");
  // Retombe sur la première conversation visible, pas sur celle demandée
  await expect(page.getByText("PARCOURS EN COURS")).toBeVisible();
});

test.describe("accès aux messages", () => {
  test("sans session, les messages sont refusés", async ({ browser }) => {
    const anonyme = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const reponse = await anonyme.request.get("/api/messages?dossier=1");
    expect(reponse.status()).toBe(401);
    await anonyme.close();
  });

  test("un dossier auquel on n'a pas droit est refusé", async ({ request }) => {
    const reponse = await request.get("/api/messages?dossier=999999");
    expect(reponse.status()).toBe(403);
  });

  test("un identifiant qui n'est pas un nombre est refusé avant toute lecture", async ({
    request,
  }) => {
    const reponse = await request.get("/api/messages?dossier=abc");
    expect(reponse.status()).toBe(400);
  });

  test("un message vide n'est pas enregistré", async ({ request }) => {
    const conversations = await request.get("/api/messages?dossier=1");
    void conversations;

    const reponse = await request.post("/api/messages", {
      data: { dossier: 1, contenu: "   " },
    });
    expect([400, 403]).toContain(reponse.status());
  });
});

test.describe("bulle de messagerie", () => {
  test("elle est présente sur les pages de l'application", async ({ page }) => {
    for (const chemin of ["/documents", "/contrats", "/equipe", "/aide"]) {
      await page.goto(chemin);
      await expect(page.getByRole("button", { name: /Messages/ })).toBeVisible();
    }
  });

  test("elle n'apparaît pas sur la messagerie, qui est déjà la messagerie", async ({ page }) => {
    await page.goto("/messagerie");
    await expect(page.getByRole("button", { name: /^Messages/ })).toHaveCount(0);
  });

  test("elle ouvre la liste des conversations", async ({ page }) => {
    await page.goto("/documents");
    await page.getByRole("button", { name: /Messages/ }).click();

    const panneau = page.getByRole("dialog", { name: "Messages" });
    await expect(panneau).toBeVisible();
    await expect(panneau.getByText("PARCOURS EN COURS")).toBeVisible();
  });

  test("elle ne s'affiche pas pour un visiteur non connecté", async ({ browser }) => {
    const anonyme = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await anonyme.newPage();
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Messages/ })).toHaveCount(0);
    await anonyme.close();
  });
});
