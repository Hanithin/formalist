import { test, expect } from "@playwright/test";
import { prisma } from "../../src/infrastructure/db/client";

/**
 * Le parcours de l'avocat sur une modification.
 *
 * L'espace avocat était celui de la création, réemployé tel quel : cinq onglets, une
 * colonne de sous-phases, un vocabulaire de Kbis, et rien sur les statuts. L'avocat
 * qui prenait un dossier de modification ne savait pas par où commencer.
 */
test.describe.configure({ mode: "serial" });
test.use({ storageState: "./tests/parcours/session-avocat.json" });

const DONNEES = {
  codes: ["transfert_siege", "dirigeant"],
  societe: {
    denomination: "AVOCAT ESSAI MODIF",
    forme: "SAS",
    siren: "899979934",
    adresse: "34 rue Laugier",
    codePostal: "75017",
    ville: "Paris",
    capital: 10000,
  },
  valeurs: {
    nouvelleAdresse: "5 avenue Victor Hugo",
    nouvelleVille: "Lyon",
    nouveauCodePostal: "69003",
    dateEffetTransfert: "2026-09-15",
    typeChangementDirigeant: "Nomination",
    fonctionDirigeant: "Président",
    dateEffetDirigeant: "2026-09-15",
    nouveauDirigeantCivilite: "Monsieur",
    nouveauDirigeantPrenom: "Paul",
    nouveauDirigeantNom: "BERNARD",
    nouveauDirigeantAdresse: "3 rue des Lilas, 33000 Bordeaux",
    // L'état civil complet : un dossier réglé l'est forcément, la route de paiement
    // le vérifie avant d'encaisser.
    nouveauDirigeantDateNaissance: "1980-04-12",
    nouveauDirigeantLieuNaissance: "Bordeaux, France",
    nouveauDirigeantNomPere: "Michel BERNARD",
    nouveauDirigeantNomMere: "Anne LEROY",
  },
  assemblee: { date: "2026-09-01", associes: [{ civilite: "Monsieur", prenom: "Jean", nom: "DUPONT", parts: 1000 }] },
  paye: true,
};

const semes: number[] = [];

async function dossierDeModification(sousPhase = "5a") {
  const client = await prisma.users.findFirstOrThrow({
    where: { email: { contains: "parcours" }, NOT: { email: { contains: "avocat" } } },
  });
  /*
   * Le dossier est assigné : c'est l'état d'un dossier que l'avocat vient d'accepter.
   * Sans assignation il peut le lire, non y écrire - et produire les actes échouerait
   * sans que le test dise pourquoi.
   */
  const avocat = await prisma.users.findFirstOrThrow({
    where: { email: { contains: "avocat" } },
  });

  const dossier = await prisma.formalites.create({
    data: {
      user_id: client.id,
      assigned_avocat_id: avocat.id,
      type: "modification",
      forme: "SAS",
      societe: "AVOCAT ESSAI MODIF",
      status: "en_attente_validation",
      phase: 5,
      business_sub_phase: sousPhase,
      data_json: JSON.stringify(DONNEES),
    },
  });
  semes.push(dossier.id);
  return dossier.id;
}

test.afterAll(async () => {
  if (semes.length > 0) {
    await prisma.audit_log.deleteMany({ where: { formalite_id: { in: semes } } });
    await prisma.documents.deleteMany({ where: { formalite_id: { in: semes } } });
    await prisma.formalites.deleteMany({ where: { id: { in: semes } } });
  }
});

test("le dossier s'ouvre sur ce qu'il reste à faire", async ({ page }) => {
  // Non sur le récapitulatif : l'avocat veut savoir par où commencer, pas relire.
  const dossier = await dossierDeModification();
  await page.goto("/avocat/" + dossier);

  await expect(page.getByRole("heading", { name: /choses à faire/ })).toBeVisible();
  await expect(page.getByText("Vérifier les informations du dossier")).toBeVisible();
  await expect(page.getByText("Mettre les statuts à jour")).toBeVisible();
});

test("le vocabulaire est celui d'une modification, pas d'une création", async ({ page }) => {
  const dossier = await dossierDeModification();
  await page.goto("/avocat/" + dossier);

  // Le greffe délivre un extrait à jour : la société existe déjà.
  await expect(page.getByText(/Remettre extrait à jour/)).toBeVisible();
  await expect(page.getByText("Remettre extrait kbis")).toHaveCount(0);
});

test("une tâche qui attend autre chose dit quoi", async ({ page }) => {
  /*
   * Publier avant d'avoir vérifié fait republier à ses frais : le dire vaut mieux que
   * de griser sans un mot.
   */
  const dossier = await dossierDeModification();
  await page.goto("/avocat/" + dossier);

  await expect(page.getByText(/Vérifiez d'abord le dossier/)).toBeVisible();
  await expect(page.getByText(/Les statuts en vigueur ne sont pas au dossier/)).toBeVisible();
});

test("les deux avis sont rédigés, et ils diffèrent", async ({ page }) => {
  /*
   * Le siège change de ressort : l'avis de départ annonce la radiation, celui
   * d'arrivée l'immatriculation. Publier deux fois le même est la faute courante.
   */
  const dossier = await dossierDeModification();
  await page.goto("/avocat/" + dossier + "?onglet=annonce");

  await expect(page.getByRole("heading", { name: /2 avis à publier/ })).toBeVisible();

  const textes = await page.locator("pre").allTextContents();
  expect(textes).toHaveLength(2);
  expect(textes[0]).toContain("radiée du registre du commerce et des sociétés de Paris");
  expect(textes[1]).toContain("immatriculée au registre du commerce et des sociétés de Lyon");
  expect(textes[0]).not.toBe(textes[1]);

  // Le texte porte l'identité de la société et la décision.
  expect(textes[0]).toContain("899 979 934 RCS Paris");
  expect(textes[0]).toContain("1er septembre 2026");
  expect(textes[0]).toContain("Pour avis, le Président.");
});

test("la publication se déclare, et le suivi du client avance", async ({ page }) => {
  // Il n'y a pas d'attestation de parution : le client a payé pour ne pas s'en occuper.
  const dossier = await dossierDeModification("5c");
  await page.goto("/avocat/" + dossier + "?onglet=annonce");

  await page.getByRole("button", { name: "Marquer comme publiés" }).click();
  await expect(page.getByText("Publication déclarée")).toBeVisible();

  const apres = await prisma.formalites.findUniqueOrThrow({ where: { id: dossier } });
  expect(JSON.parse(apres.data_json ?? "{}").avisPublies).toBe(true);
});

test("l'avocat produit les actes depuis le fil de travail", async ({ page }) => {
  const dossier = await dossierDeModification();
  await page.goto("/avocat/" + dossier);

  await page.getByRole("button", { name: "Produire les actes" }).click();
  await expect(page.getByRole("status")).toContainText("actes produits", { timeout: 20_000 });

  const produits = await prisma.documents.count({
    where: { formalite_id: dossier, uploaded_by: "system" },
  });
  expect(produits).toBeGreaterThan(0);
});

test("un dossier incomplet refuse la production, en disant ce qui manque", async ({ page }) => {
  /*
   * Un acte à trous part au greffe en l'état. Le refus arrive ici, sur l'écran de
   * l'avocat, plutôt que des semaines plus tard par courrier du greffe.
   */
  const client = await prisma.users.findFirstOrThrow({
    where: { email: { contains: "parcours" }, NOT: { email: { contains: "avocat" } } },
  });
  const avocat = await prisma.users.findFirstOrThrow({ where: { email: { contains: "avocat" } } });
  const troue = await prisma.formalites.create({
    data: {
      user_id: client.id,
      assigned_avocat_id: avocat.id,
      type: "modification",
      forme: "SAS",
      societe: "AVOCAT ESSAI TROUE",
      status: "en_attente_validation",
      phase: 5,
      business_sub_phase: "5a",
      data_json: JSON.stringify({
        ...DONNEES,
        valeurs: { ...DONNEES.valeurs, nouveauDirigeantNomPere: "", nouveauDirigeantNomMere: "" },
      }),
    },
  });
  semes.push(troue.id);

  await page.goto("/avocat/" + troue.id);
  await page.getByRole("button", { name: "Produire les actes" }).click();

  await expect(page.getByRole("alert").filter({ hasText: /incomplet/ })).toBeVisible();
  expect(await prisma.documents.count({ where: { formalite_id: troue.id } })).toBe(0);
});

test("sans statuts au dossier, l'onglet le dit au lieu de planter", async ({ page }) => {
  const dossier = await dossierDeModification();
  await page.goto("/avocat/" + dossier + "?onglet=statuts");

  // Le signaleur de navigation de Next porte aussi role="alert", vide : on vise le refus.
  await expect(page.getByRole("alert").filter({ hasText: /statuts/i })).toBeVisible();
});

test("un dossier de création ne montre ni statuts ni annonce à retoucher", async ({ page }) => {
  // Ces deux écrans ne concernent que les modifications : le dire vaut mieux qu'un
  // écran vide où l'on cherche ce qui manque.
  const client = await prisma.users.findFirstOrThrow({ where: { email: { contains: "parcours" } } });
  const avocat = await prisma.users.findFirstOrThrow({ where: { email: { contains: "avocat" } } });
  const creation = await prisma.formalites.create({
    data: {
      user_id: client.id,
      assigned_avocat_id: avocat.id,
      type: "creation",
      forme: "SASU",
      societe: "AVOCAT ESSAI CREATION",
      status: "en_attente_validation",
      phase: 5,
      business_sub_phase: "5a",
      data_json: JSON.stringify({ denomination: "AVOCAT ESSAI CREATION", forme: "SASU" }),
    },
  });
  semes.push(creation.id);

  await page.goto("/avocat/" + creation.id + "?onglet=statuts");
  await expect(page.getByText(/ne concerne que les modifications/)).toBeVisible();

  await page.goto("/avocat/" + creation.id + "?onglet=annonce");
  await expect(page.getByText(/publiée par le client/)).toBeVisible();
});

test("le cabinet peut déposer les statuts lui-même", async ({ page }) => {
  /*
   * Une fois le dossier réglé, le client est renvoyé vers ses formalités : il ne peut
   * plus rien y déposer. Sans ce dépôt côté cabinet, un dossier arrivé sans statuts
   * restait bloqué - personne ne pouvait les y mettre, et l'écran se contentait de
   * dire qu'ils manquaient.
   */
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const dossier = await dossierDeModification();

  await page.goto("/avocat/" + dossier + "?onglet=statuts");
  await expect(page.getByRole("alert").filter({ hasText: /statuts/i })).toBeVisible();

  const document = await PDFDocument.create();
  const police = await document.embedFont(StandardFonts.Helvetica);
  document
    .addPage([595, 842])
    .drawText("Le siege social est fixe au 34 rue Laugier, 75017 Paris.", {
      x: 60,
      y: 700,
      size: 11,
      font: police,
    });

  await page.setInputFiles('input[type="file"]', {
    name: "statuts.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await document.save()),
  });

  await expect(page.getByRole("status")).toContainText("Statuts reçus", { timeout: 30_000 });

  const depose = await prisma.documents.count({
    where: { formalite_id: dossier, name: "Statuts en vigueur" },
  });
  expect(depose).toBe(1);
});

test("le placement des cadres survit à un rechargement", async ({ page, request }) => {
  /*
   * Les retouches ne vivaient qu'en mémoire jusqu'au clic sur « Appliquer » : un
   * rafraîchissement, un onglet fermé, un retour en arrière, et tout le travail de
   * placement disparaissait sans un mot.
   */
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const dossier = await dossierDeModification();

  const acte = await PDFDocument.create();
  const police = await acte.embedFont(StandardFonts.TimesRoman);
  acte.addPage([595, 842]).drawText("Le siege social est fixe au 34 rue Laugier, 75017 Paris.", {
    x: 60,
    y: 700,
    size: 11,
    font: police,
  });

  await request.post("/api/formalites/modification/statuts/depot", {
    multipart: {
      dossier: String(dossier),
      fichier: {
        name: "statuts.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(await acte.save()),
      },
    },
  });

  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/avocat/" + dossier + "?onglet=statuts");

  /*
   * On attend que l'image de la page soit rendue avant de viser.
   *
   * Les cadres se posent dessus en pourcentages : tant qu'elle n'a pas sa hauteur,
   * ils sont ailleurs, et le clic tombe à côté.
   */
  await page.waitForFunction(
    () => {
      const image = document.querySelector("[class*='editeurPage'] img") as HTMLImageElement | null;
      return !!image && image.naturalWidth > 0 && image.getBoundingClientRect().height > 100;
    },
    { timeout: 30_000 }
  );

  // Le cadre lui-même, non le texte qu'il contient : c'est lui qui porte la boîte.
  const cadre = page.locator("div[class*='repere']").first();
  await expect(cadre).toBeVisible({ timeout: 30_000 });

  const boite = (await cadre.boundingBox())!;
  await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await page.mouse.down();
  await page.mouse.up();

  const saisie = page.locator("input[class*='repereSaisie']");
  await saisie.fill("5 avenue Victor Hugo, 69003 Lyon");
  await page.mouse.click(200, 950);

  // Le temps de repos de l'enregistrement, puis un rechargement complet.
  await page.waitForTimeout(1600);
  await page.reload();

  /*
   * On attend la liste des remplacements, non le cadre : celui-ci se pose sur l'image
   * de la page, qui met un instant à être rendue, et un cadre posé sur une image de
   * hauteur nulle n'est pas encore visible.
   */
  await expect(page.locator("[class*='remplacement']").first()).toBeVisible({ timeout: 30_000 });

  const textes = await page.locator("div[class*='repere']").allTextContents();
  expect(textes.join(" ")).toContain("5 avenue Victor Hugo, 69003 Lyon");
});
