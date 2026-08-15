import { test, expect } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/infrastructure/db/generated/client";

/**
 * Les avis, enfin lus.
 *
 * La table `notifications` existait et était alimentée à chaque geste de l'avocat.
 * Aucun écran ne la lisait, et aucun courriel ne partait : quelqu'un dont l'avocat
 * demandait des corrections ne l'apprenait qu'en revenant de lui-même sur le site.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? "",
    options: "-c timezone=UTC",
  }),
});

const crees: number[] = [];

test.describe("avis", () => {
  test.afterAll(async () => {
    if (crees.length > 0) {
      await prisma.notifications.deleteMany({ where: { id: { in: crees } } });
    }
    await prisma.$disconnect();
  });

  async function deposerUnAvis(contenu: string) {
    const compte = await prisma.users.findFirstOrThrow({
      where: { email: "parcours@exemple.test" },
    });
    const avis = await prisma.notifications.create({
      data: { user_id: compte.id, type: "corrections_demandees", content: contenu },
    });
    crees.push(avis.id);
    return avis;
  }

  test("la cloche montre les avis reçus et éteint son compte à l'ouverture", async ({ page }) => {
    const contenu = "Essai de notification " + Date.now();
    await deposerUnAvis(contenu);

    await page.goto("/aide");

    const cloche = page.getByRole("button", { name: /Notifications/ });
    await expect(cloche).toBeVisible();
    // Le compte se voit sans ouvrir : c'est tout l'intérêt d'une cloche.
    await expect(cloche).toHaveAttribute("aria-label", /non lues/);

    await cloche.click();
    const panneau = page.getByRole("dialog", { name: "Notifications" });
    await expect(panneau.getByText(contenu)).toBeVisible();

    // Ouvrir vaut lecture : le compteur ne reste pas allumé sur ce qu'on vient de lire.
    await expect(cloche).toHaveAttribute("aria-label", "Notifications");
    await page.reload();
    await expect(page.getByRole("button", { name: /Notifications/ })).toHaveAttribute(
      "aria-label",
      "Notifications"
    );
  });

  test("sans avis, la cloche le dit plutôt que de s'ouvrir sur du vide", async ({ page }) => {
    await prisma.notifications.deleteMany({
      where: { users: { email: "avocat-parcours@exemple.test" } },
    });

    const contexte = await page.context().browser()?.newContext({
      storageState: "./tests/parcours/session-avocat.json",
      baseURL: "http://localhost:3100",
    });
    const autre = await contexte!.newPage();

    await autre.goto("/aide");
    await autre.getByRole("button", { name: /Notifications/ }).click();
    await expect(autre.getByText(/Rien pour le moment/)).toBeVisible();

    await contexte!.close();
  });

  test.describe("sans session", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("les avis de quelqu'un ne sont pas publics", async ({ request }) => {
      expect((await request.get("/api/avis")).status()).toBe(401);
      expect((await request.put("/api/avis")).status()).toBe(401);
    });
  });
});
