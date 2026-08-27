import { choisir, choisirDans } from "./liste";
import { test, expect } from "@playwright/test";
import { prisma } from "../../src/infrastructure/db/client";

/**
 * Le parcours de modification.
 *
 * Il ne partait de rien d'utilisable : le procès-verbal sortait vide, sans nom de
 * société ni résolution, et l'on ne pouvait modifier qu'une société créée chez nous.
 * Ces parcours tiennent les deux bouts - le devis qui compte les annonces, et les
 * actes qui portent enfin ce qu'on a saisi.
 */
test.describe.configure({ mode: "serial" });

/** Ouvre un dossier neuf et rend son identifiant. */
async function ouvrirUnDossier(request: import("@playwright/test").APIRequestContext) {
  const reponse = await request.post("/api/formalites/modification");
  expect(reponse.status()).toBe(201);
  return (await reponse.json()).dossier as number;
}

const SOCIETE = {
  denomination: "ESSAI MODIFICATION",
  forme: "SAS",
  siren: "552100554",
  adresse: "12 rue de la Paix",
  codePostal: "75002",
  ville: "Paris",
  capital: 15000,
};

test("un dossier s'ouvre sans société, et la société se choisit ensuite", async ({ request }) => {
  /*
   * C'est le point d'entrée qui manquait : la version précédente ne listait que les
   * sociétés créées chez nous, ce qui excluait la quasi-totalité des modifications.
   */
  const dossier = await ouvrirUnDossier(request);

  const enregistrement = await request.put("/api/formalites/modification", {
    data: { dossier, societe: SOCIETE, codes: ["denomination"] },
  });
  expect(enregistrement.ok()).toBe(true);

  const { modification } = await enregistrement.json();
  expect(modification.societe.denomination).toBe("ESSAI MODIFICATION");
  expect(modification.codes).toEqual(["denomination"]);
});

test("un code de modification inconnu est écarté", async ({ request }) => {
  // Le garder ferait échouer la production d'actes sans dire pourquoi.
  const dossier = await ouvrirUnDossier(request);
  const reponse = await request.put("/api/formalites/modification", {
    data: { dossier, codes: ["denomination", "fusion_absorption"] },
  });
  expect(reponse.status()).toBe(400);
});

test("les actes portent la société et les résolutions décidées", async ({ request }) => {
  const dossier = await ouvrirUnDossier(request);

  await request.put("/api/formalites/modification", {
    data: {
      dossier,
      societe: SOCIETE,
      codes: ["transfert_siege", "denomination"],
      valeurs: {
        nouvelleAdresse: "5 avenue Victor Hugo",
        nouvelleVille: "Lyon",
        nouveauCodePostal: "69003",
        dateEffetTransfert: "2026-09-15",
        nouvelleDenomination: "ESSAI GROUPE",
        dateEffetDenomination: "2026-09-15",
      },
      assemblee: {
        date: "2026-09-01",
        associes: [{ civilite: "Monsieur", prenom: "Jean", nom: "DUPONT", parts: 1000 }],
      },
    },
  });

  const production = await request.post("/api/formalites/modification/documents", {
    data: { dossier },
  });
  expect(production.status()).toBe(201);

  const { documents } = await production.json();
  const titres = documents.map((d: { titre: string }) => d.titre);

  // Une seule assemblée, un seul procès-verbal, quel que soit le nombre de décisions.
  expect(titres.filter((t: string) => t.startsWith("Procès-verbal"))).toHaveLength(1);
  // Pas d'avenant : les statuts se retouchent à l'éditeur, sur le document d'origine.
  expect(titres).not.toContain("Avenant aux statuts");
});

test("un dossier incomplet ne produit pas d'actes troués", async ({ request }) => {
  /*
   * Un acte à trous part au greffe en l'état, et le refus revient des semaines plus
   * tard. Mieux vaut refuser la production.
   */
  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: { dossier, societe: SOCIETE, codes: ["denomination"] },
  });

  const production = await request.post("/api/formalites/modification/documents", {
    data: { dossier },
  });
  expect(production.status()).toBe(400);

  const corps = await production.json();
  expect(corps.manques.length).toBeGreaterThan(0);
});

test("une augmentation qui diminue le capital est refusée", async ({ request }) => {
  // Elle se saisit sans effort et ne se remarque qu'au refus du greffe.
  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: {
      dossier,
      societe: SOCIETE,
      codes: ["augmentation_capital"],
      valeurs: {
        capitalActuelAugm: 15000,
        nouveauCapitalAugm: 5000,
        modeAugmentation: "Apport en numéraire",
        dateEffetAugm: "2026-09-01",
      },
    },
  });

  const production = await request.post("/api/formalites/modification/documents", {
    data: { dossier },
  });
  expect(production.status()).toBe(400);
  expect(JSON.stringify(await production.json())).toContain("au-dessus de sa valeur actuelle");
});

test("les statuts ne se demandent pas au registre sans SIREN", async ({ request }) => {
  const dossier = await ouvrirUnDossier(request);
  const reponse = await request.get("/api/formalites/modification/statuts?dossier=" + dossier);
  expect(reponse.status()).toBe(400);
});

test("les retouches ne s'appliquent pas sans statuts au dossier", async ({ request }) => {
  // Sans document de départ, il n'y a rien à retoucher : le dire vaut mieux que de
  // produire des statuts à jour qui n'existent pas.
  const dossier = await ouvrirUnDossier(request);
  const reponse = await request.get("/api/formalites/modification/retouches?dossier=" + dossier);
  expect(reponse.status()).toBe(409);
});

test("le dossier d'un autre compte reste inaccessible", async ({ request }) => {
  const reponse = await request.put("/api/formalites/modification", {
    data: { dossier: 999999, codes: ["denomination"] },
  });
  expect([403, 404]).toContain(reponse.status());
});

test("le parcours s'affiche avec son fil d'étapes", async ({ page, request }) => {
  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: { dossier, societe: SOCIETE, codes: ["transfert_siege"] },
  });

  await page.goto("/modification?dossier=" + dossier);

  await expect(page.getByRole("heading", { name: "La société" })).toBeVisible();
  await expect(page.getByText("Étape 1 sur 7")).toBeVisible();
  await expect(page.getByLabel("Dénomination sociale")).toHaveValue("ESSAI MODIFICATION");
});

test("le devis compte deux annonces quand le siège change de ressort", async ({ page, request }) => {
  /*
   * L'article R. 210-19 du code de commerce impose une parution dans le département
   * de départ et une dans celui d'arrivée. Une seule ligne d'annonce ferait un devis
   * faux de plus de cent euros.
   */
  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: {
      dossier,
      societe: SOCIETE,
      codes: ["transfert_siege"],
      valeurs: {
        nouvelleAdresse: "5 avenue Victor Hugo",
        nouvelleVille: "Lyon",
        nouveauCodePostal: "69003",
        dateEffetTransfert: "2026-09-15",
      },
    },
  });

  await page.goto("/modification?dossier=" + dossier + "&etape=2");

  const annonces = page.getByText(/Annonce légale/);
  await expect(annonces).toHaveCount(2);
  await expect(page.getByText(/R\. 210-19/)).toBeVisible();
});

test("une modification seule n'affiche qu'une annonce", async ({ page, request }) => {
  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: { dossier, societe: SOCIETE, codes: ["denomination"] },
  });

  await page.goto("/modification?dossier=" + dossier + "&etape=2");
  await expect(page.getByText(/Annonce légale/)).toHaveCount(1);
});

test("les modifications suivantes coûtent moins cher que la première", async ({ page, request }) => {
  // Une deuxième décision prise dans la même assemblée ne double pas le travail :
  // même procès-verbal, même annonce, même dépôt.
  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: { dossier, societe: SOCIETE, codes: ["denomination", "objet_social"] },
  });

  await page.goto("/modification?dossier=" + dossier + "&etape=2");

  await expect(page.getByText("Décidée dans la même assemblée")).toBeVisible();
  await expect(page.getByText("129,00 € HT")).toBeVisible();
  await expect(page.getByText("49,00 € HT")).toBeVisible();
});

test("le fil d'étapes se lit en ligne, jamais en colonne", async ({ page, request }) => {
  /*
   * globals.css met toute liste de `main` en colonne. Une classe qui redéclare
   * `display: flex` sans direction n'emporte que `display` : la colonne passe, et
   * les sept pastilles s'empilent en écrasant leurs libellés. C'est ce qui est
   * arrivé à la frise du tableau de bord, en production.
   */
  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: { dossier, societe: SOCIETE, codes: ["denomination"] },
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/modification?dossier=" + dossier + "&etape=2");

  const cercles = await page.evaluate(() =>
    [...document.querySelectorAll("[class*='stepCircle']")].map((c) => {
      const boite = c.getBoundingClientRect();
      return { x: Math.round(boite.x), y: Math.round(boite.y) };
    })
  );

  expect(cercles.length).toBe(7);
  // Toutes les pastilles sur la même ligne, et chacune à droite de la précédente.
  for (let i = 1; i < cercles.length; i++) {
    expect(cercles[i].x, "pastille " + (i + 1)).toBeGreaterThan(cercles[i - 1].x);
    expect(Math.abs(cercles[i].y - cercles[0].y), "pastille " + (i + 1)).toBeLessThan(4);
  }
});

test("l'écran d'entrée fait cocher, et le choix remplit l'étape 2", async ({ page }) => {
  /*
   * Deux versions ont échoué avant celle-ci. La première faisait cocher ici puis
   * reposait la question à l'étape 2 ; la seconde n'offrait que des pastilles inertes,
   * puis des cartes qui partaient au premier clic - et l'on ne voyait pas comment
   * décider deux changements dans la même assemblée.
   *
   * Aujourd'hui les cartes se cochent, le prix suit, et l'étape 2 est enjambée
   * puisqu'elle a déjà sa réponse.
   */
  await page.goto("/modification");

  const siege = page.getByRole("button", { name: /Transfert de siège social/ });
  const denomination = page.getByRole("button", { name: /Changement de dénomination/ });

  await siege.click();
  await expect(siege).toHaveAttribute("aria-pressed", "true");

  await denomination.click();
  // Le bouton dit combien de changements partent avec le dossier.
  await expect(page.getByRole("button", { name: /Continuer avec ces 2 changements/ })).toBeVisible();

  await page.getByRole("button", { name: /Continuer/ }).click();
  await page.waitForURL(/\/modification\?dossier=\d+/);

  // On arrive sur la société : les changements sont déjà répondus.
  await expect(page.getByRole("heading", { name: "La société" })).toBeVisible();
  await expect(page.getByText(/Vous changez/)).toBeVisible();
});

test("qui ne sait pas encore ouvre un dossier vide", async ({ page }) => {
  await page.goto("/modification");

  await page.getByRole("button", { name: "Je ne sais pas encore" }).click();
  await page.waitForURL(/\/modification\?dossier=\d+/);

  await expect(page.getByRole("heading", { name: "La société" })).toBeVisible();
  // Rien n'ayant été répondu, l'étape 2 se pose normalement.
  await expect(page.getByText(/Vous changez/)).toHaveCount(0);
});

test("plusieurs changements se cochent aussi à l'étape 2", async ({ page, request }) => {
  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: { dossier, societe: SOCIETE },
  });

  await page.goto("/modification?dossier=" + dossier + "&etape=2");

  const siege = page.getByRole("checkbox", { name: /Transfert de siège social/ });
  const capital = page.getByRole("checkbox", { name: /Augmentation de capital/ });

  await siege.check();
  await capital.check();

  await expect(siege).toBeChecked();
  await expect(capital).toBeChecked();
  // Le devis suit la sélection sans qu'on ait à valider quoi que ce soit.
  await expect(page.getByText("Décidée dans la même assemblée")).toBeVisible();
});

test("l'écran d'entrée ne liste plus les sociétés du compte", async ({ page }) => {
  await page.goto("/modification");
  await expect(page.getByText(/Vos sociétés chez Formalist/)).toHaveCount(0);
});

test("le prix et le règlement se voient sans descendre", async ({ page, request }) => {
  /*
   * Le bouton se trouvait sous le récapitulatif entier, à plus de deux mille pixels
   * du haut : il fallait descendre pour connaître le prix, puis remonter pour
   * vérifier ce qu'on payait.
   */
  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: {
      dossier,
      societe: SOCIETE,
      codes: ["transfert_siege"],
      valeurs: {
        nouvelleAdresse: "5 avenue Victor Hugo",
        nouvelleVille: "Lyon",
        nouveauCodePostal: "69003",
        dateEffetTransfert: "2026-09-15",
      },
    },
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/modification?dossier=" + dossier + "&etape=7");

  const bouton = page.getByRole("button", { name: /Régler et confier/ });
  await expect(bouton).toBeInViewport();

  const cadre = (await bouton.boundingBox())!;
  expect(cadre.y).toBeLessThan(800);
});

test("une étape incomplète ne laisse pas passer à la suivante", async ({ page, request }) => {
  /*
   * Chaque étape retient ce qui lui manque, plutôt que de tout reprocher au
   * récapitulatif : y arriver avec six champs vides oblige à redescendre les
   * chercher un par un.
   */
  const dossier = await ouvrirUnDossier(request);
  await page.goto("/modification?dossier=" + dossier + "&etape=1");

  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("alert").first()).toContainText(/requis/);
  // On est resté sur place.
  await expect(page.getByText("Étape 1 sur 7")).toBeVisible();
});

test("les refus ne s'affichent qu'après une tentative", async ({ page, request }) => {
  // Marquer en rouge un formulaire qu'on vient d'ouvrir met la faute sur celui qui
  // n'a pas encore eu le temps de le remplir.
  const dossier = await ouvrirUnDossier(request);
  await page.goto("/modification?dossier=" + dossier + "&etape=1");

  /*
   * Les refus du formulaire, non tous les role="alert" de la page : le signaleur de
   * navigation de Next en est un, vide, et il apparaît après le rendu.
   */
  const carte = page.locator("[class*='contenu']").first();
  await expect(carte.getByRole("alert")).toHaveCount(0);

  // Après une tentative, ils sont là.
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(carte.getByRole("alert").first()).toBeVisible();
});

test("les cartes d'une même ligne ont la même hauteur", async ({ page, request }) => {
  // « Changement de dirigeant » a la description la plus longue : sa carte dépassait
  // sa voisine, et la grille se lisait de travers.
  const dossier = await ouvrirUnDossier(request);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/modification?dossier=" + dossier + "&etape=2");

  /*
   * Les cartes se comparent par rangée réelle, non deux par deux.
   *
   * Le test comptait huit cartes et les appariait par leur rang : ajouter un neuvième
   * changement le faisait échouer sur un décompte, non sur un défaut d'alignement.
   * On regroupe donc par ordonnée, ce qui est la question posée - deux cartes côte à
   * côte doivent avoir la même hauteur.
   */
  const cartes = await page.evaluate(() =>
    [...document.querySelectorAll("label[class*='changement']")].map((e) => {
      const cadre = e.getBoundingClientRect();
      return { haut: Math.round(cadre.top), hauteur: Math.round(cadre.height) };
    })
  );

  expect(cartes.length).toBeGreaterThan(1);

  const rangees = new Map<number, number[]>();
  for (const carte of cartes) {
    const rangee = rangees.get(carte.haut) ?? [];
    rangee.push(carte.hauteur);
    rangees.set(carte.haut, rangee);
  }

  for (const [haut, hauteurs] of rangees) {
    expect(new Set(hauteurs).size, "rangée à " + haut + " px").toBe(1);
  }
});

test("choisir une adresse remplit la voie, le code postal et la ville", async ({ page, request }) => {
  /*
   * Les deux rappels de l'autocomplétion - la voie, puis le code postal et la ville -
   * partent dans le même cycle. Construits à partir de l'état du rendu, le second
   * écrasait le premier : la ville et le code postal s'affichaient, la rue restait
   * celle qu'on avait tapée à moitié.
   */
  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: { dossier, societe: SOCIETE, codes: ["transfert_siege"] },
  });

  await page.goto("/modification?dossier=" + dossier + "&etape=3");

  const adresse = page.getByLabel("Nouvelle adresse");
  await adresse.click();
  await adresse.pressSequentially("12 rue de la Répu", { delay: 30 });

  const proposition = page.getByRole("option").first();
  await proposition.waitFor({ timeout: 10_000 });
  const attendu = (await proposition.textContent()) ?? "";
  await proposition.click();

  // La voie est bien celle de la proposition, pas la saisie interrompue.
  await expect(adresse).not.toHaveValue("12 rue de la Répu");
  await expect(page.getByLabel("Nouveau code postal")).not.toHaveValue("");
  await expect(page.getByLabel("Nouvelle ville")).not.toHaveValue("");

  const voie = await adresse.inputValue();
  expect(attendu.toLowerCase()).toContain(voie.toLowerCase().slice(0, 12));
});

test("le fil ramène aux étapes déjà passées, et ne saute pas en avant", async ({ page, request }) => {
  /*
   * Corriger une saisie ne doit pas demander de repasser par « Retour » cinq fois.
   * En revanche, sauter à une étape jamais vue enjamberait les contrôles qui gardent
   * les précédentes.
   */
  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: { dossier, societe: SOCIETE, codes: ["denomination"] },
  });

  await page.goto("/modification?dossier=" + dossier + "&etape=2");

  // L'étape 1 est derrière : elle se rouvre d'un clic.
  await page.getByRole("button", { name: /Société/ }).click();
  await expect(page.getByRole("heading", { name: "La société" })).toBeVisible();

  // Les étapes jamais atteintes ne sont pas des boutons.
  await expect(page.getByRole("button", { name: /Règlement/ })).toHaveCount(0);
});

test("les statuts déposés par le client arrivent bien au dossier", async ({ request }) => {
  /*
   * Ils n'y arrivaient pas : le dépôt exigeait « pdf » là où la convention du contrôle
   * de fichiers est « .pdf ». Tout PDF valide était refusé, avec un message qui
   * annonçait pourtant « Formats attendus : pdf ». Le client déposait, rien
   * n'apparaissait, et l'avocat lisait « les statuts ne sont pas au dossier ».
   */
  const { PDFDocument, StandardFonts } = await import("pdf-lib");

  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: { dossier, societe: SOCIETE, codes: ["denomination"] },
  });

  const document = await PDFDocument.create();
  const police = await document.embedFont(StandardFonts.Helvetica);
  document.addPage([595, 842]).drawText("STATUTS", { x: 60, y: 700, size: 14, font: police });

  const depot = await request.post("/api/formalites/modification/statuts/depot", {
    multipart: {
      dossier: String(dossier),
      fichier: {
        name: "statuts.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(await document.save()),
      },
    },
  });
  expect(depot.status()).toBe(201);

  // Et ils sont lisibles par la suite du parcours, côté client comme côté avocat.
  const retouches = await request.get("/api/formalites/modification/retouches?dossier=" + dossier);
  expect(retouches.status()).toBe(200);
});

test("un fichier qui n'est pas un PDF reste refusé", async ({ request }) => {
  // La souplesse sur le point ne doit pas ouvrir la porte à autre chose.
  const dossier = await ouvrirUnDossier(request);
  const depot = await request.post("/api/formalites/modification/statuts/depot", {
    multipart: {
      dossier: String(dossier),
      fichier: { name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("bonjour") },
    },
  });
  expect(depot.status()).toBe(400);
});

test("un associé peut être une société, et l'acte la désigne comme telle", async ({ page, request }) => {
  /*
   * Le cas n'était pas prévu : l'étape ne proposait que civilité, prénom et nom. Une
   * SCI détenue par une holding ne pouvait pas être saisie, et l'acte aurait écrit
   * « Monsieur HOLDING ».
   */
  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: {
      dossier,
      societe: SOCIETE,
      codes: ["denomination"],
      valeurs: { nouvelleDenomination: "ESSAI GROUPE", dateEffetDenomination: "2026-09-15" },
      assemblee: { date: "2026-09-01", associes: [{}] },
    },
  });

  await page.goto("/modification?dossier=" + dossier + "&etape=4");

  await page.getByRole("radio", { name: "Une société" }).check();
  await page.getByLabel("Dénomination", { exact: true }).fill("ACME HOLDING");
  await page.getByLabel("Représentée par").fill("Monsieur Jean DUPONT");
  await page.getByLabel("En qualité de").fill("Président");
  await page.getByLabel("Parts détenues").fill("1000");

  await page.getByRole("button", { name: "Continuer" }).click();
  await page.waitForURL(/etape=|dossier=/);

  const relu = await request.get("/api/formalites/modification/retouches?dossier=" + dossier);
  expect([200, 409]).toContain(relu.status());

  const enregistre = await prisma.formalites.findUniqueOrThrow({ where: { id: dossier } });
  const associe = JSON.parse(enregistre.data_json ?? "{}").assemblee.associes[0];
  expect(associe.nature).toBe("morale");
  expect(associe.denomination).toBe("ACME HOLDING");
  expect(associe.representant).toBe("Monsieur Jean DUPONT");
});

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

  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: {
      dossier,
      societe: SOCIETE,
      codes: ["denomination"],
      valeurs: { nouvelleDenomination: "ESSAI GROUPE", dateEffetDenomination: "2026-09-15" },
    },
  });

  const acte = await PDFDocument.create();
  const police = await acte.embedFont(StandardFonts.TimesRoman);
  acte.addPage([595, 842]).drawText("ESSAI MODIFICATION", { x: 180, y: 740, size: 16, font: police });
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
  await page.goto("/modification?dossier=" + dossier + "&etape=6");
  await page.getByRole("button", { name: /Retoucher les statuts/ }).click();

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

  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: {
      dossier,
      societe: SOCIETE,
      codes: ["denomination"],
      valeurs: { nouvelleDenomination: "ESSAI GROUPE", dateEffetDenomination: "2026-09-15" },
    },
  });

  const acte = await PDFDocument.create();
  const police = await acte.embedFont(StandardFonts.TimesRoman);
  acte.addPage([595, 842]).drawText("ESSAI MODIFICATION", { x: 180, y: 700, size: 16, font: police });
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
  await page.goto("/modification?dossier=" + dossier + "&etape=6");
  await page.getByRole("button", { name: /Retoucher les statuts/ }).click();
  await page.waitForFunction(
    () => {
      const image = document.querySelector("[class*='editeurPage'] img") as HTMLImageElement | null;
      return !!image && image.naturalWidth > 0 && image.getBoundingClientRect().height > 100;
    },
    { timeout: 30_000 }
  );

  const boite = (await page.locator("div[class*='repere']").first().boundingBox())!;
  await page.mouse.click(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await page.getByRole("button", { name: "Mise en forme" }).click();

  const barre = page.locator("[data-mise-en-forme]");
  await expect(barre).toBeVisible();

  // Les polices proposées, dont celles qui voyagent dans le document.
  const polices = await barre.locator("select option").allTextContents();
  for (const attendue of ["Times New Roman", "Arial", "Georgia", "Calibri", "EB Garamond", "Lato"]) {
    expect(polices, attendue).toContain(attendue);
  }

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

  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: {
      dossier,
      societe: SOCIETE,
      codes: ["denomination"],
      valeurs: { nouvelleDenomination: "ESSAI GROUPE", dateEffetDenomination: "2026-09-15" },
    },
  });

  const acte = await PDFDocument.create();
  const police = await acte.embedFont(StandardFonts.TimesRoman);
  acte.addPage([595, 842]).drawText("ESSAI MODIFICATION", { x: 180, y: 700, size: 16, font: police });
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
  await page.goto("/modification?dossier=" + dossier + "&etape=6");
  await page.getByRole("button", { name: /Retoucher les statuts/ }).click();
  await page.waitForFunction(
    () => {
      const image = document.querySelector("[class*='editeurPage'] img") as HTMLImageElement | null;
      return !!image && image.naturalWidth > 0 && image.getBoundingClientRect().height > 100;
    },
    { timeout: 30_000 }
  );

  const boite = (await page.locator("div[class*='repere']").first().boundingBox())!;
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
  // Et le texte réglé est resté.
  await expect(page.locator("div[class*='repere']").first()).toContainText("ESSAI GROUPE");
});

test("les poignées montrent ce qui se saisit", async ({ page, request }) => {
  /*
   * Un bord vert sans dessin ne dit pas qu'il se tire : on le prend pour une bordure.
   * Chaque poignée porte donc sa flèche - croix pour déplacer, horizontale pour la
   * largeur, verticale pour la hauteur - et elles ne se recouvrent pas : le bouton de
   * mise en forme, posé sur l'angle, masquait la plus utile des trois.
   */
  const { PDFDocument, StandardFonts } = await import("pdf-lib");

  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: {
      dossier,
      societe: SOCIETE,
      codes: ["denomination"],
      valeurs: { nouvelleDenomination: "ESSAI GROUPE", dateEffetDenomination: "2026-09-15" },
    },
  });

  const acte = await PDFDocument.create();
  const police = await acte.embedFont(StandardFonts.TimesRoman);
  acte.addPage([595, 842]).drawText("ESSAI MODIFICATION", { x: 180, y: 700, size: 16, font: police });
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
  await page.goto("/modification?dossier=" + dossier + "&etape=6");
  await page.getByRole("button", { name: /Retoucher les statuts/ }).click();
  await page.waitForFunction(
    () => {
      const image = document.querySelector("[class*='editeurPage'] img") as HTMLImageElement | null;
      return !!image && image.naturalWidth > 0 && image.getBoundingClientRect().height > 100;
    },
    { timeout: 30_000 }
  );

  const boite = (await page.locator("div[class*='repere']").first().boundingBox())!;
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

  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: {
      dossier,
      societe: SOCIETE,
      codes: ["denomination"],
      valeurs: { nouvelleDenomination: "ESSAI GROUPE", dateEffetDenomination: "2026-09-15" },
    },
  });

  const acte = await PDFDocument.create();
  const police = await acte.embedFont(StandardFonts.TimesRoman);
  acte.addPage([595, 842]).drawText("ESSAI MODIFICATION", { x: 180, y: 700, size: 16, font: police });
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
  await page.goto("/modification?dossier=" + dossier + "&etape=6");
  await page.getByRole("button", { name: /Retoucher les statuts/ }).click();
  await page.waitForFunction(
    () => {
      const image = document.querySelector("[class*='editeurPage'] img") as HTMLImageElement | null;
      return !!image && image.naturalWidth > 0 && image.getBoundingClientRect().height > 100;
    },
    { timeout: 30_000 }
  );

  const boite = (await page.locator("div[class*='repere']").first().boundingBox())!;
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

test("le message de ce qui manque suit ce qu'on remplit", async ({ page, request }) => {
  /*
   * Il était écrit une fois dans l'état : on remplissait les champs qu'il nommait, et
   * il continuait d'annoncer « Il reste 5 champs à renseigner » en les citant tous -
   * y compris ceux qu'on venait de renseigner sous ses yeux.
   */
  const dossier = await ouvrirUnDossier(request);
  await page.goto("/modification?dossier=" + dossier + "&etape=1");

  await page.getByRole("button", { name: "Continuer" }).click();
  // Le récapitulatif, non les refus posés sous chaque champ.
  const alerte = page.locator("[class*='manques']");
  await expect(alerte).toContainText("Il reste 5 champs");

  // Un champ rempli, un de moins annoncé.
  await page.getByLabel("Dénomination sociale").fill("ESSAI VIVANT");
  await expect(alerte).toContainText("Il reste 4 champs");
  await expect(alerte).not.toContainText("La dénomination est requise");

  await page.getByLabel("SIREN", { exact: true }).fill("899979934");
  await page.getByLabel("Adresse du siège").fill("12 rue des Lilas");
  await page.getByLabel("Code postal").fill("75011");
  await expect(alerte).toContainText("La forme juridique est requise");
  await expect(alerte).not.toContainText("Il reste");
});

test("une cession se compose à partir des associés, et sa répartition se voit", async ({
  page,
  request,
}) => {
  /*
   * Le formulaire demandait « Nom du cédant » dans un champ vide, alors que l'étape
   * suivante faisait saisir les mêmes personnes avec leurs parts : on pouvait céder
   * cinq cents parts quand on en détenait cent, et l'acte sortait ainsi.
   */
  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: {
      dossier,
      codes: ["cession_parts"],
      societe: { denomination: "CESSION", forme: "SARL", siren: "899979934" },
    },
  });

  await page.goto("/modification?dossier=" + dossier + "&etape=3");

  // Le formulaire s'ouvre prêt à écrire, sans qu'il faille cliquer pour créer la ligne.
  await page.getByLabel("Nom de l'associé 1").fill("Jean DUPONT");
  await page.getByLabel("Parts de l'associé 1").fill("500");
  await page.getByRole("button", { name: "+ Ajouter un associé" }).click();
  await page.getByLabel("Nom de l'associé 2").fill("Marie MARTIN");
  await page.getByLabel("Parts de l'associé 2").fill("300");

  // Le cédant se choisit dans la liste, avec ce qu'il détient.
  await choisirDans(page, "Cédant", "Jean DUPONT · 500 parts");
  await page.getByLabel("Parts cédées").fill("200");
  await expect(page.getByText("sur 500 détenues")).toBeVisible();

  await page.getByLabel("Nom du cessionnaire").fill("Paul BERNARD");
  await page.getByLabel("Prix de cession, en euros").fill("20000");
  await expect(page.getByText("soit 100 € la part")).toBeVisible();

  // La répartition d'après se calcule à mesure : c'est elle qui rend les erreurs visibles.
  const apres = page.locator("[class*='repartitionListe']");
  await expect(apres).toContainText("Paul BERNARD");
  await expect(apres.locator("li").first()).toContainText("300");
  await expect(page.getByText("entre", { exact: true })).toBeVisible();

  // L'agrément se déduit de la forme et du destinataire, au lieu d'être demandé.
  await expect(page.getByText("Agrément requis")).toBeVisible();
  await expect(page.getByText(/L. 223-14/)).toBeVisible();

  // On ne cède pas plus qu'on ne détient : le refus le dit avec le compte exact.
  await page.getByLabel("Parts cédées").fill("900");
  await page.getByLabel("Date de cession").fill("2026-09-15");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.locator("[class*='manques']").first()).toContainText(
    "cède au total plus de parts qu'il n'en détient (500)"
  );

  // Et rien d'autre n'est réclamé : les anciens champs plats ne sont plus déclarés.
  await expect(page.getByText(/Nom du cédant est requis/)).toHaveCount(0);
});

test("le calendrier est le nôtre, et la saisie reste au clavier", async ({ page, request }) => {
  /*
   * Le champ natif du navigateur ouvre un calendrier que rien ne peut habiller : bleu
   * système, boutons dans une autre langue selon la machine, apparence différente sur
   * chaque navigateur. Celui-ci est écrit, et le même partout.
   */
  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: { dossier, codes: ["prorogation"], societe: { denomination: "DATES", forme: "SARL" } },
  });
  await page.goto("/modification?dossier=" + dossier + "&etape=3");

  // Aucun champ natif ne subsiste : le navigateur n'ouvre plus son propre calendrier.
  expect(await page.locator('input[type="date"]').count()).toBe(0);

  const champ = page.getByLabel("Date d'expiration actuelle");
  await champ.fill("15/09/2026");
  await expect(champ).toHaveValue("15/09/2026");

  // Le calendrier s'ouvre sur le mois de la date retenue, non sur le mois courant.
  await page.getByRole("button", { name: "Ouvrir le calendrier" }).first().click();
  const calendrier = page.getByRole("dialog", { name: "Choisir une date" });
  await expect(calendrier).toContainText("septembre 2026");

  // Un jour cliqué se retient, et le calendrier se referme.
  await calendrier.getByRole("button", { name: "22", exact: true }).click();
  await expect(champ).toHaveValue("22/09/2026");
  await expect(calendrier).toHaveCount(0);

  // Une date impossible ne s'enregistre pas : elle revient à ce qui était retenu.
  await champ.fill("31/02/2026");
  await champ.blur();
  await expect(champ).toHaveValue("22/09/2026");
});
