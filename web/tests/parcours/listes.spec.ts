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
    await expect(page.getByText("PARCOURS TERMINEE").first()).toBeVisible();
    await expect(page.getByText("PARCOURS EN COURS")).toHaveCount(0);
  });

  test("le filtre survit à un rechargement, donc se partage", async ({ page }) => {
    await page.goto("/formalites?filtre=terminee");
    await expect(page.getByText("PARCOURS EN COURS")).toHaveCount(0);
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

    await expect(page.getByText("PARCOURS TERMINEE").first()).toBeVisible();
    await expect(page.getByText("PARCOURS EN COURS")).toHaveCount(0);

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
