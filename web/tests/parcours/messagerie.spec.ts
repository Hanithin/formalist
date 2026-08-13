import { test, expect } from "@playwright/test";

/**
 * La messagerie, vue depuis un navigateur.
 *
 * Le jeu de données comprend un avocat assigné et deux messages, dont une
 * demande de document non lue.
 */

/**
 * Le dossier d'exemple, ouvert par son adresse.
 *
 * Rien dans l'adresse n'ouvre plus rien : l'accueil liste les conversations, comme
 * dans la page d'origine. Les tests désignent donc le fil qu'ils veulent.
 */
async function ouvrirLeDossier(page: import("@playwright/test").Page) {
  await page.goto("/messagerie");
  await page.getByRole("button", { name: /PARCOURS EN COURS/ }).first().click();
  await expect(page.getByLabel("Votre message")).toBeVisible();
}

test("l'accueil liste les conversations plutôt que d'en ouvrir une", async ({ page }) => {
  await page.goto("/messagerie");

  await expect(page.getByRole("heading", { name: "Choisissez une conversation" })).toBeVisible();
  // Les deux origines de fil sont là : le dossier suivi, et le support.
  await expect(page.getByRole("button", { name: /PARCOURS EN COURS/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Support Formalist/ }).first()).toBeVisible();
});

test("la liste se cherche par son nom", async ({ page }) => {
  await page.goto("/messagerie");

  const liste = page.getByRole("navigation", { name: "Conversations" });

  await page.getByLabel("Rechercher une conversation").fill("support");
  await expect(liste.getByRole("button", { name: /Support Formalist/ })).toBeVisible();
  await expect(liste.getByRole("button", { name: /PARCOURS EN COURS/ })).toHaveCount(0);

  // Une recherche sans résultat le dit, au lieu de laisser une colonne vide.
  await page.getByLabel("Rechercher une conversation").fill("zzz introuvable");
  await expect(page.getByText(/Aucune conversation ne correspond/)).toBeVisible();
});

test("la conversation s'ouvre avec le champ de saisie prêt", async ({ page }) => {
  await ouvrirLeDossier(page);

  // Le champ est là d'emblée : rien à ouvrir pour écrire.
  await expect(page.getByLabel("Votre message")).toBeVisible();
  await expect(page.getByRole("heading", { name: /PARCOURS EN COURS/ })).toBeVisible();
});

test("les messages existants sont affichés, avec leur intention", async ({ page }) => {
  await ouvrirLeDossier(page);

  await expect(
    page.getByRole("log").getByText("il manque une pièce d'identité lisible")
  ).toBeVisible();
  // Une demande de document ne doit pas ressembler à un bavardage.
  await expect(page.getByText("Demande de pièce")).toBeVisible();
  // Et elle propose le geste attendu, plutôt que de laisser deviner.
  await expect(page.getByRole("button", { name: "Joindre le document" })).toBeVisible();
});

test("un message envoyé apparaît dans le fil", async ({ page }) => {
  await ouvrirLeDossier(page);

  const texte = "Message de parcours " + Date.now();
  await page.getByLabel("Votre message").fill(texte);
  await page.getByRole("button", { name: "Envoyer" }).click();

  // Dans le fil : l'aperçu de la conversation le montre aussi, c'est normal.
  await expect(page.getByRole("log").getByText(texte)).toBeVisible();
});

test("la touche Entrée envoie le message", async ({ page }) => {
  await ouvrirLeDossier(page);

  const texte = "Envoyé au clavier " + Date.now();
  await page.getByLabel("Votre message").fill(texte);
  await page.getByLabel("Votre message").press("Enter");

  await expect(page.getByRole("log").getByText(texte)).toBeVisible();
});

test("répondre à un message le cite dans la bulle", async ({ page }) => {
  await ouvrirLeDossier(page);

  // Le bouton n'apparaît qu'au survol : on le désigne par son nom accessible.
  await page.getByRole("button", { name: /^Répondre à/ }).first().click();
  await expect(page.getByText("Répondre à", { exact: false }).first()).toBeVisible();

  const texte = "Réponse citée " + Date.now();
  await page.getByLabel("Votre message").fill(texte);
  await page.getByRole("button", { name: "Envoyer" }).click();

  const derniere = page.getByRole("log").getByText(texte);
  await expect(derniere).toBeVisible();
  // La citation reprend l'extrait du message auquel on répond.
  await expect(page.getByRole("log").getByText(/il manque une pièce/).last()).toBeVisible();
});

test("le fil porte des séparateurs de journée lisibles", async ({ page }) => {
  await ouvrirLeDossier(page);
  await expect(page.getByRole("log").getByText("Aujourd'hui").first()).toBeVisible();
});

test("ouvrir la conversation marque les messages reçus comme lus", async ({ page }) => {
  await ouvrirLeDossier(page);
  // .first() : un test précédent a répondu à ce message, dont la citation reprend
  // le même texte dans une autre bulle.
  await expect(page.getByRole("log").getByText("il manque une pièce").first()).toBeVisible();

  // La pastille de non-lus disparaît au rechargement suivant.
  await page.goto("/messagerie");
  const liste = page.getByRole("navigation", { name: "Conversations" });
  await expect(liste.getByLabel(/message non lu|messages non lus/)).toHaveCount(0);
});

test("le fil du support propose ses sujets fréquents", async ({ page }) => {
  await page.goto("/messagerie?fil=support");

  await expect(page.getByRole("heading", { name: "Support Formalist", level: 2 })).toBeVisible();
  await expect(page.getByText("Sujets fréquents")).toBeVisible();

  // Un sujet préremplit la saisie : devant un champ vide, on ne sait pas quoi demander.
  await page.getByRole("button", { name: "Question sur ma facturation" }).click();
  await expect(page.getByLabel("Votre message")).toHaveValue(/facturation/);
});

test("un dossier inventé dans l'adresse n'ouvre rien", async ({ page }) => {
  await page.goto("/messagerie?dossier=999999");

  // Ni la conversation demandée, ni celle de quelqu'un d'autre par défaut.
  await expect(page.getByRole("heading", { name: "Choisissez une conversation" })).toBeVisible();
  await expect(page.getByLabel("Votre message")).toHaveCount(0);
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

test.describe("le côté des bulles dit qui parle", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  test("le client à droite et la plateforme à gauche, même vu par l'avocat", async ({ page }) => {
    await page.goto("/messagerie");
    await page.getByRole("button", { name: /PARCOURS EN COURS/ }).first().click();

    const fil = page.getByRole("log");
    const duClient = fil.getByText("Merci, je la dépose aujourd'hui.").first();
    const duSite = fil.getByText("Bonjour, il manque une pièce d'identité lisible.").first();

    const cadreClient = await duClient.boundingBox();
    const cadreSite = await duSite.boundingBox();

    /*
     * Le côté ne suit pas qui regarde.
     *
     * Le second message est de l'avocat, donc de celui qui consulte ici : s'il était
     * placé selon « est-ce moi », il passerait à droite et le fil se lirait à
     * l'envers de ce que voit le client.
     */
    expect(cadreClient!.x).toBeGreaterThan(cadreSite!.x);

    // Le nom n'est affiché que du côté de la plateforme : à droite, c'est le client.
    await expect(fil.getByText("Maître Dupont").first()).toBeVisible();
  });
});

test("les icônes de la saisie sont visibles et alignées sur le champ", async ({ page }) => {
  await ouvrirLeDossier(page);

  const champ = await page.getByLabel("Votre message").boundingBox();

  /*
   * Les deux icônes ont une taille réelle.
   *
   * globals.css habille tout <button> d'un rembourrage de 11px sur 20px : sur un
   * bouton de 34px, il ne restait aucune place et le trombone comme l'avion étaient
   * rendus à zéro. Mesurer le SVG est le seul moyen de s'en apercevoir - le bouton,
   * lui, avait bien sa taille.
   */
  for (const nom of ["Joindre un fichier", "Envoyer"]) {
    const icone = page.getByRole("button", { name: nom }).locator("svg");
    const cadre = await icone.boundingBox();
    expect(cadre, nom).not.toBeNull();
    expect(cadre!.width, nom + " : largeur").toBeGreaterThan(10);
    expect(cadre!.height, nom + " : hauteur").toBeGreaterThan(10);

    // Et elles sont sur la même ligne que le champ, à deux pixels près.
    const centreIcone = cadre!.y + cadre!.height / 2;
    const centreChamp = champ!.y + champ!.height / 2;
    expect(Math.abs(centreIcone - centreChamp), nom + " : alignement").toBeLessThan(2);
  }
});
