import { test, expect } from "@playwright/test";
import { retirerDossiers } from "./nettoyage";

/**
 * Les trois listes portées : formalités, documents, contrats.
 *
 * Le jeu de données est créé par preparer.ts : deux dossiers dont un terminé,
 * deux documents dont un rejeté, deux contrats à des états différents.
 */

// La session est ouverte par preparer.ts et reprise par la configuration.

test.describe("formalités", () => {
  /**
   * La liste pagine par six et se trie du plus récemment modifié au plus ancien : un
   * dossier d'exemple n'est donc pas forcément sur la première page. Les tests le
   * cherchent, comme le ferait quelqu'un devant l'écran.
   */
  async function chercher(page: import("@playwright/test").Page, nom: string) {
    await page.getByLabel("Rechercher une formalité").fill(nom);
  }

  /**
   * La liste seule, non la page entière.
   *
   * La colonne de gauche nomme le dossier sur lequel on travaille : chercher un nom
   * dans toute la page le trouvait là, hors de la liste, et l'absence attendue
   * échouait selon le dossier que les autres essais avaient laissé en cours.
   */
  function liste(page: import("@playwright/test").Page) {
    return page.getByRole("list", { name: "Formalités" });
  }

  /** Les dossiers semés pour la pagination, retirés une fois la série passée. */
  const pagines: number[] = [];

  test.afterAll(async () => {
    if (pagines.length > 0) await retirerDossiers(pagines);
  });

  test("la liste montre les dossiers avec leur étape", async ({ page }) => {
    await page.goto("/formalites");
    await chercher(page, "PARCOURS EN COURS");

    const carte = page.locator("li", { hasText: "PARCOURS EN COURS" }).last();
    await expect(carte.getByText("En attente de signature")).toBeVisible();
    await expect(carte.getByText("SASU")).toBeVisible();
    /*
     * La carte dit ce qu'on attend d'elle, non un pourcentage.
     *
     * Elle a longtemps écrit « 20% complété » : le remplissage d'un formulaire, qui ne
     * disait ni ce qui bloquait ni ce qu'il fallait faire - et qui se contredisait avec
     * le geste, un dossier à cent pour cent proposant encore de le reprendre. La jauge
     * reste, muette ; c'est la ligne d'étape qui parle.
     */
    await expect(carte.getByText(/% complété/)).toHaveCount(0);
    await expect(carte.getByRole("img", { name: /^Avancement : \d+ %$/ })).toBeVisible();
  });

  /*
   * Les trois compteurs de tête ont été retirés.
   *
   * « En cours 23 - 100 % de vos formalités », « Total 23 - 23 formalités au total » :
   * trois cartes pour dire deux fois le même nombre, que les filtres annoncent déjà
   * chacun à côté de son nom. C'est donc le décompte des filtres qu'on vérifie, juste
   * en dessous.
   */

  test("chaque filtre annonce son décompte, et aucun n'est offert à vide", async ({ page }) => {
    /*
     * Un filtre sans formalité ne s'affiche pas - voir `filtresUtiles` : on n'offre pas
     * un filtre qui ne rendrait rien. Le test énumérait les quatre et échouait donc dès
     * que le compte n'avait aucune formalité terminée, ce qui est le cas ordinaire.
     */
    await page.goto("/formalites");
    const filtres = page.getByRole("navigation", { name: "Filtrer les formalités" });

    await expect(filtres.getByRole("link", { name: /Toutes/ })).toBeVisible();

    const offerts = await filtres.getByRole("link").allInnerTexts();
    expect(offerts.length, "au moins « Tous »").toBeGreaterThan(0);

    for (const libelle of offerts) {
      const compte = libelle.trim().match(/(\d+)$/);
      expect(compte, "décompte sur « " + libelle.trim() + " »").not.toBeNull();
      expect(Number(compte![1]), "« " + libelle.trim() + " » ne serait pas offert à zéro")
        .toBeGreaterThan(0);
    }
  });

  /**
   * L'ordre répond à « lequel a besoin de moi », non à « qu'ai-je touché en dernier ».
   *
   * La liste se rangeait par date de modification : le dossier bloqué depuis trois
   * semaines se retrouvait derrière un brouillon ouvert la veille, et rien à l'écran
   * n'annonçait cet ordre.
   */
  test("ce qui bloque passe devant, quelle que soit la date", async ({ page }) => {
    await page.goto("/formalites");

    const etapes = await liste(page).getByRole("listitem").allInnerTexts();
    expect(etapes.length, "des dossiers dans le jeu d'essai").toBeGreaterThan(1);

    /*
     * Un dossier terminé n'a plus rien à demander : rien ne le suit.
     *
     * On ne compare pas à la dernière position - le compte d'essai en porte parfois
     * deux, et le premier des deux n'est alors pas le dernier de la liste.
     */
    const premierTermine = etapes.findIndex((c) => c.includes("Société immatriculée"));
    if (premierTermine !== -1) {
      const suivants = etapes.slice(premierTermine + 1);
      expect(
        suivants.filter((c) => !c.includes("Société immatriculée")),
        "un dossier vivant rangé après un dossier terminé"
      ).toEqual([]);
    }

    // Et chaque carte dit ce qu'on attend d'elle, plutôt qu'un pourcentage.
    for (const carte of etapes) {
      expect(carte, "une carte sans étape : " + carte.replace(/\n/g, " | ")).toMatch(
        /Compléter|signature|Choisir|Déposer|Déposé|révision|immatriculée|à déposer|Reprendre/
      );
    }
  });

  test("le filtre restreint la liste et se lit dans l'adresse", async ({ page }) => {
    await page.goto("/formalites");
    await page
      .getByRole("navigation", { name: "Filtrer les formalités" })
      .getByRole("link", { name: /Terminée/ })
      .click();

    await expect(page).toHaveURL(/filtre=terminee/);
    await expect(liste(page).getByText("PARCOURS TERMINEE").first()).toBeVisible();
    await expect(liste(page).getByText("PARCOURS EN COURS")).toHaveCount(0);
  });

  /**
   * Le brouillon est un état, donc une pastille.
   *
   * La ligne de tête annonçait « 6 brouillons » sans qu'on puisse s'y rendre : on
   * lisait un compte qui ne menait nulle part. La rangée porte maintenant chaque état
   * qu'elle nomme, et « Transmises » sépare ce qui est parti de ce qu'il reste à
   * écrire - deux choses que « En cours » confondait dans un seul chiffre.
   */
  test("les brouillons ont leur pastille, distincte de ce qui est parti", async ({
    page,
    request,
  }) => {
    /*
     * Le brouillon est ouvert ici, non emprunté au jeu d'essai.
     *
     * La pastille disparaît quand son compte tombe à zéro - c'est `filtresUtiles` qui
     * le veut, un filtre qui ne rendrait rien ne s'offre pas. Le test s'appuyait donc
     * sur les brouillons que d'autres séries laissaient derrière elles : lancé seul,
     * il ne trouvait aucune pastille à cliquer.
     */
    const { dossier } = await (await request.post("/api/formalites/brouillon")).json();
    pagines.push(Number(dossier));

    await page.goto("/formalites");
    const filtres = page.getByRole("navigation", { name: "Filtrer les formalités" });

    await filtres.getByRole("link", { name: /Brouillon/ }).click();
    await expect(page).toHaveURL(/filtre=brouillon/);

    // Un brouillon porte sa pastille sur la carte : toutes celles qui restent l'ont.
    const cartes = liste(page).getByRole("listitem");
    const combien = await cartes.count();
    expect(combien, "au moins le brouillon qu'on vient d'ouvrir").toBeGreaterThan(0);
    for (let i = 0; i < combien; i++) {
      await expect(cartes.nth(i)).toContainText("Brouillon");
    }

    // Et ce qui est parti chez l'avocat n'y figure pas.
    await expect(liste(page).getByText("En révision par un avocat")).toHaveCount(0);
  });

  /** Une adresse partagée avant que « En cours » perde sa pastille ouvre la même liste. */
  test("l'ancienne adresse « en cours » montre toujours ce qui n'est pas terminé", async ({
    page,
  }) => {
    await page.goto("/formalites?filtre=en_cours");

    await expect(liste(page).getByText("PARCOURS TERMINEE")).toHaveCount(0);
    await expect(liste(page).getByRole("listitem").first()).toBeVisible();
  });

  test("le filtre survit à un rechargement, donc se partage", async ({ page }) => {
    await page.goto("/formalites?filtre=terminee");
    await expect(liste(page).getByText("PARCOURS EN COURS")).toHaveCount(0);
  });

  test("un filtre inventé ne casse pas la page", async ({ page }) => {
    await page.goto("/formalites?filtre=n-importe-quoi");
    // Retombe sur « tous » plutôt que sur une liste vide ou une erreur
    await expect(
      page
        .getByRole("navigation", { name: "Filtrer les formalités" })
        .getByRole("link", { name: /Toutes/ })
    ).toHaveAttribute("aria-current", "page");
  });

  test("la recherche filtre à la frappe", async ({ page }) => {
    await page.goto("/formalites");
    await chercher(page, "PARCOURS TERMINEE");

    await expect(liste(page).getByText("PARCOURS TERMINEE").first()).toBeVisible();
    await expect(liste(page).getByText("PARCOURS EN COURS")).toHaveCount(0);

    // Une recherche sans résultat le dit, au lieu de laisser la grille vide.
    await chercher(page, "zzz introuvable");
    await expect(page.getByText("Aucune formalité trouvée")).toBeVisible();
  });

  /**
   * « Voir toutes les formalités » remet tout, non la moitié.
   *
   * Le lien menait à /formalites, ce qui reposait la pastille sur « Toutes » - mais la
   * recherche vit dans l'état, non dans l'adresse. Le mot tapé restait en place, et
   * l'on retombait sur le même écran vide avec le même bouton qui ne menait à rien.
   */
  test("le retour à toutes les formalités vide aussi la recherche", async ({ page }) => {
    await page.goto("/formalites");
    await chercher(page, "un nom qui n'existe pas");

    const retour = page.getByRole("link", { name: "Voir toutes les formalités" });
    await expect(retour).toBeVisible();
    await retour.click();

    await expect(page.getByLabel("Rechercher une formalité")).toHaveValue("");
    await expect(liste(page).getByRole("listitem").first()).toBeVisible();
  });

  test("au-delà de neuf dossiers, la liste se pagine", async ({ page, request }) => {
    /*
     * Dix dossiers portant le même nom, cherchés ensemble.
     *
     * La pagination ne se vérifie qu'au-delà de neuf - six cartes s'arrêtaient au
     * milieu de l'écran, avec une pagination pour aller chercher les suivantes et un
     * demi-écran de vide dessous - et le jeu de données n'en compte que quatre. Les
     * semer ici et restreindre la liste par la recherche rend le test indépendant de
     * ce que les autres séries ont pu créer.
     */
    for (let i = 1; i <= 10; i++) {
      const { dossier } = await (await request.post("/api/formalites/brouillon")).json();
      pagines.push(dossier);
      await request.put("/api/formalites/brouillon", {
        data: { dossier, modifications: { denomination: "PAGINATION ESSAI " + i } },
      });
    }

    await page.goto("/formalites");
    await chercher(page, "PAGINATION ESSAI");

    // Neuf cartes, pas dix : la dixième est sur la page suivante.
    await expect(page.getByRole("link", { name: /Reprendre/ })).toHaveCount(9);
    await expect(page.getByText("1 à 9 sur 10")).toBeVisible();

    await page.getByLabel("Page suivante").click();
    await expect(page.getByRole("link", { name: /Reprendre/ })).toHaveCount(1);
    await expect(page.getByText("10 à 10 sur 10")).toBeVisible();

    // Une extrémité atteinte ne se clique pas.
    await expect(page.getByLabel("Page suivante")).toBeDisabled();
  });
});

test.describe("documents", () => {
  test("un document rejeté annonce ce qu'il faut faire, avec le motif", async ({ page }) => {
    await page.goto("/documents");
    /*
     * L'étiquette de la carte, et non la pastille du groupe : celui-ci annonce
     * « 1 à remplacer » pour se signaler même replié, et un sélecteur par texte en
     * trouverait deux.
     */
    await expect(page.getByText("À remplacer", { exact: true })).toBeVisible();
    await expect(page.getByText("Motif : Document illisible")).toBeVisible();
  });

  test("aucun statut technique ne transparaît", async ({ page }) => {
    /*
     * Le test attendait « Généré » à l'écran, ce qui suppose qu'un document du compte
     * porte ce statut-là : il échouait dès que les essais n'en laissaient aucun. Ce
     * qu'il garde vraiment, c'est qu'aucun mot de la base ne remonte tel quel.
     */
    await page.goto("/documents");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Documents");

    for (const technique of ["generated", "uploaded", "verified", "rejected", "pending"]) {
      await expect(page.getByText(technique, { exact: false })).toHaveCount(0);
    }
  });
});

test.describe("contrats", () => {
  test("la liste montre les contrats du compte", async ({ page }) => {
    await page.goto("/contrats");
    await expect(page.getByText("Accord de confidentialité")).toBeVisible();
    await expect(page.getByText("Conditions générales de vente")).toBeVisible();
  });

  test("les filtres se posent sur la page, non dans l'adresse", async ({ page }) => {
    /*
     * Ils étaient des liens vers /contrats?filtre=signe : la page rechargeait pour
     * masquer des lignes déjà chargées, et le nom du filtre était l'état technique.
     */
    await page.goto("/contrats");
    await page.getByRole("button", { name: /^Prêts/ }).click();

    await expect(page).toHaveURL(/\/contrats$/);
    await expect(page.getByText("Conditions générales de vente")).toBeVisible();
    await expect(page.getByText("Accord de confidentialité")).toHaveCount(0);
  });

  test("un filtre sans contrat n'est pas offert", async ({ page }) => {
    /*
     * Le test cliquait « En relecture » pour vider l'écran. Ce filtre ne s'affiche que
     * s'il a des contrats : le clic attendait un bouton qui ne viendrait jamais. La
     * garantie du jour est en amont - on n'offre pas un filtre qui ne rendrait rien.
     */
    await page.goto("/contrats");
    await expect(page.getByRole("button", { name: /^Tous/ })).toBeVisible();

    const offerts = await page
      .getByRole("button", { name: /^(Tous|À compléter|En relecture|Prêts|Signés)/ })
      .allInnerTexts();

    for (const libelle of offerts) {
      const compte = libelle.trim().match(/(\d+)$/);
      expect(compte, "décompte sur « " + libelle.trim() + " »").not.toBeNull();
      expect(Number(compte![1]), "« " + libelle.trim() + " » ne serait pas offert à zéro")
        .toBeGreaterThan(0);
    }
  });
});

test.describe("accès aux fichiers", () => {
  test("un fichier inconnu renvoie 404, sans dire s'il existe", async ({ request }) => {
    const reponse = await request.get("/api/fichier?nom=fichier-invente.pdf");
    expect(reponse.status()).toBe(404);
  });

  test("la traversée de répertoire est refusée", async ({ request }) => {
    const reponse = await request.get("/api/fichier?nom=" + encodeURIComponent("../../db.js"));
    expect(reponse.status()).toBe(404);
  });

  test("sans session, l'accès est refusé avant toute lecture", async ({ browser }) => {
    const anonyme = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const reponse = await anonyme.request.get("/api/fichier?nom=quelconque.pdf");
    expect(reponse.status()).toBe(401);
    await anonyme.close();
  });
});

test.describe("la fenêtre de nouvelle formalité", () => {
  test("elle passe au-dessus de la page, et s'ouvre depuis la barre de titre", async ({ page }) => {
    /*
     * La colonne est en position:sticky, ce qui crée un contexte d'empilement : le
     * z-index de la fenêtre y restait prisonnier, et les cartes de la page se
     * peignaient par-dessus. Un portail la sort de ce contexte.
     */
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto("/formalites");

    /*
     * Celui de la colonne, désormais le seul.
     *
     * La barre de titre en portait un second, à trente centimètres du premier : deux
     * portes pour la même pièce. Ce qui se vérifie ici n'est pas d'où l'on ouvre la
     * fenêtre, mais qu'elle se peigne au-dessus de la page une fois ouverte.
     */
    const bouton = page.getByRole("button", { name: "Nouvelle formalité" });
    await expect(bouton).toBeVisible();
    await bouton.click();

    const fenetre = page.getByRole("dialog", { name: "Nouvelle formalité" });
    await expect(fenetre).toBeVisible();

    // Ce qui est peint au centre de la fenêtre doit être la fenêtre, non une carte.
    const cadre = (await fenetre.boundingBox())!;
    const dessus = await page.evaluate(
      ([x, y]) =>
        !!document.elementFromPoint(x as number, y as number)?.closest("[role='dialog']"),
      [cadre.x + cadre.width / 2, cadre.y + cadre.height / 2]
    );
    expect(dessus).toBe(true);

    // Et elle mène toujours où il faut.
    // « Auto-entrepreneur » s'appelle « Créer une auto-entreprise » depuis que les
    // intitulés de la fenêtre sont tous des verbes.
    await fenetre.getByRole("link", { name: "Créer une auto-entreprise" }).click();
    await page.waitForURL(/auto-entrepreneur/);
  });

  /**
   * Le titre et la date ne se chevauchent à aucune largeur.
   *
   * La barre portait aussi un bouton, et pouvait se comprimer sous sa largeur utile :
   * la date, rétrécie, débordait sous le noir du bouton. Le bouton est parti, mais la
   * contrainte demeure entre le titre et la date - c'est elle qu'on vérifie.
   */
  test("le titre et la date ne se chevauchent à aucune largeur", async ({ page }) => {
    for (const largeur of [1500, 1280, 1000, 860, 760]) {
      await page.setViewportSize({ width: largeur, height: 900 });
      await page.goto("/formalites");

      /*
       * On désigne la date par sa place, non par sa classe.
       *
       * Elle portait `topbarDate`, propre à la page ; elle vient maintenant du bandeau
       * partagé, où elle s'appelle autrement. Ce qui ne changera pas, c'est qu'elle est
       * le premier texte à droite du titre dans la ligne de tête.
       */
      const ecart = await page.evaluate(() => {
        const titre = document.querySelector("main h1")!;
        const date = titre.parentElement!.querySelector("span")!;
        return date.getBoundingClientRect().left - titre.getBoundingClientRect().right;
      });

      expect(ecart, largeur + "px").toBeGreaterThanOrEqual(16);
    }
  });
});

test("la frise du tableau de bord se lit en ligne", async ({ page }) => {
  /*
   * Même piège que le fil du parcours : la frise est un <ol>, globals.css met les
   * listes de `main` en colonne, et `.journey` déclarait `display: flex` sans
   * direction. Les étapes se dressaient à la verticale - le défaut signalé en
   * production, invisible à la relecture du composant.
   */
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/tableau-de-bord");

  const etapes = await page.evaluate(() =>
    [...document.querySelectorAll("[class*='journey'] > *")].map((e) => {
      const boite = e.getBoundingClientRect();
      return { x: Math.round(boite.x), y: Math.round(boite.y) };
    })
  );

  test.skip(etapes.length < 2, "Aucun dossier en cours : la frise n'est pas affichée");

  for (let i = 1; i < etapes.length; i++) {
    expect(etapes[i].x, "étape " + (i + 1)).toBeGreaterThan(etapes[i - 1].x);
    expect(Math.abs(etapes[i].y - etapes[0].y), "étape " + (i + 1)).toBeLessThan(4);
  }
});
