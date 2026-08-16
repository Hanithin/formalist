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
    // La carte annonce aussi son avancement et sa forme.
    await expect(carte.getByText(/% complété/)).toBeVisible();
    await expect(carte.getByText("SASU")).toBeVisible();
  });

  test("les trois compteurs de tête résument la liste", async ({ page }) => {
    await page.goto("/formalites");

    // « Total » se dit aussi dans le sous-titre « n formalités au total » : on vise
    // le libellé exact.
    const compteurs = page.getByRole("list").first();
    await expect(compteurs.getByText("En cours", { exact: true })).toBeVisible();
    await expect(compteurs.getByText(/^Terminées?$/)).toBeVisible();
    await expect(compteurs.getByText("Total", { exact: true })).toBeVisible();
    // Le total est un nombre, pas un tiret : le jeu de données n'est pas vide.
    await expect(compteurs.getByText(/formalités? au total/)).toBeVisible();
  });

  test("chaque filtre annonce son décompte", async ({ page }) => {
    await page.goto("/formalites");
    const filtres = page.getByRole("navigation", { name: "Filtrer les formalités" });

    for (const libelle of ["Tous", "En cours", "En attente", "Terminées"]) {
      await expect(filtres.getByRole("link", { name: new RegExp(libelle) })).toContainText(/\d/);
    }
  });

  test("le filtre restreint la liste et se lit dans l'adresse", async ({ page }) => {
    await page.goto("/formalites");
    await page
      .getByRole("navigation", { name: "Filtrer les formalités" })
      .getByRole("link", { name: /Terminées/ })
      .click();

    await expect(page).toHaveURL(/filtre=terminee/);
    await expect(liste(page).getByText("PARCOURS TERMINEE").first()).toBeVisible();
    await expect(liste(page).getByText("PARCOURS EN COURS")).toHaveCount(0);
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
        .getByRole("link", { name: /Tous/ })
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

  test("au-delà de six dossiers, la liste se pagine", async ({ page, request }) => {
    /*
     * Sept dossiers portant le même nom, cherchés ensemble.
     *
     * La pagination ne se vérifie qu'au-delà de six, et le jeu de données n'en compte
     * que quatre. Les semer ici et restreindre la liste par la recherche rend le test
     * indépendant de ce que les autres séries ont pu créer.
     */
    for (let i = 1; i <= 7; i++) {
      const { dossier } = await (await request.post("/api/formalites/brouillon")).json();
      pagines.push(dossier);
      await request.put("/api/formalites/brouillon", {
        data: { dossier, modifications: { denomination: "PAGINATION ESSAI " + i } },
      });
    }

    await page.goto("/formalites");
    await chercher(page, "PAGINATION ESSAI");

    // Six cartes, pas sept : la septième est sur la page suivante.
    await expect(page.getByRole("link", { name: /Reprendre/ })).toHaveCount(6);
    await expect(page.getByText("1 à 6 sur 7")).toBeVisible();

    await page.getByLabel("Page suivante").click();
    await expect(page.getByRole("link", { name: /Reprendre/ })).toHaveCount(1);
    await expect(page.getByText("7 à 7 sur 7")).toBeVisible();

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

  test("les statuts techniques sont traduits", async ({ page }) => {
    await page.goto("/documents");
    // Les essais de génération ajoutent d'autres documents : on vise le premier.
    await expect(page.getByText("Généré").first()).toBeVisible();
    await expect(page.getByText("generated")).toHaveCount(0);
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

  test("un filtre sans contrat le dit plutôt que de laisser un vide", async ({ page }) => {
    await page.goto("/contrats");
    await page.getByRole("button", { name: /^En relecture/ }).click();

    await expect(page.getByText("Rien dans cette catégorie")).toBeVisible();
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

    // Le bouton de la barre de titre, en plus de celui de la colonne : on est venu
    // ici pour en créer une.
    const enTete = page.getByRole("button", { name: "Nouvelle formalité" });
    await expect(enTete).toBeVisible();
    await enTete.click();

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
    await fenetre.getByRole("link", { name: /Auto-entrepreneur/ }).click();
    await page.waitForURL(/auto-entrepreneur/);
  });

  test("la date et le bouton ne se chevauchent à aucune largeur", async ({ page }) => {
    /*
     * La barre de titre pouvait se comprimer sous sa largeur utile : la date, alors
     * rétrécie, débordait sous le bouton noir - le dernier chiffre de l'année passait
     * dessous. Le bouton ne se comprime plus, la date ne se coupe plus, et c'est la
     * barre entière qui passe à la ligne quand la place manque.
     */
    for (const largeur of [1500, 1280, 1000, 860, 760]) {
      await page.setViewportSize({ width: largeur, height: 900 });
      await page.goto("/formalites");

      const ecart = await page.evaluate(() => {
        const date = document.querySelector("[class*='topbarDate']")!;
        const bouton = date.parentElement!.querySelector("button")!;
        return bouton.getBoundingClientRect().left - date.getBoundingClientRect().right;
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
