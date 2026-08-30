import { test, expect } from "@playwright/test";

/**
 * Un lien qui ne mène plus à rien.
 *
 * Les parcours ouvraient leur dossier sans filet. Un favori vers un dossier supprimé,
 * un lien reçu qui pointe celui de quelqu'un d'autre, et la page levait un `Interdit`
 * que personne n'attrapait : le client sortait de l'application sur la page d'erreur
 * de Next - « Application error: a server-side exception has occurred » - sans un mot
 * sur ce qu'il pouvait faire.
 *
 * Les six parcours répondent maintenant la même chose, et le disent dans la mise en
 * page de l'application, avec une porte de sortie.
 */

const NUMERO_QUI_N_EXISTE_PAS = 987654321;

const PARCOURS = [
  { chemin: "/creation", parametre: "dossier" },
  { chemin: "/modification", parametre: "dossier" },
  { chemin: "/fermeture", parametre: "dossier" },
  { chemin: "/cessation", parametre: "dossier" },
  { chemin: "/depot-des-comptes", parametre: "dossier" },
  { chemin: "/auto-entrepreneur", parametre: "dossier" },
];

for (const parcours of PARCOURS) {
  test(`${parcours.chemin} dit qu'un dossier inconnu est introuvable`, async ({ page }) => {
    const reponse = await page.goto(
      `${parcours.chemin}?${parcours.parametre}=${NUMERO_QUI_N_EXISTE_PAS}`
    );

    /* Le code compte autant que la page : un lien mort n'est pas une panne de serveur. */
    expect(reponse?.status()).toBe(404);

    await expect(page.getByRole("heading", { name: "Ce dossier est introuvable" })).toBeVisible();
    /*
     * La même phrase pour les deux cas : distinguer « il n'existe pas » de « il ne
     * vous est pas accessible » renseignerait sur l'existence du dossier d'autrui.
     */
    await expect(page.getByText("Il n'existe pas, ou il ne vous est pas accessible.")).toBeVisible();

    /* On repart de là, sans revenir en arrière ni retaper une adresse. */
    await page.getByRole("link", { name: "Mes formalités" }).first().click();
    await expect(page).toHaveURL(/\/formalites/);
  });
}

test("l'écran de l'avocat répond de même", async ({ page }) => {
  /*
   * Lui appelait déjà `notFound()` : c'est la page rendue qui manquait, et Next
   * servait la sienne, hors de l'application.
   */
  const reponse = await page.goto(`/avocat/${NUMERO_QUI_N_EXISTE_PAS}`);
  expect(reponse?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Ce dossier est introuvable" })).toBeVisible();
});

test("la mise en page de l'application reste autour", async ({ page }) => {
  /*
   * Next rendrait sa propre page hors de toute mise en page : fond blanc, aucun
   * repère, et l'impression d'avoir quitté le site. La colonne de navigation est ce
   * qui dit qu'on est toujours chez soi.
   */
  await page.goto(`/modification?dossier=${NUMERO_QUI_N_EXISTE_PAS}`);
  await expect(page.getByRole("link", { name: "Mes sociétés" })).toBeVisible();
});
