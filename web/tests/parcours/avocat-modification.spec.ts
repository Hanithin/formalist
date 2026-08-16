import { test, expect } from "@playwright/test";
import { prisma } from "../../src/infrastructure/db/client";
import { COMPTE } from "./preparer";

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
  // Le compte exact : « admin-parcours@exemple.test » contient lui aussi « parcours »,
  // et la recherche approchante rendait tantôt l'un, tantôt l'autre.
  const client = await prisma.users.findUniqueOrThrow({ where: { email: COMPTE.email } });
  /*
   * Le dossier est assigné : c'est l'état d'un dossier que l'avocat vient d'accepter.
   * Sans assignation il peut le lire, non y écrire - et produire les actes échouerait
   * sans que le test dise pourquoi.
   */
  const avocat = await prisma.users.findFirstOrThrow({
    where: { email: { startsWith: "avocat-parcours" } },
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
  // Le compte exact : « admin-parcours@exemple.test » contient lui aussi « parcours »,
  // et la recherche approchante rendait tantôt l'un, tantôt l'autre.
  const client = await prisma.users.findUniqueOrThrow({ where: { email: COMPTE.email } });
  const avocat = await prisma.users.findFirstOrThrow({
    where: { email: { startsWith: "avocat-parcours" } },
  });
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
  const client = await prisma.users.findUniqueOrThrow({ where: { email: COMPTE.email } });
  const avocat = await prisma.users.findFirstOrThrow({
    where: { email: { startsWith: "avocat-parcours" } },
  });
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

  const saisie = page.getByRole("textbox", { name: "Texte du cadre" });
  await saisie.fill("5 avenue Victor Hugo, 69003 Lyon");
  await page.mouse.click(200, 950);

  // Le temps de repos de l'enregistrement, puis un rechargement complet.
  await page.waitForTimeout(1600);
  await page.reload();

  /*
   * On attend le suivi du panneau, non le cadre : celui-ci se pose sur l'image de la
   * page, qui met un instant à être rendue, et un cadre posé sur une image de hauteur
   * nulle n'est pas encore visible.
   */
  await expect(page.locator("[class*='suiviCarte']").first()).toBeVisible({ timeout: 30_000 });

  const textes = await page.locator("div[class*='repere']").allTextContents();
  expect(textes.join(" ")).toContain("5 avenue Victor Hugo, 69003 Lyon");
});

test("l'historique dit qui a fait quoi, et on revient dessus", async ({ page, request }) => {
  /*
   * Une page écartée par mégarde, un cadre posé au mauvais endroit : sans trace, la
   * seule sortie était de tout refaire de mémoire. L'historique nomme chaque geste,
   * son heure et son auteur, et l'on s'y replace dans les deux sens.
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
  // Deux pages : on ne peut pas juger d'un retrait de page sur un document qui n'en a qu'une.
  acte.addPage([595, 842]).drawText("Annexe : liste des souscripteurs.", {
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

  await page.waitForFunction(
    () => {
      const image = document.querySelector("[class*='editeurPage'] img") as HTMLImageElement | null;
      return !!image && image.naturalWidth > 0 && image.getBoundingClientRect().height > 100;
    },
    { timeout: 30_000 }
  );

  // Le suivi s'atteint avant d'avoir rien fait : sinon on ne le découvre jamais.
  await expect(page.getByRole("button", { name: "Historique" })).toBeVisible();

  // Premier geste : on écrit dans le cadre repéré, pour avoir un état où revenir.
  const cadre = page.locator("div[class*='repere']").first();
  await expect(cadre).toBeVisible({ timeout: 30_000 });
  const boite = (await cadre.boundingBox())!;
  await page.mouse.click(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await page
    .getByRole("textbox", { name: "Texte du cadre" })
    .fill("5 avenue Victor Hugo, 69003 Lyon (bureau 4)");
  await page.mouse.click(200, 950);
  await page.waitForTimeout(1600);

  // Second geste : la page 2 est écartée par mégarde.
  await page.getByRole("button", { name: "Page suivante" }).click();
  await page.getByRole("button", { name: "Retirer cette page" }).click();
  await page.waitForTimeout(1600);

  const ecartee = JSON.parse(
    (await prisma.formalites.findUniqueOrThrow({ where: { id: dossier } })).data_json ?? "{}"
  );
  expect(ecartee.pagesRetirees).toEqual([2]);

  // L'historique nomme le geste, son heure et son auteur.
  await page.getByRole("button", { name: "Historique" }).click();
  await expect(page.getByText("Page 2 écartée")).toBeVisible();
  await expect(page.getByText("Texte réécrit page 1")).toBeVisible();
  // L'état de départ est là, lui aussi : on peut revenir à la proposition d'origine.
  await expect(page.getByText(/passages? repéré/)).toBeVisible();
  const quand = await page.locator("[class*='historiqueQuand']").first().textContent();
  expect(quand).toMatch(/\d{2}:\d{2}/);
  expect(quand).toMatch(/Avocat|avocat|Maître|Parcours/i);

  // On revient en arrière : la page est remise, et l'état enregistré la reprend.
  await page.getByRole("button", { name: "Revenir en arrière" }).click();
  await expect(page.getByRole("button", { name: "Remettre cette page" })).toHaveCount(0);

  const revenu = JSON.parse(
    (await prisma.formalites.findUniqueOrThrow({ where: { id: dossier } })).data_json ?? "{}"
  );
  expect(revenu.pagesRetirees).toEqual([]);

  // Et en avant : finalement, ce n'était pas une erreur.
  await page.getByRole("button", { name: "Revenir en avant" }).click();
  await expect(page.getByRole("button", { name: "Remettre cette page" })).toBeVisible();

  const refait = JSON.parse(
    (await prisma.formalites.findUniqueOrThrow({ where: { id: dossier } })).data_json ?? "{}"
  );
  expect(refait.pagesRetirees).toEqual([2]);
});

test("la barre du dossier est alignée, et le retour n'est pas souligné", async ({ page }) => {
  /*
   * Les badges portaient la marge basse de leur usage en tête de fiche : dans une
   * rangée centrée, elle les remontait de dix points et la barre paraissait de
   * travers. Le lien de retour, lui, gardait le souligné du navigateur dans un bouton.
   */
  const dossier = await dossierDeModification();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/avocat/" + dossier);

  const titre = (await page.locator("h1").first().boundingBox())!;
  const badges = (await page.locator("[class*='detailBadges']").first().boundingBox())!;
  const retour = page.getByRole("link", { name: /Tous les dossiers/ });
  const boite = (await retour.boundingBox())!;

  const milieu = (b: { y: number; height: number }) => b.y + b.height / 2;
  expect(Math.abs(milieu(titre) - milieu(badges))).toBeLessThan(2);
  expect(Math.abs(milieu(titre) - milieu(boite))).toBeLessThan(2);

  const souligne = await retour.evaluate((n) => getComputedStyle(n).textDecorationLine);
  expect(souligne).toBe("none");

  // Les trois badges ont la même hauteur : c'est la couleur qui les distingue, non la forme.
  const hauteurs = await page
    .locator("[class*='detailBadges'] > span")
    .evaluateAll((noeuds) => noeuds.map((n) => Math.round(n.getBoundingClientRect().height)));
  expect(new Set(hauteurs).size).toBe(1);
});

/** Des statuts qui nomment la société sur deux pages, comme tout acte réel. */
async function statutsAvecDeuxOccurrences() {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const acte = await PDFDocument.create();
  const police = await acte.embedFont(StandardFonts.TimesRoman);

  for (const lignes of [
    ["AVOCAT ESSAI MODIF", "Societe par actions simplifiee au capital de 10 000 euros"],
    ["ARTICLE 2 - DUREE", "La duree de la Societe est de 99 annees."],
    ["Pour AVOCAT ESSAI MODIF", "Le President"],
  ]) {
    const page = acte.addPage([595, 842]);
    lignes.forEach((ligne, rang) =>
      page.drawText(ligne, { x: 60, y: 700 - rang * 30, size: 12, font: police })
    );
  }
  return Buffer.from(await acte.save());
}

async function dossierANommer() {
  // Le compte exact : « admin-parcours@exemple.test » contient lui aussi « parcours »,
  // et la recherche approchante rendait tantôt l'un, tantôt l'autre.
  const client = await prisma.users.findUniqueOrThrow({ where: { email: COMPTE.email } });
  const avocat = await prisma.users.findFirstOrThrow({
    where: { email: { startsWith: "avocat-parcours" } },
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
      business_sub_phase: "5a",
      data_json: JSON.stringify({
        codes: ["denomination"],
        societe: { denomination: "AVOCAT ESSAI MODIF", forme: "SAS", siren: "899979934" },
        valeurs: { nouvelleDenomination: "NOUVEAU NOM", dateEffetDenomination: "2026-09-01" },
        assemblee: { date: "2026-09-01" },
        paye: true,
      }),
    },
  });
  semes.push(dossier.id);
  return dossier.id;
}

test("le suivi compte les changements, non les cadres", async ({ page, request }) => {
  /*
   * « 2 sur 2 remplacements posés » s'affichait à côté d'une durée qui n'était pas
   * faite : le décompte des cadres ne dit rien de l'avancement. Et l'on ne repérait
   * que la première occurrence d'un nom qui figure partout dans l'acte - le document
   * serait parti au greffe avec l'ancien nom à toutes les autres pages.
   */
  const dossier = await dossierANommer();
  await request.post("/api/formalites/modification/statuts/depot", {
    multipart: {
      dossier: String(dossier),
      fichier: {
        name: "statuts.pdf",
        mimeType: "application/pdf",
        buffer: await statutsAvecDeuxOccurrences(),
      },
    },
  });

  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/avocat/" + dossier + "?onglet=statuts");

  await page.waitForFunction(
    () => {
      const image = document.querySelector("[class*='editeurPage'] img") as HTMLImageElement | null;
      return !!image && image.naturalWidth > 0 && image.getBoundingClientRect().height > 100;
    },
    { timeout: 30_000 }
  );

  // Les deux occurrences sont vues, non la première seule.
  await expect(page.getByText("2 sur 2 emplacements couverts")).toBeVisible();
  // L'écran s'ouvre sur le travail à faire, non sur un zéro.
  await expect(page.getByText("changement à vérifier")).toBeVisible();
  await expect(page.getByText("0 sur", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Emplacement 1 sur 2/ })).toBeVisible();

  // On parcourt les emplacements : le second est sur une autre page.
  await page.getByRole("button", { name: "Emplacement suivant" }).click();
  await expect(page.getByRole("button", { name: /Emplacement 2 sur 2 - page 3/ })).toBeVisible();
  // Le numéro se lit dans son champ, depuis qu'il s'écrit.
  await expect(page.getByRole("textbox", { name: "Numéro de page" })).toHaveValue("3");

  // Le cadre y est supprimé : l'emplacement redevient découvert, et le dit.
  // La corbeille est au bord du cadre : plus besoin d'ouvrir les réglages pour l'atteindre.
  await page.getByRole("button", { name: "Supprimer ce cadre" }).click();
  await expect(page.getByText("1 sur 2 emplacements couverts")).toBeVisible();
  const decouvert = page.locator("[class*='decouvert']").first();
  await expect(decouvert).toBeVisible();
  // Le repère dit le geste à faire, non ce qui manque.
  await expect(decouvert).toContainText("poser ici");

  // Un clic dessus le recouvre : l'ancienne valeur ne peut pas rester par oubli.
  await decouvert.click();
  await expect(page.getByText("2 sur 2 emplacements couverts")).toBeVisible();

  // La coche est ronde et carrée d'aplomb : la règle générale des champs l'étirait.
  const coche = page.getByRole("checkbox").first();
  const forme = (await coche.boundingBox())!;
  expect(Math.abs(forme.width - forme.height)).toBeLessThan(1);

  /*
   * Elle est celle de l'avocat, et elle est enregistrée au dossier. Une fois cochée,
   * la ligne se replie en pastille : le geste est passé, il n'a plus à occuper la
   * place d'un appel à l'action.
   */
  const ligne = page.locator("label:has([type=checkbox])").first();
  const large = (await ligne.boundingBox())!.width;
  await coche.check();
  await expect(async () => {
    expect((await ligne.boundingBox())!.width).toBeLessThan(large / 2);
  }).toPass({ timeout: 5_000 });
  await expect(page.getByText("Tout est vérifié")).toBeVisible();
  await page.waitForTimeout(1600);

  const enregistre = JSON.parse(
    (await prisma.formalites.findUniqueOrThrow({ where: { id: dossier } })).data_json ?? "{}"
  );
  expect(enregistre.verifiees).toEqual(["denomination"]);

  // Et la confirmation figure à l'historique, avec son auteur.
  await page.getByRole("button", { name: "Historique" }).click();
  await expect(page.getByText("Dénomination : confirmé")).toBeVisible();
});

test("poser un cadre libre s'atteint sans faire défiler", async ({ page, request }) => {
  /*
   * La commande vivait tout en bas du panneau, sous les cartes de suivi et sous les
   * cadres déjà libres : il fallait faire défiler pour la trouver, alors qu'elle sert
   * dès qu'un passage manque au repérage.
   */
  const dossier = await dossierANommer();
  await request.post("/api/formalites/modification/statuts/depot", {
    multipart: {
      dossier: String(dossier),
      fichier: {
        name: "statuts.pdf",
        mimeType: "application/pdf",
        buffer: await statutsAvecDeuxOccurrences(),
      },
    },
  });

  await page.setViewportSize({ width: 1600, height: 700 });
  await page.goto("/avocat/" + dossier + "?onglet=statuts");

  const poser = page.getByRole("button", { name: /Ajouter un cadre libre/ });
  await expect(poser).toBeVisible();

  // Dans la fenêtre, sans défiler : c'est tout l'objet du déplacement.
  const boite = (await poser.boundingBox())!;
  expect(boite.y).toBeLessThan(700);

  /*
   * On juge le résultat au panneau, non au nombre de cadres sur la page : un cadre
   * ouvert pour la saisie porte des éléments de plus, et le compte ne veut rien dire.
   */
  await expect(page.getByText("Cadres libres")).toHaveCount(0);
  await poser.click();
  await expect(page.getByText("Cadres libres")).toBeVisible();
});

test("le numéro de page s'écrit, au lieu de cliquer vingt fois", async ({ page, request }) => {
  /*
   * Sur vingt-trois pages, atteindre la dix-septième demandait seize clics sur la
   * flèche. Le numéro se saisit, et une valeur hors bornes ne mène nulle part plutôt
   * que d'emmener au hasard.
   */
  const dossier = await dossierANommer();
  await request.post("/api/formalites/modification/statuts/depot", {
    multipart: {
      dossier: String(dossier),
      fichier: {
        name: "statuts.pdf",
        mimeType: "application/pdf",
        buffer: await statutsAvecDeuxOccurrences(),
      },
    },
  });

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/avocat/" + dossier + "?onglet=statuts");

  const numero = page.getByRole("textbox", { name: "Numéro de page" });
  await expect(numero).toHaveValue("1");

  await numero.fill("3");
  await numero.press("Enter");
  await expect(numero).toHaveValue("3");
  await expect(page.getByRole("img", { name: "Page 3 des statuts" })).toBeVisible();

  // Au-delà du document, on ne bouge pas : le champ revient à la page courante.
  await numero.fill("99");
  await numero.press("Enter");
  await expect(numero).toHaveValue("3");

  /*
   * Échap abandonne la frappe.
   *
   * Quitter le champ navigue, et la sortie lisait l'état du rendu courant : Échap
   * emmenait à la page qu'on venait justement d'abandonner.
   */
  await numero.fill("1");
  await numero.press("Escape");
  await expect(numero).toHaveValue("3");
  await expect(page.getByRole("img", { name: "Page 3 des statuts" })).toBeVisible();
});
