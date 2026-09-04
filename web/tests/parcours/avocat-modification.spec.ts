import { test, expect } from "@playwright/test";
import { prisma } from "../../src/infrastructure/db/client";
import { COMPTE } from "./preparer";
import { choisir } from "./liste";

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
    /* L'article des apports est écrit par dépositaire : sans banque, il sort vide. */
    banque: "Qonto",
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
    nouveauDirigeantNationalite: "Française",
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
    // La mise à disposition prévient le client : l'avis pointe le dossier.
    await prisma.notifications.deleteMany({ where: { formalite_id: { in: semes } } });
    await prisma.messages.deleteMany({ where: { formalite_id: { in: semes } } });
    await prisma.formalites.deleteMany({ where: { id: { in: semes } } });
  }
});

test("le dossier s'ouvre sur ce qu'il reste à faire", async ({ page }) => {
  // Non sur le récapitulatif : l'avocat veut savoir par où commencer, pas relire.
  const dossier = await dossierDeModification();
  await page.goto("/avocat/" + dossier);

  /*
   * L'écran s'ouvre sur les documents, et dit sur une ligne ce qu'il reste à faire.
   *
   * La tâche du moment tenait une carte de deux cent quatre-vingts pixels en tête du
   * dossier, avant les actes qu'on vient relire : sa légende dit désormais « À faire »,
   * et ce qu'elle montrait - les pièces qui manquent, les documents concernés - se lit
   * dans la colonne et dans la liste, avec les mêmes gestes.
   */
  await expect(page.locator('section[aria-label="À faire maintenant"]')).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Vérifier les informations du dossier" })
  ).toBeVisible();
  await expect(page.getByText("Mettre les statuts à jour")).toBeVisible();
});

/**
 * Ce que la page du dossier montre, et dans quel ordre.
 *
 * Elle s'ouvrait sur une carte de deux cent quatre-vingts pixels - « À faire maintenant »,
 * un titre, une phrase, deux boutons - puis sur les pièces qui manquent, avant les actes
 * qu'un avocat vient relire. La colonne de droite empilait sept blocs, dont un « Aperçu »
 * qui comptait quatre choses déjà à l'écran et un sommaire vers trois ancres de la même
 * page.
 *
 * Les documents ouvrent le travail ; la colonne dit ce qui manque et ce que le dossier
 * porte. Ce qui a été retiré est ailleurs, non perdu.
 */
test("les documents ouvrent la page, la colonne dit ce qui manque", async ({ page }) => {
  const dossier = await dossierDeModification();
  await page.goto("/avocat/" + dossier);

  const documents = page.locator("#documents");
  const colonne = page.getByRole("complementary", { name: /coup d/ });

  /* Les documents passent avant la liste des tâches à venir. */
  await expect(documents).toBeVisible();
  const hautDesDocuments = (await documents.boundingBox())!.y;
  const hautDeLaSuite = (await page.getByText("Ensuite", { exact: true }).boundingBox())!.y;
  expect(hautDesDocuments).toBeLessThan(hautDeLaSuite);

  /* Un seul titre pour la liste : la section en portait deux, l'un redisant l'autre. */
  await expect(
    page.getByRole("heading", { name: /documents du dossier/i })
  ).toHaveCount(1);

  /*
   * Ce que le dossier porte se lit dans la colonne, non au milieu du travail. Une
   * modification y range ses propres sections - le siège, le dirigeant - là où une
   * création affiche « Informations du dossier » ; le client les ouvre dans les deux
   * cas, parce qu'il en est une.
   */
  await expect(colonne.getByRole("heading", { name: "Le client", exact: true })).toBeVisible();
  await expect(colonne.getByText("AVOCAT ESSAI MODIF").first()).toBeVisible();

  /*
   * Les quatre compteurs de l'aperçu et le sommaire ont disparu : ils redisaient ce
   * qui est déjà à l'écran, et renvoyaient à la page qu'on lit.
   */
  await expect(colonne.getByText("Aperçu")).toHaveCount(0);
  await expect(colonne.getByText("Aller à")).toHaveCount(0);

  /* Les notes internes se lisent avec les échanges et le journal, non dans la colonne. */
  await expect(colonne.getByText("Notes internes")).toHaveCount(0);
  await expect(page.locator("#notes")).toBeVisible();
});

/**
 * Une pièce qui manque se signale par sa pastille, non par un filet en marge.
 *
 * Le panneau portait un trait ambré de trois pixels sur son bord gauche. Un trait de
 * couleur en marge ne se lit pas : il faut déjà savoir ce qu'il veut dire.
 */
test("aucun marqueur d'état ne tient dans un filet de bord", async ({ page }) => {
  const dossier = await dossierDeModification();
  await page.goto("/avocat/" + dossier);

  const filets = await page.evaluate(() =>
    [...document.querySelectorAll("main *")].filter((n) => {
      const style = getComputedStyle(n);
      const largeur = parseFloat(style.borderLeftWidth);
      return (
        largeur >= 2 &&
        style.borderLeftColor !== style.borderTopColor &&
        style.borderTopWidth !== style.borderLeftWidth
      );
    }).length
  );

  expect(filets).toBe(0);
});

test("le vocabulaire est celui d'une modification, pas d'une création", async ({ page }) => {
  const dossier = await dossierDeModification();
  await page.goto("/avocat/" + dossier);

  /*
   * Le document final se dit « Kbis à jour ».
   *
   * Ce test exigeait l'inverse : « extrait à jour », et pas une occurrence du mot
   * Kbis - au motif qu'il appartiendrait à une création. C'est le terme du greffe,
   * pas celui du client : personne ne réclame son extrait à sa banque, on lui donne
   * son Kbis. Une modification en délivre un nouveau, et le nommer est ce que le
   * client attend de lire.
   *
   * Ce qui distingue vraiment le vocabulaire d'une modification reste vérifié : ni
   * dépôt de capital, ni immatriculation - la société existe déjà.
   */
  await expect(page.locator('section[aria-label="À faire maintenant"]')).toBeVisible();
  await expect(page.getByText(/Kbis à jour/i).first()).toBeVisible();
  /*
   * L'absence se vérifie sur les tâches, non sur la page entière.
   *
   * Le dossier tient désormais sur un seul écran, l'annonce légale comprise. Or l'avis
   * d'arrivée d'un transfert hors ressort annonce précisément l'immatriculation au
   * nouveau greffe : le mot y est légitime, et il n'y était pas quand cette section
   * dormait derrière un onglet. Ce que le test surveille est le vocabulaire de ce
   * qu'on demande à l'avocat de faire.
   */
  await expect(
    page.locator('section[aria-label="À faire maintenant"]').getByText(/immatriculation|dépôt du capital/i)
  ).toHaveCount(0);
});

test("une tâche qui attend autre chose dit quoi", async ({ page }) => {
  /*
   * Publier avant d'avoir vérifié fait republier à ses frais : le dire vaut mieux que
   * de griser sans un mot.
   */
  const dossier = await dossierDeModification();
  await page.goto("/avocat/" + dossier);

  /* Les tâches sont toutes à l'écran : un blocage se lit sans rien déplier. */
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

test("un dossier de création ne montre pas de statuts à retoucher", async ({ page }) => {
  /*
   * Cet écran ne concerne que les modifications : le dire vaut mieux qu'un écran vide
   * où l'on cherche ce qui manque.
   *
   * L'annonce, elle, concerne bien une création - la constitution s'annonce, la loi
   * l'exige. L'écran répondait « publiée par le client », le contraire de ce que le
   * suivi promet au client et de ce que la route de déclaration dit d'elle-même.
   */
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

  await page.goto("/avocat/" + creation.id);

  /*
   * La section ne paraît plus du tout.
   *
   * Elle existait pour tous les dossiers et s'ouvrait sur un encart d'excuses - « cet
   * écran ne concerne que les modifications ». Sur une page unique, un titre sans
   * contenu allonge le défilement pour ne rien apprendre : il vaut mieux qu'il ne soit
   * pas là.
   */
  await expect(page.locator("#statuts")).toHaveCount(0);

  /* L'annonce, elle, concerne bien une création : la constitution s'annonce. */
  await expect(page.getByRole("button", { name: "Marquer comme publiés" })).toBeVisible();
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

  await page.goto("/avocat/" + dossier);
  await expect(page.getByRole("alert").filter({ hasText: /statuts/i }).first()).toBeVisible();

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

  /*
   * Le champ de la section des statuts, non le premier de la page.
   *
   * Le dossier tient sur un écran : le premier « input[type=file] » est celui des
   * documents, et le dépôt partait dans la mauvaise porte - le message rendu n'était
   * plus « Statuts reçus » mais celui d'un document quelconque.
   */
  await page.locator('#statuts input[type="file"]').setInputFiles({
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

  /*
   * Le cadre entre dans l'écran avant qu'on le vise.
   *
   * `boundingBox` rend des coordonnées de fenêtre, et la souris clique là où elles
   * pointent. Depuis que le dossier tient sur une page, l'éditeur des statuts est loin
   * sous la ligne de flottaison : les coordonnées tombaient hors de l'écran et le clic
   * n'atteignait rien.
   */
  await cadre.scrollIntoViewIfNeeded();
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
  /*
   * Le cadre entre dans l'écran avant qu'on le vise.
   *
   * `boundingBox` rend des coordonnées de fenêtre, et la souris clique là où elles
   * pointent. Depuis que le dossier tient sur une page, l'éditeur des statuts est loin
   * sous la ligne de flottaison : les coordonnées tombaient hors de l'écran et le clic
   * n'atteignait rien.
   */
  await cadre.scrollIntoViewIfNeeded();
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
  await page.goto("/avocat/" + dossier);

  const poser = page.getByRole("button", { name: /Ajouter un cadre libre/ });
  await expect(poser).toBeVisible();

  /*
   * Sans défiler dans l'éditeur, non dans la page.
   *
   * La commande se mesurait au haut de la fenêtre, quand l'éditeur occupait l'écran
   * seul, derrière son onglet. Le dossier tient maintenant sur une page et l'éditeur
   * vient après le reste : ce qu'on vérifie est qu'une fois arrivé dessus, la commande
   * est là - non qu'elle soit au sommet du dossier.
   */
  const editeur = page.locator("#statuts");
  await editeur.scrollIntoViewIfNeeded();
  const hautDeLEditeur = (await editeur.boundingBox())!.y;
  const boite = (await poser.boundingBox())!;
  expect(boite.y - hautDeLEditeur).toBeLessThan(700);

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

test("les actes attendent la relecture avant d'atteindre le client", async ({ page, browser }) => {
  /*
   * Ce qui sort d'un gabarit n'est pas un acte : c'est un projet. Il était versé dans
   * la bibliothèque du client à la seconde où il était produit - le client pouvait le
   * télécharger, l'envoyer à sa banque ou le signer avant que quiconque l'ait lu.
   */
  const dossier = await dossierDeModification();
  await page.goto("/avocat/" + dossier);
  await page.getByRole("button", { name: "Produire les actes" }).click();
  await expect(page.getByRole("status")).toContainText("actes produits", { timeout: 20_000 });

  const enAttente = await prisma.documents.count({
    where: { formalite_id: dossier, uploaded_by: "system", status: "a_relire" },
  });
  expect(enAttente).toBeGreaterThan(0);

  /*
   * Le client sait qu'un acte existe, mais ne l'a pas.
   *
   * Sa bibliothèque paraissait vide juste après le règlement, et il rappelait pour
   * demander où étaient ses actes : elle nomme donc ce qui est en cours de relecture.
   * Ce qu'elle ne donne pas, c'est le fichier - ni lien, ni archive.
   */
  const client = await browser.newContext({ storageState: "./tests/parcours/session.json" });
  const sonEcran = await client.newPage();
  await sonEcran.goto("/documents");

  const aTelecharger = sonEcran
    .locator("li, article, div")
    .filter({ hasText: "Procès-verbal" })
    .getByRole("link", { name: /Télécharger/ });
  await expect(aTelecharger).toHaveCount(0);

  /*
   * L'avocat valide acte par acte.
   *
   * Un bouton unique publiait le jeu entier : celui qui n'avait relu qu'un acte sur
   * trois publiait les trois. Chaque ligne porte sa décision.
   */
  await page.reload();

  const enRelecture = () =>
    prisma.documents.count({
      where: { formalite_id: dossier, uploaded_by: "system", status: "a_relire" },
    });

  /*
   * On compte en base entre deux clics, non à l'écran.
   *
   * La validation rafraîchit la page : compter les boutons restants revenait à courir
   * après un rendu en cours, et le second clic tombait sur un élément détaché.
   */
  for (let tour = 0; tour < 5; tour += 1) {
    const restants = await enRelecture();
    if (restants === 0) break;

    await page.getByRole("button", { name: "Valider", exact: true }).first().click();
    await expect.poll(enRelecture, { timeout: 20_000 }).toBe(restants - 1);
  }

  expect(await enRelecture()).toBe(0);

  await client.close();
});

/* -------------------------------------------------------------------------- */
/*
 * L'éditeur de statuts, éprouvé là où il vit.
 *
 * Ces cinq essais ouvraient l'éditeur depuis le parcours du client, à l'étape des
 * actes. Cette étape ne lui est plus servie : une fois le dossier réglé, il suit son
 * avancement et ne saisit plus rien - les actes et leurs retouches appartiennent au
 * cabinet. Ils visaient donc un écran que le serveur refuse d'ouvrir, et cherchaient
 * un bouton qu'aucun client ne voit.
 *
 * Ce qu'ils garantissent vaut toujours, et ne se lit nulle part ailleurs : le texte
 * d'un cadre est bien peint une fois refermé - il l'était sur zéro pixel - la barre de
 * mise en forme règle vraiment, un clic dehors referme, les poignées disent ce qui se
 * saisit, et la taille se règle à la flèche.
 */

test("le texte écrit dans un cadre s'affiche vraiment une fois refermé", async ({ page, request }) => {
  /*
   * Il ne s'affichait pas. Le cadre déclare « font: inherit », ce qui lui faisait
   * hériter aussi le line-height du conteneur de la page - mis à zéro pour supprimer
   * l'espace sous l'image. Le texte était rendu sur zéro pixel : présent dans le
   * document, invisible à l'écran, et l'on croyait avoir perdu ce qu'on venait de
   * taper.
   *
   * On mesure donc ce qui est peint, non ce que contient le nœud : textContent était
   * juste tout du long, et c'est ce qui a fait passer le défaut inaperçu.
   */
  const { PDFDocument, StandardFonts } = await import("pdf-lib");

  const dossier = await dossierDeModification();

  const acte = await PDFDocument.create();
  const police = await acte.embedFont(StandardFonts.TimesRoman);
  /* Le texte que la modification touche : c'est lui qui fait naître les cadres. */
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

  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto("/avocat/" + dossier + "?onglet=statuts");

  // Les cadres se posent sur l'image en pourcentages : tant qu'elle n'a pas sa
  // hauteur, ils sont ailleurs et le clic tombe à côté.
  await page.waitForFunction(
    () => {
      const image = document.querySelector("[class*='editeurPage'] img") as HTMLImageElement | null;
      return !!image && image.naturalWidth > 0 && image.getBoundingClientRect().height > 100;
    },
    { timeout: 30_000 }
  );

  const cadre = page.locator("div[class*='repere']").first();
  /*
   * Le cadre entre dans l'écran avant qu'on le vise.
   *
   * `boundingBox` rend des coordonnées de fenêtre, et la souris clique là où elles
   * pointent. Depuis que le dossier tient sur une page, l'éditeur des statuts est loin
   * sous la ligne de flottaison : les coordonnées tombaient hors de l'écran et le clic
   * n'atteignait rien.
   */
  await cadre.scrollIntoViewIfNeeded();
  const boite = (await cadre.boundingBox())!;
  await page.mouse.click(boite.x + boite.width / 2, boite.y + boite.height / 2);

  const saisie = page.getByRole("textbox", { name: "Texte du cadre" });
  await saisie.fill("NOUVEAU NOM");
  await page.mouse.click(300, 950);

  const rendu = await page.evaluate(() => {
    const boite = document.querySelector("div[class*='repere']") as HTMLElement;
    const texte = boite?.querySelector("span[class*='repereTexte']") as HTMLElement;
    return {
      contenu: texte?.textContent,
      hauteur: texte?.getBoundingClientRect().height ?? 0,
      fond: boite ? getComputedStyle(boite).backgroundColor : "",
    };
  });

  expect(rendu.contenu).toBe("NOUVEAU NOM");
  // Le texte occupe une vraie place à l'écran.
  expect(rendu.hauteur).toBeGreaterThan(6);
  // Et le cadre rempli montre le résultat : fond blanc, comme dans le document.
  expect(rendu.fond).toBe("rgb(255, 255, 255)");
});

test("la barre de mise en forme se règle vraiment", async ({ page, request }) => {
  /*
   * Le champ de taille et le sélecteur de police étaient inertes : la barre entière
   * empêchait le comportement par défaut du clic pour garder le curseur dans le
   * texte, ce qui empêchait aussi de les atteindre. Seuls les boutons ont besoin de
   * refuser le focus.
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

  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto("/avocat/" + dossier + "?onglet=statuts");
  await page.waitForFunction(
    () => {
      const image = document.querySelector("[class*='editeurPage'] img") as HTMLImageElement | null;
      return !!image && image.naturalWidth > 0 && image.getBoundingClientRect().height > 100;
    },
    { timeout: 30_000 }
  );

  /* Le cadre entre dans l'écran avant qu'on le vise : l'éditeur est bas dans la page. */
  const cadreVise = page.locator("div[class*='repere']").first();
  await cadreVise.scrollIntoViewIfNeeded();
  const boite = (await cadreVise.boundingBox())!;
  await page.mouse.click(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await page.getByRole("button", { name: "Mise en forme" }).click();

  const barre = page.locator("[data-mise-en-forme]");
  await expect(barre).toBeVisible();

  /*
   * Les polices proposées, dont celles qui voyagent dans le document.
   *
   * Ce n'est plus un `<select>` : le menu natif était dessiné par le système et rien
   * ne l'habillait. On ouvre donc la liste et l'on lit ses options, comme ailleurs.
   */
  const champPolice = barre.getByLabel("Police");
  await champPolice.click();
  const menu = page.getByRole("listbox");
  const polices = await menu.getByRole("option").allTextContents();
  for (const attendue of ["Times New Roman", "Arial", "Georgia", "Calibri", "EB Garamond", "Lato"]) {
    expect(polices, attendue).toContain(attendue);
  }
  await page.keyboard.press("Escape");

  const avantTaille = await page.evaluate(
    () => getComputedStyle(document.querySelector("div[class*='repereOuvert']")!).fontSize
  );

  /*
   * Le champ de taille se laisse écrire.
   *
   * Borner à chaque frappe le rendait inutilisable : taper « 2 » en route vers « 22 »
   * le ramenait aussitôt au minimum, et l'effacer pour recommencer était impossible -
   * une valeur vide vaut zéro, donc le minimum.
   */
  const champTaille = barre.locator("input[aria-label='Taille du texte']");
  await champTaille.fill("");
  expect(await champTaille.inputValue()).toBe("");
  await champTaille.type("2");
  expect(await champTaille.inputValue()).toBe("2");
  await champTaille.type("2");
  expect(await champTaille.inputValue()).toBe("22");

  await choisir(barre.getByLabel("Police"), "EB Garamond");

  const apres = await page.evaluate(() => {
    const cadre = document.querySelector("div[class*='repereOuvert']") as HTMLElement;
    const style = getComputedStyle(cadre);
    return { taille: style.fontSize, famille: style.fontFamily };
  });

  // La taille tapée est bien celle qui s'affiche, et la police a suivi.
  expect(apres.taille).not.toBe(avantTaille);
  expect(apres.famille).toContain("EB Garamond");

  // Régler n'a pas fermé la saisie : on continue d'écrire sans recliquer.
  await expect(page.getByRole("textbox", { name: "Texte du cadre" })).toBeVisible();
});

test("un clic dehors referme le cadre et sa barre", async ({ page, request }) => {
  /*
   * La fermeture ne tenait qu'au blur de la saisie : dès qu'on avait touché la barre -
   * le champ de taille, le sélecteur de police - le curseur n'était plus dans le
   * texte, et cliquer ailleurs ne refermait plus rien. Le cadre restait ouvert
   * indéfiniment, sa barre posée par-dessus la page.
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

  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto("/avocat/" + dossier + "?onglet=statuts");
  await page.waitForFunction(
    () => {
      const image = document.querySelector("[class*='editeurPage'] img") as HTMLImageElement | null;
      return !!image && image.naturalWidth > 0 && image.getBoundingClientRect().height > 100;
    },
    { timeout: 30_000 }
  );

  /* Le cadre entre dans l'écran avant qu'on le vise : l'éditeur est bas dans la page. */
  const cadreVise = page.locator("div[class*='repere']").first();
  await cadreVise.scrollIntoViewIfNeeded();
  const boite = (await cadreVise.boundingBox())!;
  await page.mouse.click(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await page.getByRole("button", { name: "Mise en forme" }).click();

  const barre = page.locator("[data-mise-en-forme]");
  await expect(barre).toBeVisible();

  // On règle quelque chose : le curseur quitte le texte pour la barre.
  await barre.locator("input[aria-label='Taille du texte']").fill("14");
  await expect(barre).toBeVisible();

  // Puis on clique ailleurs sur la page : tout se referme.
  await page.mouse.click(boite.x, boite.y + 320);

  await expect(barre).toHaveCount(0);
  await expect(page.locator("div[class*='repereOuvert']")).toHaveCount(0);
  /*
   * Et le texte réglé est resté.
   *
   * Le cadre porte ce que la modification propose : ici la nouvelle adresse du siège,
   * puisque le dossier d'essai transfère le siège. Ce test attendait « ESSAI GROUPE »,
   * la dénomination du jeu d'essai du parcours client, d'où il vient.
   */
  await expect(page.locator("div[class*='repere']").first()).toContainText(
    "5 avenue Victor Hugo"
  );
});

test("les poignées montrent ce qui se saisit", async ({ page, request }) => {
  /*
   * Un bord vert sans dessin ne dit pas qu'il se tire : on le prend pour une bordure.
   * Chaque poignée porte donc sa flèche - croix pour déplacer, horizontale pour la
   * largeur, verticale pour la hauteur - et elles ne se recouvrent pas : le bouton de
   * mise en forme, posé sur l'angle, masquait la plus utile des trois.
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

  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto("/avocat/" + dossier + "?onglet=statuts");
  await page.waitForFunction(
    () => {
      const image = document.querySelector("[class*='editeurPage'] img") as HTMLImageElement | null;
      return !!image && image.naturalWidth > 0 && image.getBoundingClientRect().height > 100;
    },
    { timeout: 30_000 }
  );

  /*
   * Le cadre est amené au milieu de l'écran, non simplement rendu visible.
   *
   * Les poignées se mesurent au pixel près, et l'une d'elles se retrouvait coupée par
   * le bord de la fenêtre : elle rendait cinquante-huit pixels carrés au lieu de
   * quatre-vingt-seize. Ce n'est pas la poignée qui a rétréci, c'est l'éditeur qui est
   * descendu dans la page.
   */
  const cadreVise = page.locator("div[class*='repere']").first();
  await cadreVise.evaluate((e) => e.scrollIntoView({ block: "center" }));
  const boite = (await cadreVise.boundingBox())!;
  await page.mouse.click(boite.x + boite.width / 2, boite.y + boite.height / 2);

  const reperes = await page.evaluate(() => {
    const cadre = document.querySelector("div[class*='repereOuvert']") as HTMLElement;
    const nomme = (e: Element) => e.className.replace(/Modification-module__\w+__/g, "");
    const boites = [...cadre.querySelectorAll("span")]
      .filter((e) => /poignee|borddroit|bordbas|coin/.test(nomme(e)))
      .map((e) => ({ nom: nomme(e), boite: e.getBoundingClientRect() }));

    const appel = cadre.querySelector("button[aria-label='Mise en forme']")!.getBoundingClientRect();
    return {
      noms: boites.map((b) => b.nom),
      // Chaque poignée occupe une vraie surface, et aucune ne se cache sous le bouton.
      surfaces: boites.map((b) => Math.round(b.boite.width * b.boite.height)),
      chevauchements: boites.filter(
        (b) =>
          b.boite.left < appel.right &&
          b.boite.right > appel.left &&
          b.boite.top < appel.bottom &&
          b.boite.bottom > appel.top
      ).length,
    };
  });

  // Déplacement, largeur, hauteur.
  expect(reperes.noms).toHaveLength(3);
  /*
   * Chacune garde une surface où l'on peut viser. Dix pixels de côté : de grosses
   * pastilles autour d'un cadre d'une ligne se lisaient comme un désordre, chacune
   * tirant l'œil autant que le texte.
   */
  for (const surface of reperes.surfaces) expect(surface).toBeGreaterThanOrEqual(96);
  expect(reperes.chevauchements).toBe(0);
});

test("la taille se règle aussi à la flèche", async ({ page, request }) => {
  /*
   * Changer d'un point demandait d'effacer pour retaper, dans un champ large comme un
   * nom de police pour y écrire deux chiffres.
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

  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto("/avocat/" + dossier + "?onglet=statuts");
  await page.waitForFunction(
    () => {
      const image = document.querySelector("[class*='editeurPage'] img") as HTMLImageElement | null;
      return !!image && image.naturalWidth > 0 && image.getBoundingClientRect().height > 100;
    },
    { timeout: 30_000 }
  );

  /* Le cadre entre dans l'écran avant qu'on le vise : l'éditeur est bas dans la page. */
  const cadreVise = page.locator("div[class*='repere']").first();
  await cadreVise.scrollIntoViewIfNeeded();
  const boite = (await cadreVise.boundingBox())!;
  await page.mouse.click(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await page.getByRole("button", { name: "Mise en forme" }).click();

  const champ = page.locator("[data-mise-en-forme] input[aria-label='Taille du texte']");
  const depart = Number(await champ.inputValue());

  await page.getByRole("button", { name: "Agrandir le texte" }).click();
  expect(Number(await champ.inputValue())).toBe(depart + 1);

  await page.getByRole("button", { name: "Réduire le texte" }).click();
  expect(Number(await champ.inputValue())).toBe(depart);

  /*
   * La suppression est au bord du cadre, non dans les réglages : enfouie ici, défaire
   * un cadre posé au mauvais endroit demandait trois gestes, dont deux sans rapport.
   */
  const corbeille = page.getByRole("button", { name: "Supprimer ce cadre" });
  await expect(corbeille).toHaveCount(1);
  await expect(corbeille).toBeVisible();
  await expect(page.locator("[data-mise-en-forme]").getByRole("button", { name: "Supprimer ce cadre" })).toHaveCount(0);
});
