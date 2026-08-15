import { test, expect } from "@playwright/test";
import { retirerDossiers } from "./nettoyage";

/**
 * Le tableau de bord et l'espace avocat.
 *
 * Le jeu de données contient deux sociétés, dont une terminée, un document
 * refusé et un avocat assigné.
 */

test.describe("tableau de bord du client", () => {
  test("accueille par son prénom, avec une phrase du moment", async ({ page }) => {
    await page.goto("/tableau-de-bord");
    const titre = page.getByRole("heading", { level: 1 });

    await expect(titre).toContainText("Camille");
    /*
     * La page d'origine ne se contentait pas de « Bonjour Prénom » : buildGreeting()
     * ajoutait une phrase suivant le moment de la journée. Elle se reconnaît à sa
     * virgule et à ce qui suit.
     */
    await expect(titre).toHaveText(/^(Bonjour|Bonsoir) Camille, .+/);
  });

  test("dit ce qu'on attend, avec la société concernée", async ({ page }) => {
    await page.goto("/tableau-de-bord");

    await expect(page.getByRole("heading", { name: "Ce qu'on attend de vous" })).toBeVisible();
    // Le document refusé du jeu de données doit remonter en premier.
    await expect(page.getByText("Un document à remplacer").first()).toBeVisible();
    await expect(page.getByText(/PARCOURS EN COURS/).first()).toBeVisible();
  });

  test("chaque action mène directement là où il faut agir", async ({ page }) => {
    await page.goto("/tableau-de-bord");
    const lien = page.getByRole("link", { name: "Remplacer" }).first();
    await expect(lien).toHaveAttribute("href", /\/creation\?dossier=\d+/);
  });

  test("les trois sociétés les plus récentes sont mises en avant", async ({ page, request }) => {
    // L'accueil ne liste pas tous les dossiers : il montre les trois derniers et
    // renvoie au reste. Sur trente-cinq dossiers, tout lister ferait de l'accueil
    // une deuxième page « Mes formalités ».
    await page.goto("/tableau-de-bord");
    await expect(page.getByRole("heading", { name: /Vos sociétés|Votre société/ })).toBeVisible();

    // Trois vignettes, pas une de plus, et le bouton annonce le total.
    const vignettes = page.getByRole("region", { name: "Vos sociétés" });
    await expect(vignettes.getByRole("link", { name: /Continuer|Consulter/ })).toHaveCount(3);

    const { dossiers } = await (await request.get("/api/formalites")).json();
    await expect(page.getByRole("button", { name: /Voir toutes/ })).toContainText(
      String(dossiers.length)
    );
  });

  test("« Voir toutes » ouvre la fenêtre et sa recherche", async ({ page }) => {
    await page.goto("/tableau-de-bord");
    await page.getByRole("button", { name: /Voir toutes/ }).click();

    const fenetre = page.getByRole("dialog", { name: "Toutes vos sociétés" });
    await expect(fenetre).toBeVisible();

    await fenetre.getByLabel("Rechercher une société").fill("PARCOURS TERMINEE");
    await expect(fenetre.getByText("PARCOURS TERMINEE")).toBeVisible();
    await expect(fenetre.getByText("PARCOURS SIGNATURE")).toHaveCount(0);

    // Une recherche sans résultat le dit, plutôt que de laisser une liste vide.
    await fenetre.getByLabel("Rechercher une société").fill("zzzz introuvable");
    await expect(fenetre.getByText(/Aucune société ne correspond/)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(fenetre).not.toBeVisible();
  });

  test("aucun lien de l'accueil ne mène nulle part", async ({ page, request }) => {
    // Les vignettes ont pointé sur /formalites/<id>, qui n'existe pas : la page
    // s'affichait bien et « Continuer » rendait un 404.
    await page.goto("/tableau-de-bord");
    await page.getByRole("button", { name: /Voir toutes/ }).click();

    const adresses = await page.getByRole("link").evaluateAll((liens) =>
      liens
        .map((l) => (l as HTMLAnchorElement).getAttribute("href") ?? "")
        .filter((h) => h.startsWith("/"))
    );

    for (const adresse of [...new Set(adresses)]) {
      expect(
        (await request.get(adresse)).status(),
        adresse + " ne répond pas"
      ).toBeLessThan(400);
    }
  });
});

/**
 * Ouvre la page complète d'un dossier depuis la liste.
 *
 * Le clic sur le nom ouvre désormais un panneau de détail plutôt que de quitter la
 * liste : la page complète se rejoint depuis ce panneau.
 */
async function ouvrirLeDossier(page: import("@playwright/test").Page, societe: string) {
  await page.goto("/avocat");
  await page.getByRole("button", { name: societe, exact: true }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Ouvrir le dossier" }).click();
  await page.waitForURL(/\/avocat\/\d+/);
}

test.describe("espace avocat", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  test("liste les dossiers du cabinet", async ({ page }) => {
    await page.goto("/avocat");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Espace avocat");
    // Le nom de la société est un bouton depuis qu'il ouvre le panneau de détail.
    await expect(page.getByRole("button", { name: "PARCOURS EN COURS", exact: true })).toBeVisible();
  });

  test("un filtre laisse exactement le nombre de dossiers qu'il annonce", async ({ page }) => {
    // Le compte affiché à côté d'un filtre n'a d'intérêt que s'il correspond à ce
    // que le filtre laisse.
    for (const filtre of ["tous", "verifier", "encours", "termines", "miens"]) {
      await page.goto("/avocat?filtre=" + filtre);

      const actif = page.locator("nav[aria-label='Filtrer les dossiers'] a[aria-current='page']");
      // Le compte est masqué quand il vaut zéro : un « 0 » à côté d'un filtre invite
      // à cliquer sur du vide. Son absence vaut donc zéro.
      const annonce = Number((await actif.innerText()).match(/(\d+)\s*$/)?.[1] ?? 0);
      const lignes = await page.locator("table tbody tr").count();

      expect(lignes, filtre).toBe(annonce);
    }
  });

  test("signale les dossiers assignés et les pièces à vérifier", async ({ page }) => {
    await page.goto("/avocat");
    // Deux dossiers sont assignés à cet avocat dans le jeu de données.
    await expect(page.getByText("Assigné à vous").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /À vérifier/ })).toBeVisible();
  });

  test("le dossier montre les informations et ce qui manque encore", async ({ page }) => {
    await ouvrirLeDossier(page, "PARCOURS EN COURS");

    await expect(page.getByRole("heading", { name: "Informations du dossier" })).toBeVisible();
    // Le dossier d'essai est vide : tout doit être annoncé comme non renseigné.
    await expect(page.getByText(/Pas encore renseigné par le client/)).toBeVisible();
  });

  test("une note interne s'ajoute et s'affiche", async ({ page }) => {
    await ouvrirLeDossier(page, "PARCOURS EN COURS");
    await page.getByRole("link", { name: "Notes internes" }).click();
    await page.waitForURL(/onglet=notes/);

    const texte = "Point de vigilance " + Date.now();
    await page.getByLabel("Ajouter une note").fill(texte);
    await page.getByRole("button", { name: "Ajouter la note" }).click();

    await expect(page.getByText(texte)).toBeVisible();
    await expect(page.getByText("Maître Dupont").first()).toBeVisible();
  });

  test("une pièce déposée peut être refusée avec son motif", async ({ page }) => {
    await ouvrirLeDossier(page, "PARCOURS EN COURS");
    await page.getByRole("link", { name: /^Pièces/ }).click();
    await page.waitForURL(/onglet=pieces/);

    const boutons = page.getByRole("button", { name: "Demander une autre pièce" });
    if ((await boutons.count()) === 0) test.skip();

    await boutons.first().click();
    await page.getByLabel("Motif du refus").fill("Document périmé");
    await page.getByRole("button", { name: "Refuser" }).click();

    await expect(page.getByText("Motif : Document périmé")).toBeVisible();

    // L'intervention est tracée : c'est ce qui permet d'instruire un litige.
    await page.getByRole("link", { name: "Journal" }).click();
    await page.waitForURL(/onglet=journal/);
    await expect(page.getByText("document_refuse").first()).toBeVisible();
  });
});

test.describe("cloisonnement de l'espace avocat", () => {
  test("un client n'y entre pas", async ({ page }) => {
    // La session du client est celle par défaut de la série. On rend un 404, non
    // un refus explicite : la réponse ne renseigne pas sur ce qui existe.
    const reponse = await page.goto("/avocat");
    expect(reponse?.status()).toBe(404);
  });

  test("un client n'ouvre pas non plus un dossier du cabinet", async ({ page }) => {
    const reponse = await page.goto("/avocat/1");
    expect(reponse?.status()).toBe(404);
  });

  test("un client ne peut pas écrire de note interne", async ({ request }) => {
    const reponse = await request.post("/api/avocat/notes", {
      data: { dossier: 1, contenu: "intrusion" },
    });
    expect(reponse.status()).toBe(403);
  });

  test("un client ne peut pas valider une pièce", async ({ request }) => {
    const reponse = await request.put("/api/avocat/documents", {
      data: { document: 1, decision: "valider" },
    });
    expect(reponse.status()).toBe(403);
  });

  test("sans session, rien n'est accessible", async ({ browser }) => {
    const anonyme = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    expect((await anonyme.request.post("/api/avocat/notes", { data: {} })).status()).toBe(401);
    await anonyme.close();
  });
});

test.describe("la fenêtre ne défile pas", () => {
  /*
   * C'est la colonne de contenu qui défile, comme dans les pages d'origine où
   * « .main » portait overflow-y: auto dans un corps à hauteur d'écran. La coquille
   * se contentait d'un min-height : le document grandissait, la page défilait de
   * quelques dizaines de pixels pour n'exposer qu'un bas de marge, et la barre
   * latérale glissait avec.
   */
  for (const chemin of ["/tableau-de-bord", "/formalites", "/documents", "/messagerie"]) {
    test("sur " + chemin, async ({ page }) => {
      await page.goto(chemin);
      await page.waitForLoadState("networkidle");

      const mesures = await page.evaluate(() => ({
        document: document.documentElement.scrollHeight,
        fenetre: window.innerHeight,
      }));

      // Une tolérance d'un pixel : les arrondis de mise en page en valent bien un.
      expect(mesures.document, chemin).toBeLessThanOrEqual(mesures.fenetre + 1);
    });
  }
});

test.describe("la colonne suit la page ouverte", () => {
  /** Les dossiers ouverts par ce bloc, retirés après la série. */
  const ouverts: number[] = [];

  test.afterAll(async () => {
    if (ouverts.length > 0) await retirerDossiers(ouverts);
  });

  /*
   * Une disposition partagée n'est pas réexécutée quand on passe d'une de ses pages à
   * une autre. L'entrée active se lisait dans un en-tête posé par le proxy : elle
   * restait donc celle de la première page ouverte, et « Mes formalités » demeurait
   * surligné après un clic sur « Tableau de bord ».
   */
  test("l'entrée surlignée change à la navigation", async ({ page }) => {
    await page.goto("/formalites");
    const colonne = page.getByRole("navigation", { name: "Navigation principale" });

    await expect(colonne.getByRole("link", { name: /Mes formalités/ })).toHaveAttribute(
      "aria-current",
      "page"
    );

    await colonne.getByRole("link", { name: "Tableau de bord" }).click();
    await page.waitForURL(/\/tableau-de-bord/);

    await expect(colonne.getByRole("link", { name: "Tableau de bord" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(colonne.getByRole("link", { name: /Mes formalités/ })).not.toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  test("le compteur de la colonne suit ce qui change", async ({ page, request }) => {
    /*
     * Les compteurs restaient ceux du chargement initial : la colonne annonçait trente
     * et un dossiers en cours quand la page en montrait vingt-huit.
     *
     * Le test crée son propre dossier plutôt que de comparer deux lectures : sous
     * exécution parallèle, une autre série peut en semer entre les deux, et la
     * comparaison échouerait sur un mécanisme qui fonctionne.
     */
    const compteur = () =>
      page
        .getByRole("navigation", { name: "Navigation principale" })
        .getByRole("link", { name: /Mes formalités/ });

    await page.goto("/tableau-de-bord");
    const avant = Number((await compteur().innerText()).match(/(\d+)/)?.[1] ?? 0);

    const { dossier } = await (await request.post("/api/formalites/brouillon")).json();
    ouverts.push(dossier);

    await page
      .getByRole("navigation", { name: "Navigation principale" })
      .getByRole("link", { name: /Mes formalités/ })
      .click();
    await page.waitForURL(/\/formalites/);

    await expect
      .poll(async () => Number((await compteur().innerText()).match(/(\d+)/)?.[1] ?? 0))
      .toBeGreaterThan(avant);
  });
});

test.describe("ce qu'on attend de vous", () => {
  /** Les dossiers semés pour dépasser le seuil, retirés après la série. */
  const semes: number[] = [];

  test.afterAll(async () => {
    if (semes.length > 0) await retirerDossiers(semes);
  });

  test("cinq actions au plus, le reste dans une fenêtre", async ({ page, request }) => {
    /*
     * Le jeu de données ne compte que quatre dossiers, donc moins de cinq actions.
     * En semer quelques-uns rend le seuil observable sans dépendre de ce que les
     * autres séries ont créé.
     */
    for (let i = 1; i <= 6; i++) {
      const { dossier } = await (await request.post("/api/formalites/brouillon")).json();
      semes.push(dossier);
      await request.put("/api/formalites/brouillon", {
        data: { dossier, modifications: { denomination: "ATTENTE ESSAI " + i, forme: "SASU" } },
      });
    }

    await page.goto("/tableau-de-bord");

    const carte = page.getByRole("region", { name: "Ce qu'on attend de vous" });
    const lignes = carte.locator("a[href*='/creation'], a[href*='/signer'], a[href*='/documents']");

    /*
     * La carte montrait tout : sur une trentaine de dossiers elle devenait une liste
     * à faire défiler, et l'activité récente disparaissait sous elle.
     */
    expect(await lignes.count()).toBe(5);

    const voirTout = carte.getByRole("button", { name: /Voir tout/ });
    await expect(voirTout).toBeVisible();

    await voirTout.click();
    const fenetre = page.getByRole("dialog", { name: "Tout ce qu'on attend de vous" });
    await expect(fenetre).toBeVisible();

    // Elle en montre plus que la carte.
    const toutes = fenetre.locator("a[href*='/creation'], a[href*='/signer'], a[href*='/documents']");
    expect(await toutes.count()).toBeGreaterThan(5);

    await page.keyboard.press("Escape");
    await expect(fenetre).not.toBeVisible();
  });

  test("une action bloquante n'est jamais cachée derrière la fenêtre", async ({ page }) => {
    await page.goto("/tableau-de-bord");

    // Le jeu de données comprend un document refusé, qui arrête son dossier : il doit
    // figurer parmi les cinq, pas au fond de la liste.
    const carte = page.getByRole("region", { name: "Ce qu'on attend de vous" });
    await expect(carte.getByText("Un document à remplacer")).toBeVisible();
  });
});
