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
  expect(titres).toContain("Avenant aux statuts");
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

test("l'écran d'entrée présente, il ne demande rien", async ({ page }) => {
  /*
   * Il faisait cocher les changements, que l'étape 2 reposait ensuite : on répondait
   * deux fois à la même question, et la seconde pour rien. L'ordre est celui du
   * travail réel - la société d'abord, ce qu'on y change ensuite.
   */
  await page.goto("/modification");

  await expect(page.getByRole("checkbox")).toHaveCount(0);

  await page.getByRole("button", { name: "Commencer" }).click();
  await page.waitForURL(/\/modification\?dossier=\d+/);

  // On arrive sur la société, non sur les changements.
  await expect(page.getByRole("heading", { name: "La société" })).toBeVisible();
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

  const hauteurs = await page.evaluate(() =>
    [...document.querySelectorAll("label[class*='changement']")].map((e) =>
      Math.round(e.getBoundingClientRect().height)
    )
  );

  expect(hauteurs).toHaveLength(8);
  for (let i = 0; i < hauteurs.length; i += 2) {
    expect(hauteurs[i], "ligne " + (i / 2 + 1)).toBe(hauteurs[i + 1]);
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

  const saisie = page.locator("input[class*='repereSaisie']");
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
