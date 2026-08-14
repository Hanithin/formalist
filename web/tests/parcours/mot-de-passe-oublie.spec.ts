import { test, expect } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/infrastructure/db/generated/client";
import { hacher } from "../../src/lib/mots-de-passe";

/**
 * Mot de passe oublié, de bout en bout.
 *
 * Le jeton se lit en base parce qu'il part par email, et qu'aucun email ne sort en
 * essai. Le reste du parcours est celui de la personne : elle clique sur le lien de
 * la page de connexion, demande un envoi, ouvre l'adresse reçue, choisit un mot de
 * passe et se retrouve connectée.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? "",
    options: "-c timezone=UTC",
  }),
});

const MARQUE = "oubli-parcours-";
const ANCIEN = "ancien-mot-de-passe-42";
const NOUVEAU = "nouveau-mot-de-passe-77";

/*
 * Un compte par test, et non un compte partagé remis à zéro entre chacun : la série
 * tourne en parallèle, et deux tests qui recréent le même compte se détruisent
 * mutuellement au milieu du parcours de l'autre.
 */
let suivant = 0;
const crees: number[] = [];

async function compteJetable() {
  const empreinte = hacher(ANCIEN);
  const email = MARQUE + process.pid + "-" + suivant++ + "@exemple.test";
  const compte = await prisma.users.create({
    data: {
      email,
      password_hash: empreinte.hash,
      salt: empreinte.salt,
      name: "Oubli Parcours",
      role: "user",
      roles: JSON.stringify(["user"]),
      email_verified: true,
    },
  });
  crees.push(compte.id);
  return compte;
}

test.describe("mot de passe oublié", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  /*
   * Le ménage ne porte que sur les comptes créés ici, et non sur tous ceux qui
   * portent la marque.
   *
   * afterAll s'exécute une fois par processus de test, et la série tourne en
   * parallèle : un balayage par préfixe supprimerait les comptes des tests encore en
   * cours ailleurs. La suppression emporte leurs jetons en cascade, et ces tests
   * échouent en cherchant un lien qui n'existe plus - un échec qui accuse le code
   * alors qu'il vient du ménage.
   */
  test.afterAll(async () => {
    if (crees.length > 0) {
      const comptes = await prisma.users.findMany({
        where: { id: { in: crees } },
        select: { id: true, email: true },
      });
      await prisma.email_tokens.deleteMany({ where: { user_id: { in: crees } } });
      await prisma.sessions.deleteMany({ where: { user_id: { in: crees } } });
      await prisma.tentatives.deleteMany({ where: { cle: { in: comptes.map((c) => c.email) } } });
      await prisma.users.deleteMany({ where: { id: { in: crees } } });
    }
    await prisma.$disconnect();
  });

  test("la page de connexion offre une issue quand on ne se souvient plus", async ({ page }) => {
    await page.goto("/connexion");
    // Le lien est au niveau du champ concerné, c'est là qu'on le cherche.
    await page.getByRole("link", { name: /Mot de passe oublié/ }).click();

    await expect(page).toHaveURL(/\/mot-de-passe-oublie$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Mot de passe oublié");
  });

  test("la demande répond la même chose pour une adresse inconnue", async ({ page }) => {
    /*
     * Distinguer ferait de cette page un annuaire : on pourrait vérifier adresse par
     * adresse qui est client.
     */
    await page.goto("/mot-de-passe-oublie");
    await page.getByLabel("Email").fill("personne-du-tout@exemple.test");
    await page.getByRole("button", { name: /Recevoir un lien/ }).click();

    await expect(page.getByRole("status")).toContainText("Si un compte existe à cette adresse");
  });

  test("le parcours complet mène au tableau de bord", async ({ page }) => {
    const compte = await compteJetable();

    await page.goto("/mot-de-passe-oublie");
    await page.getByLabel("Email").fill(compte.email);
    await page.getByRole("button", { name: /Recevoir un lien/ }).click();
    await expect(page.getByRole("status")).toBeVisible();

    // Le lien part par email : en essai, on le relit en base.
    const lien = await prisma.email_tokens.findFirstOrThrow({
      where: { user_id: compte.id, type: "reset" },
      orderBy: { created_at: "desc" },
    });

    await page.goto("/mot-de-passe-oublie/" + lien.token);
    await expect(page.getByText("Choisissez votre nouveau mot de passe")).toBeVisible();

    await page.getByLabel("Nouveau mot de passe").fill(NOUVEAU);
    await page.getByLabel("Confirmez").fill(NOUVEAU);
    await page.getByRole("button", { name: /Changer mon mot de passe/ }).click();

    // La session s'ouvre dans la foulée : redemander le mot de passe qu'on vient de
    // choisir n'apporterait rien.
    await expect(page).toHaveURL(/\/tableau-de-bord/);
  });

  test("deux saisies différentes sont refusées avant tout envoi", async ({ page }) => {
    // Une faute de frappe dans un champ masqué ne se voit pas : sans ce contrôle, on
    // se retrouve enfermé dehors juste après avoir refait son mot de passe.
    const compte = await compteJetable();
    const lien = await prisma.email_tokens.create({
      data: {
        token: "essai-saisies-differentes-" + compte.id,
        user_id: compte.id,
        type: "reset",
        expires_at: new Date(Date.now() + 3_600_000),
      },
    });

    await page.goto("/mot-de-passe-oublie/" + lien.token);
    await page.getByLabel("Nouveau mot de passe").fill(NOUVEAU);
    await page.getByLabel("Confirmez").fill("autre-chose-88");
    await page.getByRole("button", { name: /Changer mon mot de passe/ }).click();

    // Le sélecteur vise le message du formulaire : Next pose son propre role="alert"
    // pour annoncer les changements de route, et un sélecteur par rôle en trouve deux.
    await expect(page.locator("form p[role=alert]")).toContainText("ne sont pas identiques");

    // Le jeton n'a pas été consommé : la vérification est bien restée dans la page.
    const relu = await prisma.email_tokens.findUniqueOrThrow({ where: { token: lien.token } });
    expect(relu.used_at).toBeNull();
  });

  test("un lien invalide le dit et propose une sortie", async ({ page }) => {
    await page.goto("/mot-de-passe-oublie/" + "x".repeat(64));

    await expect(page.getByRole("status")).toContainText("n'est pas valable");
    await expect(page.getByRole("link", { name: /Demander un nouveau lien/ })).toBeVisible();
  });

  test("l'API refuse un jeton inventé", async ({ request }) => {
    const reponse = await request.put("/api/auth/mot-de-passe-oublie", {
      data: { jeton: "y".repeat(64), motDePasse: NOUVEAU },
    });
    expect(reponse.status()).toBe(400);
  });

  test("l'API refuse un mot de passe trop court", async ({ request }) => {
    const reponse = await request.put("/api/auth/mot-de-passe-oublie", {
      data: { jeton: "z".repeat(64), motDePasse: "court" },
    });
    expect(reponse.status()).toBe(400);
  });
});
