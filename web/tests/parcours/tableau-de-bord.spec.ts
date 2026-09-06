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
  test("ouvre sur le dossier qu'on reprend, non sur une ligne de chiffres", async ({ page }) => {
    /*
     * « 63 actions requises · 62 formalités en cours · 150 documents » situait sans rien
     * proposer : on ne clique pas un compteur, et « 63 » est un chiffre qui décourage
     * plus qu'il n'informe. La page ouvre sur ce qu'on reprend, avec son geste.
     */
    await page.goto("/tableau-de-bord");

    await expect(page.locator("dl[class*='indicateurs']")).toHaveCount(0);

    /* L'encadré de tête porte le nom d'une société, sa nature et son geste. */
    const encadre = page.locator("section[aria-labelledby='dossier-en-tete']");
    await expect(encadre).toBeVisible();
    await expect(encadre.getByRole("heading", { level: 2 })).not.toBeEmpty();
    await expect(encadre.getByRole("link").first()).toHaveAttribute("href", /\/(creation|modification|fermeture|depot-des-comptes|auto-entrepreneur|cessation)/);
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

  test("dit ce que le dossier en tête attend, sous le dossier qu'il retient", async ({ page }) => {
    /*
     * Les attentes de tous les dossiers vivaient dans une carte commune, « Ce qui
     * requiert votre attention » : soixante-trois lignes où l'on cherchait celle du
     * dossier qu'on avait en tête. Celles du dossier repris se lisent sous lui ; les
     * autres se comptent sur la ligne de leur dossier, à droite.
     */
    await page.goto("/tableau-de-bord");

    const encadre = page.locator("section[aria-labelledby='dossier-en-tete']");
    await expect(encadre.getByText("À faire")).toBeVisible();
    await expect(encadre.getByRole("listitem").first()).toBeVisible();

    const colonne = page.getByRole("complementary", { name: "Vos autres formalités" });
    await expect(colonne.getByText(/gestes? attendus?/).first()).toBeVisible();
  });

  test("le geste de l'encadré mène directement là où il faut agir", async ({ page }) => {
    /*
     * Chaque attente portait son bouton dans une liste commune. L'encadré n'en porte
     * qu'un - celui du dossier qu'il montre - et c'est le verbe de sa première attente :
     * « Remplacer », « Choisir », « Reprendre », non « Continuer » qui ne dit rien.
     */
    await page.goto("/tableau-de-bord");

    const encadre = page.locator("section[aria-labelledby='dossier-en-tete']");
    const geste = encadre.getByRole("link").first();

    await expect(geste).toHaveAttribute("href", /dossier=\d+/);
    await expect(geste).not.toBeEmpty();
  });

  test("le dossier en tête ne se répète pas dans la colonne", async ({ page }) => {
    /*
     * C'était le défaut le plus visible : un même dossier figurait dans le bandeau de
     * reprise, dans les vignettes et dans la liste des attentes. Sur vingt dossiers,
     * l'accueil affichait vingt fois la même phrase sans jamais dire ce qui pressait.
     */
    await page.goto("/tableau-de-bord");

    const encadre = page.locator("section[aria-labelledby='dossier-en-tete']");
    const lien = await encadre.getByRole("link").first().getAttribute("href");
    const enTete = lien?.match(/dossier=(\d+)/)?.[1];
    expect(enTete, "l'encadré doit mener à un dossier").toBeTruthy();

    const colonne = page.getByRole("complementary", { name: "Vos autres formalités" });
    const liens = await colonne
      .getByRole("link")
      .evaluateAll((a) => a.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""));

    expect(
      liens.filter((h) => h.includes("dossier=" + enTete)),
      "le dossier en tête ne se répète pas dans la colonne"
    ).toEqual([]);
  });

  test("la colonne liste des formalités, non des sociétés", async ({ page }) => {
    /*
     * La section s'appelait « Vos sociétés » et montrait des barres d'avancement avec
     * un bouton « Continuer » : ce sont des dossiers. Une société est permanente, une
     * formalité est une opération - la confusion tenait au seul titre.
     */
    await page.goto("/tableau-de-bord");

    const colonne = page.getByRole("complementary", { name: "Vos autres formalités" });
    await expect(colonne.getByRole("heading", { name: "Vos autres formalités" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Vos sociétés/ })).toHaveCount(0);

    /*
     * La liste est un extrait, et elle offre la sortie vers la file entière : soixante
     * formalités ne se cherchent pas dans une colonne, elles se filtrent sur leur page.
     */
    const montrees = await colonne.locator("li").count();
    expect(montrees, "la colonne est un extrait").toBeGreaterThan(0);
    await expect(colonne.getByRole("link", { name: "Toutes mes formalités" })).toBeVisible();

    /* Chaque ligne distingue la nature de la formalité du nom de la société. */
    await expect(
      colonne.getByText(/^(Création|Modification|Dépôt des comptes|Fermeture)$/).first()
    ).toBeVisible();
  });

  test("les échéances lointaines ne se donnent pas pour proches", async ({ page }) => {
    /*
     * La carte listait « 10 mars 2029 » sous un titre « à venir », à côté d'un dépôt de
     * comptes qui se joue la semaine prochaine. Elle ne montre plus que ce qui tombe
     * sous trente jours, et le titre le dit ; sans rien de proche, elle ne paraît pas.
     */
    await page.goto("/tableau-de-bord");
    await expect(page.getByRole("heading", { name: "Échéances à venir" })).toHaveCount(0);
  });

  test("« Toutes mes formalités » mène à la liste", async ({ page }) => {
    /*
     * La colonne est un extrait : six lignes, puis la sortie. Elle porte le lien même
     * quand elle montre tout - « Toutes mes formalités » n'est pas un « voir plus »,
     * c'est l'écran qui sait les filtrer et les chercher.
     */
    await page.goto("/tableau-de-bord");

    const colonne = page.getByRole("complementary", { name: "Vos autres formalités" });
    await expect(colonne.getByRole("link", { name: "Toutes mes formalités" })).toHaveAttribute(
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

  /*
   * Par la recherche, non par la première page.
   *
   * Le dossier se cliquait dans la liste telle qu'elle s'ouvre : le test dépendait donc
   * du classement et du nombre de dossiers du cabinet. Depuis que ce qui attend le
   * cabinet passe devant ce que le client remplit, un brouillon d'essai n'est plus sur
   * la première page - et il n'a pas à y être. La recherche l'atteint quel que soit son
   * rang, et l'on clique toujours la ligne de la liste.
   */
  await page.getByLabel("Rechercher un dossier").fill(societe);
  await page.getByRole("link", { name: societe, exact: true }).click();
  await page.waitForURL(/\/avocat\/\d+/);
}

test.describe("espace avocat", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  test("liste les dossiers du cabinet", async ({ page }) => {
    await page.goto("/avocat");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Espace avocat");
    /*
     * Le nom de la société est un lien : il mène à la page du dossier.
     *
     * Sur « PARCOURS CONFIE », non sur « PARCOURS EN COURS » : ce dernier est un
     * brouillon que le client remplit encore - `preparer.ts` le sème en « en_cours » -
     * et la liste range désormais ces dossiers-là après ceux qui attendent le cabinet.
     * Il n'est donc plus sur la première page, et il n'a jamais rien eu à y faire.
     */
    await expect(page.getByRole("link", { name: "PARCOURS CONFIE", exact: true })).toBeVisible();
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
    /*
     * La barre nomme la prochaine étape, et garde les suivantes à un clic.
     *
     * Elle ne portait qu'un compte - « 5 étapes à faire » - et il fallait ouvrir la
     * fenêtre pour savoir par où commencer.
     */
    await expect(page.getByText("Prochaine étape")).toBeVisible();
    await expect(page.getByRole("button", { name: /Voir l'étape|suivantes/ })).toBeVisible();
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

  test("une pièce déposée peut être refusée avec son motif", async ({ page }) => {
    await ouvrirLeDossier(page, "PARCOURS EN COURS");

    /*
     * Le geste vit derrière les trois points : « Valider » reste sur la rangée, ce qui
     * demande une autre pièce est le repli. La colonne des gestes se fige ainsi à la
     * même largeur d'une rangée à l'autre, sans rogner le nom des documents.
     */
    const menus = page.getByRole("button", { name: "Autres gestes sur ce document" });
    if ((await menus.count()) === 0) test.skip();
    await menus.first().click();

    const boutons = page.getByRole("button", { name: "Demander une autre pièce" });
    if ((await boutons.count()) === 0) test.skip();

    /*
     * Le formulaire de refus a été réécrit : il demande « Que doit redéposer le
     * client ? » plutôt qu'un « motif du refus », et son bouton dit « Demander » -
     * l'avocat demande une pièce, il ne prononce pas un refus.
     */
    await boutons.first().click();

    /*
     * La demande se fait dans une fenêtre, non sur la ligne de la pièce.
     *
     * Le formulaire s'ouvrait dans la rangée : le champ, deux boutons et une phrase
     * d'explication s'ajoutaient aux gestes déjà là, et le nom du document se réduisait
     * à « J… ». On écrivait ce que le client doit refaire sans plus voir de quelle pièce
     * il s'agit.
     */
    const demande = page.getByRole("dialog", { name: "Demander une autre pièce" });
    await expect(demande).toBeVisible();

    /* Un exemple vaut mieux qu'une description : il évite un troisième aller-retour. */
    await expect(demande.getByText(/Joindre un exemple/)).toBeVisible();

    await demande.getByLabel("Que doit redéposer le client ?").fill("Document périmé");
    await demande.getByRole("button", { name: "Demander", exact: true }).click();

    await expect(page.getByText("Document périmé").first()).toBeVisible();

    /*
     * L'intervention est tracée : c'est ce qui permet d'instruire un litige. Le journal
     * la dit en français - il affichait sa clé de base, « document_refuse ». Il tient
     * dans « Gérer le dossier », en tête de page : on le relit quand quelque chose
     * cloche, non en continu, et il occupait un bouton permanent pour cela.
     */
    await page.getByRole("button", { name: "Gérer le dossier" }).click();
    await page.getByRole("menuitem", { name: "Voir l'historique" }).click();
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

  test("toutes les attentes tiennent dans une fenêtre, depuis la colonne", async ({
    page,
    request,
  }) => {
    /*
     * La carte « Ce qui requiert votre attention » montrait cinq lignes sur soixante et
     * mêlait les attentes de tous les dossiers : on y cherchait celle du dossier qu'on
     * avait en tête. L'accueil refondu les répartit - celles du dossier repris sous lui,
     * les autres comptées sur la ligne de leur dossier - et la fenêtre les reprend
     * toutes, à un clic de la colonne.
     */
    for (let i = 1; i <= 6; i++) {
      const { dossier } = await (await request.post("/api/formalites/brouillon")).json();
      semes.push(dossier);
      await request.put("/api/formalites/brouillon", {
        data: { dossier, modifications: { denomination: "ATTENTE ESSAI " + i, forme: "SASU" } },
      });
    }

    await page.goto("/tableau-de-bord");

    /* La carte n'existe plus sur la page : elle est derrière le lien de la colonne. */
    await expect(
      page.getByRole("region", { name: "Ce qui requiert votre attention" })
    ).toHaveCount(0);

    const colonne = page.getByRole("complementary", { name: "Vos autres formalités" });
    await colonne.getByRole("button", { name: /Voir tout/ }).click();

    const fenetre = page.getByRole("dialog", { name: "Ce qui requiert votre attention" });
    await expect(fenetre).toBeVisible();

    const toutes = fenetre.locator(
      "a[href*='/creation'], a[href*='/signer'], a[href*='/documents']"
    );
    expect(await toutes.count()).toBeGreaterThan(5);

    await page.keyboard.press("Escape");
    await expect(fenetre).not.toBeVisible();
  });

  test("une action bloquante se lit sans ouvrir la fenêtre", async ({ page }) => {
    /*
     * Le jeu de données comprend un document refusé, qui arrête son dossier. Il se lit
     * sous le dossier qu'il retient, ou se compte sur sa ligne dans la colonne - jamais
     * au fond d'une liste de soixante.
     */
    await page.goto("/tableau-de-bord");

    const encadre = page.locator("section[aria-labelledby='dossier-en-tete']");
    const colonne = page.getByRole("complementary", { name: "Vos autres formalités" });

    const dansLEncadre = await encadre.getByText("Un document à remplacer").count();
    const compte = await colonne.getByText(/gestes? attendus?/).count();

    expect(dansLEncadre + compte, "ce qui bloque doit se voir").toBeGreaterThan(0);
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
