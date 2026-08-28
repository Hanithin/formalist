import { test, expect } from "@playwright/test";

/**
 * Les trois premières pages de l'application portées, vues depuis un navigateur.
 *
 * Le compte d'essai est créé par tests/parcours/preparer.ts, exécuté une fois
 * avant la série.
 */

const COMPTE = { email: "parcours@exemple.test", motDePasse: "MotDePasseParcours2026!" };

async function seConnecter(page: import("@playwright/test").Page) {
  await page.goto("/connexion");
  // Le champ s'appelle « Email » sur la page de connexion, « Adresse email »
  // sur l'inscription : ce sont deux formulaires distincts.
  await page.getByLabel("Email", { exact: true }).fill(COMPTE.email);
  await page.getByLabel("Mot de passe").fill(COMPTE.motDePasse);
  await page.getByRole("button", { name: /se connecter/i }).click();
  await page.waitForURL(/tableau-de-bord|aide|equipe|parametres/);
}

// La connexion se vérifie sans session préalable : c'est elle qu'on teste.
test.describe("connexion", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("la connexion mène au tableau de bord", async ({ page }) => {
    await seConnecter(page);
    await expect(page).toHaveURL(/\/tableau-de-bord/);
  });

  test("un mot de passe faux ne dit pas si le compte existe", async ({ page }) => {
    await page.goto("/connexion");
    await page.getByLabel("Email", { exact: true }).fill(COMPTE.email);
    await page.getByLabel("Mot de passe").fill("mauvais-mot-de-passe");
    await page.getByRole("button", { name: /se connecter/i }).click();

    // Next place un signaleur de navigation qui porte aussi role="alert" :
    // on vise le message du formulaire, pas lui.
    await expect(page.locator("form p[role=alert]")).toContainText(
      "Email ou mot de passe incorrect"
    );
    // Le même message qu'avec une adresse inconnue : voir la route de connexion.
  });
});

test.describe("parcours connecté", () => {
  test("la colonne de navigation est la même sur les trois pages", async ({ page }) => {
    const entrees: string[][] = [];
    for (const chemin of ["/aide", "/parametres", "/equipe"]) {
      await page.goto(chemin);
      const textes = await page
        .getByRole("navigation", { name: "Navigation principale" })
        .getByRole("link")
        .allInnerTexts();

      /*
       * Sans les nombres.
       *
       * « Mes formalités / 52 en cours » porte un compteur que les autres essais font
       * bouger pendant qu'on lit les trois pages : la comparaison échouait sur un
       * dossier créé entre deux chargements, ce qui ne dit rien de la colonne.
       */
      entrees.push(textes.map((t) => t.replace(/\d+/g, "").trim()));
    }

    // C'est tout l'objet de l'étape : une seule colonne, pas vingt et une copies.
    expect(entrees[1]).toEqual(entrees[0]);
    expect(entrees[2]).toEqual(entrees[0]);
  });

  /*
   * Le bloc « Vous travaillez sur » a disparu, et son essai avec lui.
   *
   * Il nommait le dernier dossier ouvert, quel que soit l'écran : on lisait
   * « GREMLINS COMMUNICATION » en marge d'un dossier STERLING PEAK, et il fallait se
   * rappeler que ce n'était pas celui qu'on avait sous les yeux. Chaque écran dit de
   * quoi il parle ; la marge n'a pas à en désigner un autre.
   */

  test("les fondus ne marquent que le côté où il reste à voir", async ({ page }) => {
    /*
     * Posés en permanence, ils donneraient à une colonne entière l'air d'être coupée
     * et estomperaient la première entrée alors qu'elle est complète.
     */
    await page.setViewportSize({ width: 1280, height: 700 });
    await page.goto("/aide");

    const zone = page.getByRole("navigation", { name: "Navigation principale" });
    const enveloppe = zone.locator("..");
    const bords = () =>
      enveloppe.evaluate((e) => ({
        haut: e.hasAttribute("data-avant"),
        bas: e.hasAttribute("data-apres"),
      }));

    expect(await bords()).toEqual({ haut: false, bas: true });

    await zone.evaluate((n) => n.scrollTo({ top: n.scrollHeight }));
    await expect.poll(bords).toEqual({ haut: true, bas: false });
  });

  test("la page courante est marquée dans la navigation", async ({ page }) => {
    await page.goto("/aide");
    // « Aide & FAQ » est devenu « Centre d'aide » quand la colonne est passée en rubriques.
    await expect(page.locator('[aria-current="page"]')).toHaveText("Centre d'aide");
  });

  test("un client ne voit ni espace avocat ni administration", async ({ page }) => {
    await page.goto("/aide");
    const liens = await page
      .getByRole("navigation", { name: "Navigation principale" })
      .getByRole("link")
      .allInnerTexts();
    expect(liens).not.toContain("Espace avocat");
    expect(liens).not.toContain("Administration");
  });

  test("l'aide filtre les questions", async ({ page }) => {
    await page.goto("/aide");
    await expect(page.getByRole("status")).toContainText("10 questions");

    await page.getByLabel("Rechercher une question").fill("capital");
    await expect(page.getByRole("status")).not.toContainText("10 questions");

    // Sans accent doit trouver avec accent
    await page.getByLabel("Rechercher une question").fill("societe");
    await expect(page.getByRole("status")).not.toContainText("Aucune question");
  });

  test("les paramètres affichent le compte connecté", async ({ page }) => {
    await page.goto("/parametres");
    await expect(page.getByLabel("Adresse email")).toHaveValue(COMPTE.email);
  });

  test("l'équipe est créée au premier accès, avec la personne dedans", async ({ page }) => {
    await page.goto("/equipe");
    await expect(page.getByRole("heading", { level: 2, name: /membre/ })).toContainText("1 membre");
    // La pastille du membre, pas les textes d'explication de la page.
    await expect(page.getByText("Vous", { exact: true })).toBeVisible();
  });

});

/**
 * La déconnexion révoque la session en base, pas seulement le cookie. Ce test
 * ouvre donc la sienne : avec la session partagée par la série, il déconnectait
 * tous les autres tests qui tournaient en même temps.
 */
test.describe("déconnexion", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("la déconnexion referme l'accès", async ({ page }) => {
    await seConnecter(page);

    await page.goto("/parametres");
    // La colonne de navigation en porte un aussi, sous forme d'icône : on vise
    // celui de la page.
    await page.locator("main").getByRole("button", { name: /se déconnecter/i }).click();
    await page.waitForURL(/\/connexion/);

    await page.goto("/equipe");
    await expect(page).toHaveURL(/\/connexion/);
  });
});

test("les listes affichées en ligne le restent", async ({ page }) => {
  /*
   * globals.css met toute liste de `main` en colonne. Une classe de module qui
   * redéclare `display: flex` sans direction n'emporte que `display` : la colonne
   * passe, et la liste se dresse. Trois listes en ont souffert, dont la frise du
   * tableau de bord signalée en production.
   */
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/consultations");

  const ordonnees = await page.evaluate(() =>
    [...document.querySelectorAll("[class*='hFacts'] > li")].map((e) =>
      Math.round(e.getBoundingClientRect().y)
    )
  );

  expect(ordonnees.length).toBeGreaterThan(1);
  expect(Math.max(...ordonnees) - Math.min(...ordonnees)).toBeLessThan(4);
});
