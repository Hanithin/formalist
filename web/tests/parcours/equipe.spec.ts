import { test, expect, type Page } from "@playwright/test";

/**
 * La page d'équipe : inviter, relancer, révoquer, changer des droits.
 *
 * Le dépôt savait déjà tout faire ; seule la liste des membres s'affichait. Ces
 * parcours tiennent les gestes qui manquaient, et la garde qui empêche une équipe de
 * se retrouver sans personne pour la gérer.
 *
 * En série : tous ces tests agissent sur la même équipe, celle du compte d'essai, et
 * en parallèle l'un révoquerait l'invitation qu'un autre vient d'ouvrir.
 */
test.describe.configure({ mode: "serial" });

/** Une adresse par exécution : « exemple.test » est nettoyé entre les campagnes. */
function adresseJetable(): string {
  return "invite-" + Date.now() + "-" + Math.floor(Math.random() * 1000) + "@exemple.test";
}

async function inviter(page: Page, email: string) {
  await page.goto("/equipe");
  await page.getByRole("button", { name: /Inviter un membre/ }).click();

  const fenetre = page.getByRole("dialog", { name: "Inviter un membre" });
  await expect(fenetre).toBeVisible();

  await fenetre.getByLabel("Adresse email").fill(email);
  await fenetre.getByRole("button", { name: "Envoyer l'invitation" }).click();

  // Sans clé Resend, l'invitation existe mais l'email n'est pas parti : les deux
  // formulations sont acceptables, le refus ne l'est pas.
  await expect(fenetre.getByRole("status")).toContainText(email);
  await fenetre.getByRole("button", { name: "Fermer" }).first().click();
}

test("la page dit qui est dans l'équipe et ce que chacun peut faire", async ({ page }) => {
  await page.goto("/equipe");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Vous", { exact: true })).toBeVisible();

  // Les compteurs n'affichent jamais un zéro : à zéro, c'est un tiret.
  const valeurs = await page.locator("[class*='statValue']").allTextContents();
  expect(valeurs.length).toBe(3);
  expect(valeurs).not.toContain("0");

  // Le compte d'essai gère son équipe : le geste d'invitation lui est offert.
  await expect(page.getByRole("button", { name: /Inviter un membre/ })).toBeVisible();
});

test("une invitation s'envoie, se relance et se révoque", async ({ page }) => {
  const email = adresseJetable();
  await inviter(page, email);

  const ligne = page.locator("li", { hasText: email }).last();
  await expect(ligne).toContainText("En attente");
  // Le délai se lit sans calcul mental.
  await expect(ligne).toContainText(/expire dans \d+ jours/);

  await ligne.getByRole("button", { name: "Renvoyer" }).click();
  await expect(ligne.getByRole("status").or(ligne.getByRole("alert"))).toBeVisible();

  await ligne.getByRole("button", { name: "Révoquer" }).click();
  await expect(page.locator("li", { hasText: email }).last()).toContainText("Révoquée");
});

test("une invitation en attente offre son lien, une invitation révoquée non", async ({ page }) => {
  const email = adresseJetable();
  await inviter(page, email);

  const ligne = page.locator("li", { hasText: email }).last();
  await expect(ligne.getByRole("button", { name: "Copier le lien" })).toBeVisible();

  await ligne.getByRole("button", { name: "Révoquer" }).click();

  // Un lien mort ne se copie pas : le geste disparaît avec sa raison d'être.
  const revoquee = page.locator("li", { hasText: email }).last();
  await expect(revoquee).toContainText("Révoquée");
  await expect(revoquee.getByRole("button", { name: "Copier le lien" })).toHaveCount(0);
});

test("la même adresse ne s'invite pas deux fois si elle est déjà membre", async ({ page }) => {
  await page.goto("/equipe");

  // L'adresse du compte connecté est celle affichée sous son nom.
  const sienne = await page.locator("[class*='email']").first().textContent();
  expect(sienne).toBeTruthy();

  await page.getByRole("button", { name: /Inviter un membre/ }).click();
  const fenetre = page.getByRole("dialog", { name: "Inviter un membre" });
  await fenetre.getByLabel("Adresse email").fill(sienne!.trim());
  await fenetre.getByRole("button", { name: "Envoyer l'invitation" }).click();

  await expect(fenetre.getByRole("alert")).toContainText("fait déjà partie");
});

test("les droits d'un membre se changent depuis la page", async ({ page }) => {
  await page.goto("/equipe");

  const moi = page.locator("li", { hasText: "Vous" }).first();
  await moi.getByRole("button", { name: "Modifier les accès" }).click();

  const fenetre = page.getByRole("dialog", { name: /Accès de/ });
  await expect(fenetre).toBeVisible();

  // Chaque droit porte la phrase qui dit ce qu'on perd sans lui.
  await expect(fenetre).toContainText("Sans ce droit");

  const case_ = fenetre.getByRole("checkbox", { name: /Voir tous les dossiers/ });
  const avant = await case_.isChecked();
  await case_.setChecked(!avant);
  await fenetre.getByRole("button", { name: "Enregistrer" }).click();

  await expect(fenetre).toBeHidden();
  await expect(page.locator("li", { hasText: "Vous" }).first()).toContainText(
    avant ? "Voit ses dossiers" : "Voit tous les dossiers"
  );

  // Remise en l'état : les tests suivants partent d'une équipe inchangée.
  await page.locator("li", { hasText: "Vous" }).first()
    .getByRole("button", { name: "Modifier les accès" }).click();
  await page.getByRole("dialog", { name: /Accès de/ })
    .getByRole("checkbox", { name: /Voir tous les dossiers/ }).setChecked(avant);
  await page.getByRole("dialog", { name: /Accès de/ })
    .getByRole("button", { name: "Enregistrer" }).click();
});

test("le dernier dirigeant ne peut pas se rétrograder", async ({ page }) => {
  /*
   * L'équipe deviendrait ingérable : plus personne pour inviter, changer un droit ou
   * retirer quelqu'un, et aucun geste de l'application pour en sortir. Le retrait
   * était gardé, la rétrogradation ne l'était pas.
   */
  await page.goto("/equipe");

  const moi = page.locator("li", { hasText: "Vous" }).first();
  const seulDirigeant = (await page.locator("li [class*='roleDirigeant']").count()) === 1;
  test.skip(!seulDirigeant, "L'équipe d'essai compte plusieurs dirigeants");

  await moi.getByRole("button", { name: "Modifier les accès" }).click();
  const fenetre = page.getByRole("dialog", { name: /Accès de/ });

  await fenetre.getByRole("radio", { name: "Collaborateur" }).check();
  await fenetre.getByRole("button", { name: "Enregistrer" }).click();

  await expect(fenetre.getByRole("alert")).toContainText(/au moins un/);
  await expect(fenetre).toBeVisible();
});

test("la fenêtre d'invitation passe au-dessus de la page", async ({ page }) => {
  // Le gabarit met la colonne en position:sticky, ce qui piège un z-index : la
  // fenêtre est posée sur le document, non dans la page.
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto("/equipe");
  await page.getByRole("button", { name: /Inviter un membre/ }).click();

  const fenetre = page.getByRole("dialog", { name: "Inviter un membre" });
  const cadre = (await fenetre.boundingBox())!;
  const dessus = await page.evaluate(
    ([x, y]) => !!document.elementFromPoint(x as number, y as number)?.closest("[role='dialog']"),
    [cadre.x + cadre.width / 2, cadre.y + cadre.height / 2]
  );

  expect(dessus).toBe(true);
});

test("le dernier dirigeant est prévenu avant de cliquer, pas après", async ({ page }) => {
  /*
   * Le serveur refuserait le retrait ; un bouton rouge qui ne peut que échouer fait
   * chercher la faute ailleurs. La fenêtre dit ce qui manque et ne propose rien.
   */
  await page.goto("/equipe");
  const seul = (await page.locator("li [class*='roleDirigeant']").count()) === 1;
  test.skip(!seul, "L'équipe d'essai compte plusieurs dirigeants");

  await page.locator("li", { hasText: "Vous" }).first()
    .getByRole("button", { name: "Quitter" }).click();

  const fenetre = page.getByRole("dialog", { name: /Quitter l'équipe/ });
  await expect(fenetre).toContainText("seule personne à gérer cette équipe");
  await expect(fenetre.getByRole("button", { name: "Quitter l'équipe" })).toHaveCount(0);
});
