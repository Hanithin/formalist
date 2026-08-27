import path from "node:path";
import { test, expect } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/infrastructure/db/generated/client";
import { PARCOURS } from "../../src/domain/navigation/parcours";

/**
 * Le tableau de bord d'un compte qui vient de s'inscrire.
 *
 * C'est le premier écran de la plateforme, et il a longtemps menti par omission : il
 * proposait de créer une société ou une auto-entreprise, de rédiger un contrat, de
 * consulter un avocat - et rien d'autre. Un client venu transférer son siège ou clore
 * sa liquidation en repartait en croyant que Formalist ne savait pas le faire, alors
 * que les quatre parcours manquants étaient en production.
 *
 * Ces essais tiennent la règle : tout ce que le catalogue sait faire est proposé au
 * nouvel inscrit, sans exception.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

// Le préfixe « nouveau- » est celui que preparer.ts nettoie : un essai interrompu ne
// laisse pas de compte derrière lui.
const EMAIL = "nouveau-sans-dossier@exemple.test";
const MOT_DE_PASSE = "MotDePasseParcours2026!";

/*
 * Une session ouverte une fois, comme le fait preparer.ts pour le compte partagé.
 *
 * Se reconnecter à chaque essai déclenchait la limitation de débit : les tentatives
 * sont comptées, et cinq connexions d'affilée depuis la même adresse suffisent à
 * faire attendre les suivantes jusqu'au délai d'expiration.
 */
const SESSION = path.join(import.meta.dirname, "session-accueil-vide.json");
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
  // Même empreinte que le compte d'essai : on ne rejoue pas le hachage ici.
  const modele = await prisma.users.findUniqueOrThrow({
    where: { email: "parcours@exemple.test" },
  });

  await prisma.sessions.deleteMany({ where: { users: { email: EMAIL } } });
  await prisma.users.deleteMany({ where: { email: EMAIL } });
  await prisma.users.create({
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
  await prisma.sessions.deleteMany({ where: { users: { email: EMAIL } } });
  await prisma.users.deleteMany({ where: { email: EMAIL } });
});

test("les huit parcours du catalogue lui sont proposés", async ({ page }) => {
  // Le nom accessible du lien recommandé commence par sa pastille : on cherche le
  // titre où qu'il soit dans la carte, non en tête.
  for (const parcours of PARCOURS) {
    await expect(
      page.getByRole("link", { name: new RegExp(parcours.titre) }),
      parcours.titre
    ).toBeVisible();
  }
});

test("chaque carte mène à son parcours, et annonce son temps et son prix", async ({ page }) => {
  for (const parcours of PARCOURS) {
    const carte = page.getByRole("link", { name: new RegExp(parcours.titre) });
    await expect(carte, parcours.titre).toHaveAttribute("href", parcours.lien);
    await expect(carte, parcours.titre).toContainText(parcours.duree!);
    await expect(carte, parcours.titre).toContainText(parcours.prix!);
  }
});

test("les parcours sont rangés par moment de la vie d'une société", async ({ page }) => {
  for (const famille of ["Créer", "Gérer ma société", "Fermer", "Documents et conseil"]) {
    await expect(page.getByText(famille, { exact: true }), famille).toBeVisible();
  }
});

test("l'amorce n'impose pas la création à qui vient pour autre chose", async ({ page }) => {
  /*
   * « Première étape : créez votre société » contredisait la carte « Fermer ma
   * société » posée trois lignes plus bas.
   */
  /*
   * L'amorce s'écrit désormais « Aucune formalité en cours / Lancez votre première
   * démarche depuis le bouton de la colonne ». Ce que le test garde ne change pas :
   * elle n'impose aucun parcours, et surtout pas la création.
   */
  /*
   * L'accueil d'un compte sans dossier montre le catalogue entier, où figurent aussi
   * « Fermer ma société » et « Déposer mes comptes annuels ». Rien de ce qui l'entoure
   * ne doit présumer qu'on vient créer : ni l'amorce, ni la salutation.
   */
  await expect(page.getByText(/Voici tout ce que Formalist sait faire/)).toBeVisible();
  await expect(page.getByText(/Première étape/)).toHaveCount(0);
  await expect(page.getByText(/première société/i)).toHaveCount(0);
  await expect(page.getByText(/créez votre société/i)).toHaveCount(0);
});

test("une seule carte porte la recommandation", async ({ page }) => {
  await expect(page.getByText("Recommandé", { exact: true })).toHaveCount(1);
});
