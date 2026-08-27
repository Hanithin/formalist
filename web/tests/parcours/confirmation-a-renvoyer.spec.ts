import { test, expect } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/infrastructure/db/generated/client";
import { hacher } from "../../src/lib/mots-de-passe";

/**
 * Le lien de confirmation, quand on ne l'a jamais reçu.
 *
 * L'écran de connexion refusait l'entrée d'un « ouvrez le lien reçu par email » à
 * quelqu'un qui n'avait rien reçu, et ne lui offrait aucune issue. Deux chemins y
 * mènent, et l'un est invisible : une seconde tentative d'inscription avec la même
 * adresse n'envoie rien du tout - le compte existe déjà - tout en affichant qu'un lien
 * attend. La route de renvoi existait pourtant, sans écran pour l'appeler.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? "",
    options: "-c timezone=UTC",
  }),
});

const MARQUE = "confirmation-parcours-";
const MOT_DE_PASSE = "mot-de-passe-confirmation-88";

/*
 * Le refus du formulaire, et lui seul.
 *
 * Next pose son propre élément d'annonce de navigation avec le même rôle : viser le
 * rôle seul en attrape deux, dont un toujours vide.
 */
const refus = (page: import("@playwright/test").Page) =>
  page.locator('form p[role="alert"]');

let suivant = 0;
const crees: number[] = [];

/* Un compte par test : la série tourne en parallèle. */
async function compteNonConfirme() {
  const empreinte = hacher(MOT_DE_PASSE);
  const email = MARQUE + process.pid + "-" + suivant++ + "@exemple.test";
  const compte = await prisma.users.create({
    data: {
      email,
      password_hash: empreinte.hash,
      salt: empreinte.salt,
      name: "Confirmation Parcours",
      role: "user",
      roles: JSON.stringify(["user"]),
      email_verified: false,
    },
  });
  crees.push(compte.id);
  return compte;
}

test.describe("renvoyer le lien de confirmation", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

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

  test("l'issue ne paraît que pour une adresse non confirmée", async ({ page }) => {
    /*
     * Proposer un lien de confirmation à qui s'est trompé de mot de passe ajouterait
     * au malentendu : il chercherait dans sa boîte ce qui n'y est pour rien.
     */
    const compte = await compteNonConfirme();

    await page.goto("/connexion");
    await page.getByLabel("Email").fill(compte.email);
    await page.getByLabel("Mot de passe").fill("ce-n-est-pas-le-bon-42");
    await page.getByRole("button", { name: /Se connecter/ }).click();

    await expect(refus(page)).toContainText("Email ou mot de passe incorrect");
    await expect(page.getByRole("button", { name: /Renvoyer le lien/ })).toHaveCount(0);
  });

  test("l'adresse survit à un refus", async ({ page }) => {
    /*
     * React réinitialise un formulaire après son action : à chaque mot de passe
     * manqué, l'adresse s'effaçait et il fallait la retaper.
     */
    const compte = await compteNonConfirme();

    await page.goto("/connexion");
    await page.getByLabel("Email").fill(compte.email);
    await page.getByLabel("Mot de passe").fill("ce-n-est-pas-le-bon-42");
    await page.getByRole("button", { name: /Se connecter/ }).click();
    await expect(refus(page)).toBeVisible();

    await expect(page.getByLabel("Email")).toHaveValue(compte.email);
  });

  test("le bon mot de passe sur une adresse non confirmée ouvre l'issue", async ({ page }) => {
    const compte = await compteNonConfirme();

    await page.goto("/connexion");
    await page.getByLabel("Email").fill(compte.email);
    await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE);
    await page.getByRole("button", { name: /Se connecter/ }).click();

    await expect(refus(page)).toContainText("pas encore confirmée");
    await expect(page.getByRole("button", { name: /Renvoyer le lien/ })).toBeVisible();
  });

  test("le renvoi produit un jeton neuf et invalide le précédent", async ({ page }) => {
    const compte = await compteNonConfirme();

    /* Un premier lien, comme l'inscription en aurait posé un. */
    const premier = await prisma.email_tokens.create({
      data: {
        token: "confirmation-ancien-" + process.pid + "-" + suivant,
        user_id: compte.id,
        type: "verify",
        expires_at: new Date(Date.now() + 86_400_000),
      },
    });

    await page.goto("/connexion");
    await page.getByLabel("Email").fill(compte.email);
    await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE);
    await page.getByRole("button", { name: /Se connecter/ }).click();
    await page.getByRole("button", { name: /Renvoyer le lien/ }).click();

    /* La réponse ne dit jamais si le compte existe : c'est un formulaire ouvert. */
    await expect(page.getByRole("status")).toBeVisible();

    const ancien = await prisma.email_tokens.findUnique({ where: { token: premier.token } });
    expect(ancien, "l'ancien lien ne doit plus valoir").toBeNull();

    const neuf = await prisma.email_tokens.findFirst({
      where: { user_id: compte.id, type: "verify" },
      orderBy: { created_at: "desc" },
    });
    expect(neuf, "un lien neuf doit avoir été posé").not.toBeNull();
    expect(neuf!.token).not.toBe(premier.token);
  });

  test("le lien renvoyé confirme l'adresse et rend le compte utilisable", async ({ page }) => {
    const compte = await compteNonConfirme();

    await page.goto("/connexion");
    await page.getByLabel("Email").fill(compte.email);
    await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE);
    await page.getByRole("button", { name: /Se connecter/ }).click();
    await page.getByRole("button", { name: /Renvoyer le lien/ }).click();
    await expect(page.getByRole("status")).toBeVisible();

    /* Le lien part par email : en essai, on le relit en base. */
    const jeton = await prisma.email_tokens.findFirstOrThrow({
      where: { user_id: compte.id, type: "verify" },
      orderBy: { created_at: "desc" },
    });

    await page.goto("/api/auth/verifier?jeton=" + jeton.token);

    const apres = await prisma.users.findUniqueOrThrow({ where: { id: compte.id } });
    expect(apres.email_verified, "l'adresse doit être confirmée").toBe(true);

    await page.goto("/connexion");
    await page.getByLabel("Email").fill(compte.email);
    await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE);
    await page.getByRole("button", { name: /Se connecter/ }).click();

    await expect(page).toHaveURL(/\/tableau-de-bord/);
  });
});
