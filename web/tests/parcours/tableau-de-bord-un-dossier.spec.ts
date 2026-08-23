import path from "node:path";
import { test, expect } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/infrastructure/db/generated/client";

/**
 * Le tableau de bord d'un compte qui n'a qu'un dossier.
 *
 * À plusieurs, l'accueil compare : des chiffres, une table, deux colonnes. À un seul,
 * il n'y a rien à comparer, et cet appareil disait trois fois le même dossier - la
 * ligne « 1 action requise · 1 formalité en cours », le bandeau de reprise, puis la
 * table des formalités en cours et son unique ligne. Trois présentations du même
 * objet, dont deux faites pour en comparer plusieurs.
 *
 * Ces essais tiennent la règle : un dossier, un objet, et pas de cadre vide.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

// Le préfixe « nouveau- » est celui que preparer.ts nettoie.
const EMAIL = "nouveau-un-dossier@exemple.test";
const MOT_DE_PASSE = "MotDePasseParcours2026!";
const SOCIETE = "STUDIO KERN";

/*
 * Une session ouverte une fois, comme le fait preparer.ts pour le compte partagé.
 *
 * Se reconnecter à chaque essai déclenchait la limitation de débit : les tentatives
 * sont comptées, et cinq connexions d'affilée depuis la même adresse suffisent à
 * faire attendre les suivantes jusqu'au délai d'expiration.
 */
const SESSION = path.join(import.meta.dirname, "session-un-dossier.json");
test.use({ storageState: SESSION });

/*
 * Un seul ouvrier pour ce fichier.
 *
 * `fullyParallel` répartit les essais d'un même fichier entre les ouvriers, et
 * `beforeAll` s'exécute alors une fois par ouvrier : le second butait sur la
 * contrainte d'unicité de l'adresse en créant le compte une seconde fois.
 */
test.describe.configure({ mode: "serial" });

/** Ouvre la session du compte et l'enregistre pour les essais du fichier. */
async function ouvrirLaSession(browser: import("@playwright/test").Browser) {
  const contexte = await browser.newContext({
    baseURL: process.env.BASE_URL ?? "http://localhost:3100",
    storageState: { cookies: [], origins: [] },
  });
  const page = await contexte.newPage();

  await page.goto("/connexion");
  await page.getByLabel("Email", { exact: true }).fill(EMAIL);
  await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: /se connecter/i }).click();
  await page.waitForURL(/tableau-de-bord/);

  await contexte.storageState({ path: SESSION });
  await contexte.close();
}

test.beforeAll(async ({ browser }) => {
  const modele = await prisma.users.findUniqueOrThrow({
    where: { email: "parcours@exemple.test" },
  });

  await prisma.formalites.deleteMany({
    where: {
      user_id: {
        in: (await prisma.users.findMany({ where: { email: EMAIL }, select: { id: true } })).map(
          (u) => u.id
        ),
      },
    },
  });
  await prisma.sessions.deleteMany({ where: { users: { email: EMAIL } } });
  await prisma.users.deleteMany({ where: { email: EMAIL } });

  const compte = await prisma.users.create({
    data: {
      email: EMAIL,
      password_hash: modele.password_hash,
      salt: modele.salt,
      name: "Léa Nouvelle",
      first_name: "Léa",
      last_name: "Nouvelle",
      role: "user",
      roles: JSON.stringify(["user"]),
      email_verified: true,
    },
  });

  await prisma.formalites.create({
    data: {
      user_id: compte.id,
      type: "creation",
      forme: "SASU",
      societe: SOCIETE,
      status: "en_cours",
      phase: 2,
      offer: "business",
      data_json: "{}",
    },
  });
  /*
   * Les tentatives de connexion sont comptées par adresse : relancer la série
   * plusieurs fois d'affilée finit par faire attendre la suivante, et l'ouverture de
   * session expire sur un mécanisme qui fonctionne. preparer.ts fait de même pour le
   * compte partagé.
   */
  await prisma.tentatives.deleteMany({ where: { cle: EMAIL } });
  await ouvrirLaSession(browser);
});

// La session est déjà ouverte : chaque essai part de l'accueil.
test.beforeEach(async ({ page }) => {
  await page.goto("/tableau-de-bord");
});

test.afterAll(async () => {
  await prisma.formalites.deleteMany({
    where: {
      user_id: {
        in: (await prisma.users.findMany({ where: { email: EMAIL }, select: { id: true } })).map(
          (u) => u.id
        ),
      },
    },
  });
  await prisma.sessions.deleteMany({ where: { users: { email: EMAIL } } });
  await prisma.users.deleteMany({ where: { email: EMAIL } });
});

test("le dossier se présente une fois, et une seule", async ({ page }) => {
  await expect(page.getByRole("region", { name: /STUDIO KERN/ })).toBeVisible();

  // Ni la ligne de chiffres, ni la table : ce sont des outils de comparaison.
  await expect(page.locator("dl[class*='indicateurs']")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Formalités en cours" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Reprendre" })).toHaveCount(0);
});

test("l'anneau porte l'avancement, et le bouton mène au parcours", async ({ page }) => {
  const heros = page.getByRole("region", { name: /STUDIO KERN/ });

  await expect(heros.getByText(/^\d+ %$/)).toBeVisible();
  await expect(heros.getByText("Avancement")).toBeVisible();
  await expect(heros.getByRole("link").first()).toHaveAttribute("href", /\/creation\?dossier=\d+/);
});

test("aucun cadre ne s'affiche pour dire qu'il est vide", async ({ page }) => {
  /*
   * « Aucune échéance à venir », « Aucune activité récente » : deux cadres pour dire
   * deux fois rien, sur un écran qui n'a qu'une chose à dire.
   */
  await expect(page.getByRole("heading", { name: "Échéances à venir" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Activité récente" })).toHaveCount(0);
  await expect(page.getByText("Aucune activité récente")).toHaveCount(0);
});

test("ce qui aide à avancer reste : la frise et l'interlocuteur", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Votre parcours" })).toBeVisible();
  await expect(page.getByText("Un avocat vous sera assigné")).toBeVisible();
  await expect(page.getByRole("link", { name: "Prendre une consultation" })).toBeVisible();
});

test("dès un second dossier, la disposition comparative revient", async ({ page }) => {
  const compte = await prisma.users.findUniqueOrThrow({ where: { email: EMAIL } });
  const second = await prisma.formalites.create({
    data: {
      user_id: compte.id,
      type: "modification",
      forme: "SARL",
      societe: "ATELIER MERIDIEN",
      status: "en_cours",
      phase: 1,
      offer: "business",
      data_json: "{}",
    },
  });

  try {
    await page.goto("/tableau-de-bord");
    await expect(page.getByRole("heading", { name: "Formalités en cours" })).toBeVisible();
    await expect(page.locator("dl[class*='indicateurs']")).toBeVisible();
  } finally {
    await prisma.formalites.delete({ where: { id: second.id } });
  }
});
