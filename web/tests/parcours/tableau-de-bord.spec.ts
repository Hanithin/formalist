import { test, expect } from "@playwright/test";
import { retirerDossiers } from "./nettoyage";

/**
 * Le tableau de bord et l'espace avocat.
 *
 * Le jeu de données contient deux sociétés, dont une terminée, un document
 * refusé et un avocat assigné.
 */

/*
 * Un seul ouvrier pour ce fichier.
 *
 * `fullyParallel` répartit les essais d'un même fichier entre les ouvriers, et deux
 * de ses blocs sèment des dossiers sur le compte partagé pour éprouver les seuils :
 * l'accueil lu par un autre essai au même instant n'était plus celui du jeu de
 * données - d'où des échecs qui ne se reproduisaient jamais seuls.
 */
test.describe.configure({ mode: "serial" });

test.describe("tableau de bord du client", () => {
  test("annonce en chiffres ce qu'il y a à savoir, et tait les zéros", async ({ page }) => {
    /*
     * Une ligne discrète sous la salutation, non un bloc de cases : ces chiffres ne
     * demandent rien, ils situent. Et un zéro ne s'écrit pas - « 0 échéance » occupe la
     * place d'un chiffre pour annoncer une absence, et l'on relit pour vérifier qu'on
     * n'a rien manqué.
     */
    await page.goto("/tableau-de-bord");

    const indicateurs = page.locator("dl[class*='indicateurs']");
    await expect(indicateurs).toBeVisible();
    await expect(indicateurs.getByText(/formalités? en cours/)).toBeVisible();
    await expect(indicateurs.getByText("0", { exact: true })).toHaveCount(0);
  });

  test("la salutation reprend la phrase du moment, et la date passe à droite", async ({
    page,
  }) => {
    /*
     * Une largeur de bureau, dite plutôt que supposée.
     *
     * La configuration laisse la fenêtre par défaut de Playwright, plus étroite : la
     * date y passe sous le titre, ce qui est la bonne réponse à un écran serré. Le test
     * décrit la mise en page large ; il la demande.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/tableau-de-bord");

    const titre = page.getByRole("heading", { level: 1 });
    await expect(titre).toHaveText(/^(Bonjour|Bonsoir) Camille, .+/);

    // La date n'est plus collée sous le prénom : elle accompagne le bouton, à droite.
    const boiteTitre = await titre.boundingBox();
    /*
     * Le motif est ancré des deux côtés : sans quoi il attrape aussi le conteneur qui
     * porte le titre et la date, dont l'origine est celle du titre - le test mesurait
     * alors la boîte de gauche contre elle-même et échouait sur une mise en page juste.
     */
    const boiteDate = await page
      .getByText(/^(Dimanche|Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi) \d{1,2} \p{L}+ \d{4}$/u)
      .first()
      .boundingBox();
    expect(boiteDate!.x).toBeGreaterThan(boiteTitre!.x + boiteTitre!.width);
  });

  test("dit ce qui requiert l'attention, avec la société concernée", async ({ page }) => {
    await page.goto("/tableau-de-bord");

    await expect(
      page.getByRole("heading", { name: "Ce qui requiert votre attention" })
    ).toBeVisible();
    // Le document refusé du jeu de données doit remonter en premier.
    await expect(page.getByText("Un document à remplacer").first()).toBeVisible();
    await expect(page.getByText(/PARCOURS EN COURS/).first()).toBeVisible();
  });

  test("chaque action mène directement là où il faut agir", async ({ page }) => {
    await page.goto("/tableau-de-bord");
    const lien = page.getByRole("link", { name: "Remplacer" }).first();
    await expect(lien).toHaveAttribute("href", /\/creation\?dossier=\d+/);
  });

  test("le dossier mis en avant ne se répète pas plus bas", async ({ page }) => {
    /*
     * C'était le défaut le plus visible : un même dossier figurait dans le bandeau de
     * reprise, dans les vignettes et dans la liste des attentes. Sur vingt dossiers,
     * l'accueil affichait vingt fois la même phrase sans jamais dire ce qui pressait.
     */
    await page.goto("/tableau-de-bord");

    const reprise = page.getByRole("region", { name: "Reprendre" });
    await expect(reprise).toBeVisible();

    /*
     * La comparaison porte sur le dossier, non sur le nom de la société.
     *
     * Deux dossiers d'une même société sont deux choses distinctes - une modification
     * en cours et un dépôt de comptes qui attend une pièce - et l'un peut légitimement
     * figurer dans les deux sections. Le test comparait les noms : il échouait dès
     * qu'une autre série créait un second dossier pour la même société, ce qui arrive
     * à chaque exécution parallèle.
     */
    const lienReprise = await reprise.getByRole("link").first().getAttribute("href");
    const dossierRepris = lienReprise?.match(/dossier=(\d+)/)?.[1];
    expect(dossierRepris, "le bandeau doit mener à un dossier").toBeTruthy();

    const attention = page.getByRole("region", { name: "Ce qui requiert votre attention" });
    const liens = await attention.getByRole("link").evaluateAll((a) =>
      a.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? "")
    );
    expect(
      liens.filter((h) => h.includes("dossier=" + dossierRepris)),
      "le dossier repris ne se répète pas dans les attentes"
    ).toEqual([]);
  });

  test("les formalités en cours sont des formalités, non des sociétés", async ({ page }) => {
    /*
     * La section s'appelait « Vos sociétés » et montrait des barres d'avancement avec
     * un bouton « Continuer » : ce sont des dossiers. Une société est permanente, une
     * formalité est une opération - la confusion tenait au seul titre.
     */
    await page.goto("/tableau-de-bord");

    await expect(page.getByRole("heading", { name: "Formalités en cours" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Vos sociétés/ })).toHaveCount(0);

    /*
     * La file est courte : au-delà, elle se lit sur sa propre page. Le test figeait ce
     * nombre à trois quand l'écran en montre cinq - `LIGNES_MONTREES` dans Sections.tsx.
     * Ce qui vaut d'être gardé n'est pas le chiffre mais la promesse : la section est un
     * extrait, et elle offre la sortie vers la file entière dès qu'elle en cache.
     */
    const section = page.getByRole("region", { name: "Formalités en cours" });
    const vignettes = section.locator("li");
    const montrees = await vignettes.count();

    const total = Number(
      (await page.getByText(/formalités? en cours/).first().innerText()).match(/\d+/)?.[0] ?? montrees
    );
    expect(montrees, "la file du tableau de bord est un extrait").toBeLessThanOrEqual(total);
    if (montrees < total) {
      await expect(section.getByRole("link", { name: /Voir toute la file/ })).toBeVisible();
    }

    // Chaque vignette distingue le type de formalité du nom de la société.
    await expect(section.getByText(/Création|Modification|Dépôt des comptes|Fermeture/).first()).toBeVisible();
  });

  test("une section d'échéances existe, même sans échéance connue", async ({ page }) => {
    /*
     * Nous n'avons pas de calendrier des obligations : la section reste vide plutôt
     * que d'afficher un exemple qui ne bougerait jamais. Elle doit exister quand même,
     * sans quoi personne ne saura qu'elle se remplira.
     */
    await page.goto("/tableau-de-bord");
    await expect(page.getByRole("heading", { name: "Échéances à venir" })).toBeVisible();
  });

  test("« Voir tout » mène à la liste des formalités", async ({ page, request }) => {
    /*
     * Le lien n'apparaît que s'il reste des formalités à voir : trois vignettes au
     * plus. Le jeu de données en compte parfois exactement trois - le seuil se mesure
     * donc sur les dossiers ouverts, non sur le total, qui inclut les terminés.
     */
    const { dossiers } = (await (await request.get("/api/formalites")).json()) as {
      dossiers: { status: string | null }[];
    };
    const ouverts = dossiers.filter((d) => d.status !== "terminee" && d.status !== "archive");
    test.skip(ouverts.length <= 3, "il faut plus de trois dossiers ouverts");

    await page.goto("/tableau-de-bord");
    const section = page.getByRole("region", { name: "Formalités en cours" });
    await expect(section.getByRole("link", { name: "Voir tout" })).toHaveAttribute(
      "href",
      "/formalites"
    );
  });

  test("aucun lien de l'accueil ne mène nulle part", async ({ page, request }) => {
    // Les vignettes ont pointé sur /formalites/<id>, qui n'existe pas : la page
    // s'affichait bien et « Continuer » rendait un 404.
    await page.goto("/tableau-de-bord");

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
 * Le nom porte le lien : la rangée entière y mène aussi, mais un lien s'atteint au
 * clavier et se clique sans risquer une cellule qui a son propre geste.
 */
async function ouvrirLeDossier(page: import("@playwright/test").Page, societe: string) {
  await page.goto("/avocat");
  await page.getByRole("link", { name: societe, exact: true }).click();
  await page.waitForURL(/\/avocat\/\d+/);
}

test.describe("espace avocat", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  test("liste les dossiers du cabinet", async ({ page }) => {
    await page.goto("/avocat");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Espace avocat");
    // Le nom de la société est un lien : il mène à la page du dossier.
    await expect(page.getByRole("link", { name: "PARCOURS EN COURS", exact: true })).toBeVisible();
  });

  test("un filtre laisse exactement le nombre de dossiers qu'il annonce", async ({ page }) => {
    /*
     * Le compte affiché à côté d'un filtre n'a d'intérêt que s'il correspond à ce que
     * le filtre laisse.
     *
     * La liste est paginée : au-delà d'une page, le compte annonce le total et le
     * tableau n'en montre qu'une tranche. Comparer les deux ne valait donc que tant
     * que le cabinet avait peu de dossiers - le test passait par chance, et tombait dès
     * qu'un parcours en créait quelques-uns de plus.
     */
    const PAR_PAGE = 15;

    for (const filtre of ["tous", "verifier", "encours", "termines", "miens"]) {
      await page.goto("/avocat?filtre=" + filtre);

      const actif = page.locator("nav[aria-label='Filtrer les dossiers'] a[aria-current='page']");
      // Le compte est masqué quand il vaut zéro : un « 0 » à côté d'un filtre invite
      // à cliquer sur du vide. Son absence vaut donc zéro.
      const annonce = Number((await actif.innerText()).match(/(\d+)\s*$/)?.[1] ?? 0);
      const lignes = await page.locator("table tbody tr").count();

      expect(lignes, filtre).toBe(Math.min(annonce, PAR_PAGE));
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

    /*
     * Le dossier s'ouvre désormais sur ce qu'il reste à faire : l'avocat qui vient de
     * le prendre veut savoir par où commencer, non relire une fiche. Le récapitulatif
     * est à un clic.
     */
    /* La page dit d'abord où l'on est ; les tâches se lisent sous les documents. */
    await expect(page.getByText(/Espace avocat : vous relisez ici les documents/)).toBeVisible();
    /*
      Le récapitulatif n'est plus derrière un onglet : il tient dans la colonne du
      dossier, à côté de ce qu'on y fait. On ne clique plus pour le lire.
    */

    /* La tâche du moment s'intitule « Vérifier les informations du dossier » : le
       titre du récapitulatif se vise exactement. */
    await expect(
      page.getByRole("heading", { name: "Informations du dossier", exact: true })
    ).toBeVisible();
    // Le dossier d'essai est vide : tout doit être annoncé comme non renseigné.
    await expect(page.getByText(/Pas encore renseigné par le client/)).toBeVisible();
  });

  test("une note interne s'ajoute et s'affiche", async ({ page }) => {
    await ouvrirLeDossier(page, "PARCOURS EN COURS");

    const texte = "Point de vigilance " + Date.now();
    /*
     * La carte des notes a été resserrée pour la colonne : l'étiquette « Ajouter une
     * note » a cédé la place à un champ qui porte son propre nom, et le bouton dit
     * simplement « Ajouter ».
     */
    /* Les notes tiennent derrière leur bouton, avec les autres sections rangées. */
    await page.getByRole("button", { name: /notes?$/i }).click();
    const volet = page.getByRole("dialog", { name: "Les notes internes" });

    await volet.getByLabel("Ajouter une note interne").fill(texte);
    await volet.getByRole("button", { name: "Ajouter", exact: true }).click();

    await expect(volet.getByText(texte)).toBeVisible();
    await expect(volet.getByText("Maître Dupont").first()).toBeVisible();
  });

  test("une pièce déposée peut être refusée avec son motif", async ({ page }) => {
    await ouvrirLeDossier(page, "PARCOURS EN COURS");

    const boutons = page.getByRole("button", { name: "Demander une autre pièce" });
    if ((await boutons.count()) === 0) test.skip();

    /*
     * Le formulaire de refus a été réécrit : il demande « Que doit redéposer le
     * client ? » plutôt qu'un « motif du refus », et son bouton dit « Demander » -
     * l'avocat demande une pièce, il ne prononce pas un refus.
     */
    await boutons.first().click();
    await page.getByLabel("Que doit redéposer le client ?").fill("Document périmé");
    await page.getByRole("button", { name: "Demander", exact: true }).click();

    await expect(page.getByText("Document périmé").first()).toBeVisible();

    /*
     * L'intervention est tracée : c'est ce qui permet d'instruire un litige. Le journal
     * la dit en français - il affichait sa clé de base, « document_refuse ». Il tient
     * derrière son bouton : on le relit quand quelque chose cloche, non en continu.
     */
    await page.getByRole("button", { name: "Le journal" }).click();
    await expect(
      page
        .getByRole("dialog", { name: "L'historique du dossier" })
        .getByText("Justificatif refusé")
        .first()
    ).toBeVisible();
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

test.describe("ce qui requiert votre attention", () => {
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

    const carte = page.getByRole("region", { name: "Ce qui requiert votre attention" });
    const lignes = carte.locator("a[href*='/creation'], a[href*='/signer'], a[href*='/documents']");

    /*
     * La carte montrait tout : sur une trentaine de dossiers elle devenait une liste
     * à faire défiler, et l'activité récente disparaissait sous elle.
     */
    expect(await lignes.count()).toBe(5);

    const voirTout = carte.getByRole("button", { name: /Voir tout/ });
    await expect(voirTout).toBeVisible();

    await voirTout.click();
    const fenetre = page.getByRole("dialog", { name: "Ce qui requiert votre attention" });
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
    const carte = page.getByRole("region", { name: "Ce qui requiert votre attention" });
    await expect(carte.getByText("Un document à remplacer")).toBeVisible();
  });
});

test.describe("sur écran étroit", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("la colonne devient un tiroir, et la page ne déborde jamais", async ({ page }) => {
    /*
     * La colonne fait 300 pixels fixes, et rien ne la réduisait : sur un téléphone de
     * 390 px, le contenu tenait dans quatre-vingt-dix pixels, où « Bonjour Camille » se
     * brisait en trois lignes et chaque titre en autant de mots.
     */
    await page.goto("/tableau-de-bord");
    await page.getByRole("heading", { level: 1 }).waitFor();

    const colonne = page.locator("aside#colonne-navigation");
    expect((await colonne.boundingBox())?.x, "le tiroir doit être hors de l'écran").toBeLessThan(0);

    const debord = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(debord, "aucun défilement horizontal").toBe(0);
  });

  test("le tiroir s'ouvre, se referme, et ne cache pas son propre bouton", async ({ page }) => {
    await page.goto("/tableau-de-bord");
    const ouvrir = page.getByRole("button", { name: "Ouvrir le menu" });
    await ouvrir.click();

    const colonne = page.locator("aside#colonne-navigation");
    await expect.poll(async () => Math.round((await colonne.boundingBox())?.x ?? -999)).toBe(0);

    /*
     * Le bouton passe à droite quand le tiroir est ouvert : fixé à gauche, il restait
     * dessous, et l'on ne pouvait plus refermer ce qu'on venait d'ouvrir.
     */
    const fermer = page.getByRole("button", { name: "Fermer le menu" }).first();
    const boite = await fermer.boundingBox();
    expect(boite!.x, "le bouton doit sortir de sous le tiroir").toBeGreaterThan(300);

    await page.keyboard.press("Escape");
    await expect.poll(async () => Math.round((await colonne.boundingBox())?.x ?? 0)).toBeLessThan(0);
  });

  test("naviguer referme le tiroir", async ({ page }) => {
    await page.goto("/tableau-de-bord");
    await page.getByRole("button", { name: "Ouvrir le menu" }).click();
    await page.getByRole("link", { name: "Mes documents" }).click();
    await page.waitForURL(/documents/);

    await expect(page.getByRole("button", { name: "Ouvrir le menu" })).toBeVisible();
  });
});
