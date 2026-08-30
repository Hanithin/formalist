import { test, expect } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/infrastructure/db/generated/client";

/**
 * Les contrats, refaits pour être compris sans vocabulaire juridique.
 *
 * Ce que ces essais vérifient est ce qui manquait : qu'on sache à quelle étape en est
 * un contrat, à qui la main, et qu'on puisse en demander un sans savoir ce qu'est un
 * « état en_validation ».
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? "",
    options: "-c timezone=UTC",
  }),
});

const crees: number[] = [];

/**
 * Le contrat de ce test, retrouvé par ce qu'il contient.
 *
 * « Le dernier créé » ne suffit pas : les essais tournent en parallèle et deux
 * contrats naissent à la même seconde - chacun lisait alors celui de l'autre, et
 * l'état vérifié n'était pas celui qu'on venait de demander.
 */
async function contratDe(marque: string) {
  return prisma.contrats.findFirstOrThrow({
    where: { data_json: { contains: marque } },
    orderBy: { id: "desc" },
  });
}

test.describe("contrats", () => {
  test.afterAll(async () => {
    if (crees.length > 0) {
      await prisma.contrats.deleteMany({ where: { id: { in: crees } } });
    }
    await prisma.$disconnect();
  });

  test("la page explique le parcours et parle français", async ({ page }) => {
    await page.goto("/contrats");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Contrats");

    /*
     * Les filtres posent des questions, ils ne récitent pas des états techniques - et
     * un filtre sans contrat ne s'affiche pas. Le test énumérait les quatre et échouait
     * dès que le compte n'avait rien en relecture, ce qui est le cas ordinaire.
     */
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

    // Et nulle part le vocabulaire de la base.
    await expect(page.getByText("en_validation")).toHaveCount(0);
    await expect(page.getByText("brouillon", { exact: true })).toHaveCount(0);
  });

  test("le geste de rédaction reste offert, quel que soit le filtre", async ({ page }) => {
    /*
     * « Nouveau contrat » terminait la barre de filtres, entre des pastilles qui ne lui
     * ressemblaient pas : on le prenait pour un filtre de plus, et il défilait avec la
     * liste. Il tient maintenant le pied de la colonne, qui ne bouge pas.
     */
    await page.goto("/contrats");

    const colonne = page.getByRole("complementary", { name: "Rédiger un contrat" });
    await expect(colonne).toBeVisible();
    await expect(colonne.getByRole("button", { name: "Nouveau contrat" })).toBeVisible();

    // Un filtre qui ne retient rien ne l'emporte pas avec lui.
    await page.getByRole("button", { name: /^Tous/ }).click();
    await expect(colonne.getByRole("button", { name: "Nouveau contrat" })).toBeVisible();
  });

  test("demander le document seul le rend disponible tout de suite", async ({ page }) => {
    await page.goto("/contrats");
    await page.getByRole("button", { name: /Nouveau contrat/ }).click();

    const assistant = page.getByRole("dialog", { name: "Nouveau contrat" });
    await expect(assistant.getByText("De quoi avez-vous besoin ?")).toBeVisible();

    await assistant.getByRole("button", { name: /Bail commercial/ }).click();
    await assistant.getByRole("button", { name: "Continuer" }).click();

    // On demande des informations, jamais de clause : c'est le travail de l'avocat.
    await expect(assistant.getByText(/aucune clause à rédiger/)).toBeVisible();

    await assistant.getByLabel("Première partie").fill("SASU ESSAI PARCOURS");
    await assistant.getByLabel("Seconde partie").fill("SCI ESSAI");
    await assistant.getByLabel("Adresse du local").fill("1 rue de l'Essai, 75001 Paris");
    await assistant.getByLabel(/Loyer mensuel/).fill("1500");
    await assistant.getByLabel(/Date de prise d'effet/).fill("2026-10-01");
    await assistant.getByRole("button", { name: "Continuer" }).click();

    // Deux offres, et la signature annoncée comme se faisant ailleurs.
    await expect(assistant.getByText("Que voulez-vous ?")).toBeVisible();
    await expect(assistant.getByText(/signature se fait hors de Formalist/)).toBeVisible();
    await assistant.getByRole("button", { name: /Le document seul/ }).click();
    await assistant.getByRole("button", { name: "Continuer" }).click();

    await expect(assistant.getByText(/rédigé immédiatement/)).toBeVisible();
    await assistant.getByRole("button", { name: /Obtenir le document/ }).click();

    await expect(page.getByRole("status")).toContainText("Contrat prêt");

    const contrat = await contratDe("SASU ESSAI PARCOURS");
    crees.push(contrat.id);
    // Le document seul s'arrête là : il ne part pas chez l'avocat.
    expect(contrat.status).toBe("genere");
  });

  test("demander une relecture l'envoie à l'avocat", async ({ page }) => {
    await page.goto("/contrats");
    await page.getByRole("button", { name: /Nouveau contrat/ }).click();

    const assistant = page.getByRole("dialog", { name: "Nouveau contrat" });
    await assistant.getByRole("button", { name: /Bail commercial/ }).click();
    await assistant.getByRole("button", { name: "Continuer" }).click();

    await assistant.getByLabel("Première partie").fill("SASU ESSAI RELECTURE");
    await assistant.getByLabel("Seconde partie").fill("SCI ESSAI");
    await assistant.getByLabel("Adresse du local").fill("2 rue de l'Essai, 75002 Paris");
    await assistant.getByLabel(/Loyer mensuel/).fill("1200");
    await assistant.getByLabel(/Date de prise d'effet/).fill("2026-11-01");
    await assistant.getByRole("button", { name: "Continuer" }).click();

    await assistant.getByRole("button", { name: /Relu par un avocat/ }).click();
    await assistant.getByRole("button", { name: "Continuer" }).click();
    await assistant.getByRole("button", { name: /Envoyer à l'avocat/ }).click();

    await expect(page.getByRole("status")).toContainText("envoyé à l'avocat");
    await expect(page.getByText("En relecture").first()).toBeVisible();

    const contrat = await contratDe("SASU ESSAI RELECTURE");
    crees.push(contrat.id);
    expect(contrat.status).toBe("en_validation");
  });

  test("l'offre doit être choisie avant d'aller plus loin", async ({ page }) => {
    await page.goto("/contrats");
    await page.getByRole("button", { name: /Nouveau contrat/ }).click();

    const assistant = page.getByRole("dialog", { name: "Nouveau contrat" });
    await assistant.getByRole("button", { name: /Bail commercial/ }).click();
    await assistant.getByRole("button", { name: "Continuer" }).click();

    await assistant.getByLabel("Première partie").fill("A");
    await assistant.getByLabel("Seconde partie").fill("B");
    await assistant.getByLabel("Adresse du local").fill("1 rue de l'Essai");
    await assistant.getByLabel(/Loyer mensuel/).fill("900");
    await assistant.getByLabel(/Date de prise d'effet/).fill("2026-10-01");
    await assistant.getByRole("button", { name: "Continuer" }).click();

    await assistant.getByRole("button", { name: "Continuer" }).click();
    await expect(assistant.getByRole("alert")).toContainText("Choisissez ce que vous voulez");
  });

  test("un champ manquant est signalé sur le champ, avant l'envoi", async ({ page }) => {
    await page.goto("/contrats");
    await page.getByRole("button", { name: /Nouveau contrat/ }).click();

    const assistant = page.getByRole("dialog", { name: "Nouveau contrat" });
    await assistant.getByRole("button", { name: /Bail commercial/ }).click();
    await assistant.getByRole("button", { name: "Continuer" }).click();
    await assistant.getByRole("button", { name: "Continuer" }).click();

    // La vérification est celle du domaine : la même que le serveur appliquera.
    await expect(assistant.getByText(/Première partie est requis/)).toBeVisible();
    await expect(assistant.getByText(/part chez l'avocat/)).toHaveCount(0);
  });

  test("l'étape choisir n'accepte pas de continuer sans choix", async ({ page }) => {
    await page.goto("/contrats");
    await page.getByRole("button", { name: /Nouveau contrat/ }).click();

    const assistant = page.getByRole("dialog", { name: "Nouveau contrat" });
    await assistant.getByRole("button", { name: "Continuer" }).click();

    await expect(assistant.getByRole("alert")).toContainText("Choisissez");
  });

  test("un contrat à compléter se reprend là où il en était", async ({ page }) => {
    /*
     * Le brouillon rouvre l'assistant avec ce qui avait été saisi : le laisser vide
     * obligerait à tout ressaisir pour un seul champ manquant.
     */
    const compte = await prisma.users.findFirstOrThrow({
      where: { email: "parcours@exemple.test" },
    });
    const contrat = await prisma.contrats.create({
      data: {
        user_id: compte.id,
        type: "prestation",
        titre: "Prestation à finir",
        status: "brouillon",
        data_json: JSON.stringify({ partieA: "DEJA SAISI" }),
      },
    });
    crees.push(contrat.id);

    await page.goto("/contrats");
    const ligne = page.locator("div").filter({ hasText: "Prestation à finir" }).last();
    await ligne.getByRole("button", { name: "Compléter" }).click();

    const assistant = page.getByRole("dialog", { name: "Compléter le contrat" });
    await expect(assistant.getByLabel("Première partie")).toHaveValue("DEJA SAISI");
  });

  test.describe("sans session", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("rien n'est accessible", async ({ request }) => {
      expect((await request.get("/api/contrats")).status()).toBe(401);
      expect((await request.post("/api/contrats", { data: { type: "cdi" } })).status()).toBe(401);
    });
  });
});
