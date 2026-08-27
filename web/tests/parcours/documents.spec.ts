import { choisir } from "./liste";
import { test, expect } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/infrastructure/db/generated/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? "",
    options: "-c timezone=UTC",
  }),
});

/**
 * La bibliothèque de documents.
 *
 * Ce qui compte ici est qu'on retrouve un document : il est rangé sous sa société, il
 * se cherche par le nom de l'une ou de l'autre, et ce qui attend une action se voit
 * avant le reste.
 */
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n");

test.describe("documents", () => {
  test("la page annonce ce qu'elle contient et range par société", async ({ page }) => {
    await page.goto("/documents");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Documents");
    await expect(page.getByText(/rangé par société/)).toBeVisible();

    // Les quatre filtres portent chacun leur décompte.
    for (const libelle of ["Tous", "Actes de société", "Contrats", "Mes dépôts"]) {
      await expect(page.getByRole("button", { name: new RegExp("^" + libelle) })).toBeVisible();
    }
  });

  test("déposer un document le range sous la société choisie", async ({ page }) => {
    await page.goto("/documents");
    await page.getByRole("button", { name: /Déposer un document/ }).click();

    const fenetre = page.getByRole("dialog", { name: "Déposer un document" });
    await fenetre.getByLabel("Nom du document").waitFor();

    await page.setInputFiles("#fichier", {
      name: "bail-parcours.pdf",
      mimeType: "application/pdf",
      buffer: PDF,
    });

    // Le nom du fichier sert de titre par défaut : on n'a pas à retaper ce qu'on
    // vient de choisir.
    await expect(fenetre.getByLabel("Nom du document")).toHaveValue("bail-parcours");

    const nom = "Bail parcours " + Date.now();
    await fenetre.getByLabel("Nom du document").fill(nom);

    /*
     * La liste n'est plus un `<select>` : ses choix ne sont lisibles qu'une fois le
     * menu ouvert - voir ChampChoix, et le calendrier avant lui.
     */
    const societe = fenetre.getByLabel("Société concernée");
    await societe.click();
    const menu = page.getByRole("listbox");
    const choix = menu.getByRole("option", { name: /^PARCOURS/ }).first();
    let cible: string | null = null;
    if (await choix.count()) {
      cible = (await choix.innerText()).trim();
      await choix.click();
    } else {
      await page.keyboard.press("Escape");
    }

    await fenetre.getByRole("button", { name: "Déposer", exact: true }).click();

    await expect(page.getByText(nom)).toBeVisible();
    if (cible) {
      // Il est bien sous sa société, et non dans les dépôts personnels.
      const groupe = page.locator("section").filter({ hasText: cible }).first();
      await expect(groupe.getByText(nom)).toBeVisible();
    }
  });

  test("un dépôt sans société rejoint les dépôts personnels", async ({ page }) => {
    await page.goto("/documents");
    await page.getByRole("button", { name: /Déposer un document/ }).click();

    const fenetre = page.getByRole("dialog", { name: "Déposer un document" });
    await page.setInputFiles("#fichier", {
      name: "personnel.pdf",
      mimeType: "application/pdf",
      buffer: PDF,
    });

    const nom = "Document personnel " + Date.now();
    await fenetre.getByLabel("Nom du document").fill(nom);
    await choisir(fenetre.getByLabel("Société concernée"), "Aucune - mes dépôts");
    await fenetre.getByRole("button", { name: "Déposer", exact: true }).click();

    await expect(page.getByText(nom)).toBeVisible();
    const personnels = page.locator("section").filter({ hasText: "Mes dépôts" }).last();
    await expect(personnels.getByText(nom)).toBeVisible();
  });

  test("le clic sur Télécharger ouvre l'aperçu, qui garde le téléchargement", async ({ page }) => {
    /*
     * Cinq actes portent des noms voisins : vérifier qu'on tient le bon supposait de
     * télécharger, d'ouvrir, puis de jeter le fichier.
     */
    await page.goto("/documents");

    const premier = page.getByRole("button", { name: "Télécharger", exact: true }).first();
    if ((await premier.count()) === 0) return; // aucun document avec fichier
    await premier.click();

    const apercu = page.getByRole("dialog", { name: /Aperçu de / });
    await expect(apercu).toBeVisible();
    await expect(apercu.getByRole("link", { name: "Télécharger" })).toHaveAttribute(
      "href",
      /telecharger=1/
    );

    await page.keyboard.press("Escape");
    await expect(apercu).toHaveCount(0);
  });

  test("une société se télécharge en une archive", async ({ page, request }) => {
    await page.goto("/documents");

    const archive = page.getByRole("link", { name: "Tout télécharger" }).first();
    if ((await archive.count()) === 0) return;

    const adresse = await archive.getAttribute("href");
    const reponse = await request.get(adresse!);

    expect(reponse.status()).toBe(200);
    expect(reponse.headers()["content-type"]).toContain("zip");
    // Une archive vide serait un fichier valide mais inutile.
    expect((await reponse.body()).length).toBeGreaterThan(200);
  });

  test("remplacer un document refusé se fait sans quitter la page", async ({ page }) => {
    /*
     * Ce test consomme ce qu'il vérifie : remplacer résout le rejet. Il travaille donc
     * sur son propre dossier, et non sur celui que prépare preparer.ts - sinon les
     * essais qui attendent un document refusé n'en trouvent plus, et échouent pour une
     * raison qui n'est pas la leur.
     */
    const compte = await prisma.users.findFirstOrThrow({
      where: { email: "parcours@exemple.test" },
    });

    const dossier = await prisma.formalites.create({
      data: {
        user_id: compte.id,
        type: "creation",
        forme: "SASU",
        societe: "REMPLACEMENT ESSAI",
        status: "en_cours",
        data_json: "{}",
      },
    });

    await prisma.documents.create({
      data: {
        formalite_id: dossier.id,
        name: "Pièce d'identité à refaire.pdf",
        type: "identite",
        file_path: "peu-importe.pdf",
        uploaded_by: "user",
        status: "uploaded",
        rejection_reason: "Document illisible",
      },
    });

    try {
      await page.goto("/documents");

      const groupe = page.locator("section").filter({ hasText: "REMPLACEMENT ESSAI" });
      /*
       * « exact » compte : la tête de groupe annonce « 1 à remplacer », et un sélecteur
       * approchant la désigne avant le bouton de la carte - on replierait le groupe au
       * lieu d'ouvrir la fenêtre.
       */
      await groupe.getByRole("button", { name: "Remplacer", exact: true }).click();

      const fenetre = page.getByRole("dialog", { name: "Remplacer le document" });
      // Le motif du refus est redit : on dépose en connaissance de cause.
      await expect(fenetre.getByText(/a été refusé/)).toBeVisible();

      await page.setInputFiles("#fichier", {
        name: "nouvelle-piece.pdf",
        mimeType: "application/pdf",
        buffer: PDF,
      });
      await fenetre.getByRole("button", { name: /Envoyer la nouvelle version/ }).click();

      // Ce qui se passe ensuite est dit : sans cela, on croit l'affaire close.
      await expect(page.getByRole("status")).toContainText("L'avocat le vérifie");
      await expect(page).toHaveURL(/\/documents$/);

      // Et le rejet cesse de réclamer une action, puisqu'une pièce l'a remplacé.
      await expect(groupe.getByText("À remplacer")).toHaveCount(0);
    } finally {
      // Le dépôt inscrit le fichier au registre : cette ligne référence le dossier et
      // doit partir avant lui.
      await prisma.uploaded_files.deleteMany({ where: { formalite_id: dossier.id } });
      await prisma.documents.deleteMany({ where: { formalite_id: dossier.id } });
      await prisma.audit_log.deleteMany({ where: { formalite_id: dossier.id } });
      await prisma.formalites.delete({ where: { id: dossier.id } });
    }
  });

  test("un filtre sans document le dit et offre une sortie", async ({ page }) => {
    await page.goto("/documents");
    await page.getByRole("button", { name: /^Contrats/ }).click();

    const contrats = await page.getByRole("button", { name: /^Contrats/ }).textContent();

    // Le compte-e n'a pas de contrat signé : le filtre doit rendre l'écran vide.
    if (contrats?.trim().endsWith("0")) {
      await expect(page.getByText(/Aucun document dans/)).toBeVisible();
      await page.getByRole("button", { name: /Voir tous les documents/ }).click();
      await expect(page.getByText(/Aucun document dans/)).toHaveCount(0);
    }
  });

  test("un fichier dont le contenu ne correspond pas est refusé, avec son motif", async ({
    page,
  }) => {
    await page.goto("/documents");
    await page.getByRole("button", { name: /Déposer un document/ }).click();

    const fenetre = page.getByRole("dialog", { name: "Déposer un document" });
    await page.setInputFiles("#fichier", {
      name: "faux.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("ceci est du texte, pas un PDF"),
    });
    await fenetre.getByLabel("Nom du document").fill("Faux document");
    await fenetre.getByRole("button", { name: "Déposer", exact: true }).click();

    await expect(fenetre.getByRole("alert")).toContainText("ne correspond pas");
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test.describe("sans session", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("rien n'est accessible", async ({ request }) => {
      expect((await request.post("/api/documents")).status()).toBe(401);
    });
  });
});
