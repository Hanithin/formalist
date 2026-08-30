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
  /*
   * La frise dit l'étape, la pastille ne la redit plus.
   *
   * « Étape 1 sur 7 » doublait le fil qui la surplombe, en plus précis que lui : quatre
   * éléments répondaient à « où suis-je » sur cet écran, en comptant le fil d'Ariane et
   * la colonne. La frise situe et permet de revenir en arrière ; elle suffit.
   */
  await expect(page.getByRole("button", { name: /1.*Société/ }).first()).toBeVisible();
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

  /*
   * La frise a été réécrite depuis : ses pastilles portent `friseMarque`, non plus
   * `stepCircle` - laquelle ne subsiste que dans le parcours de création. Le test
   * cherchait donc zéro élément et ne gardait plus rien : il passait sur une frise
   * en colonne comme sur une frise en ligne.
   */
  const cercles = await page.evaluate(() =>
    [...document.querySelectorAll("[class*='friseMarque']")].map((c) => {
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

  /*
   * On arrive sur la société : les changements sont déjà répondus, et rappelés.
   *
   * Le rappel a été posé dans le formulaire, puis dans la colonne de droite - où il
   * tient les sept étapes, et non la seule première. Le laisser aux deux endroits
   * mettait deux fois la même liste côte à côte.
   */
  await expect(page.getByRole("heading", { name: "La société" })).toBeVisible();

  const colonne = page.getByRole("complementary", {
    name: "Récapitulatif de votre modification",
  });
  await expect(colonne.getByText("Ce que vous changez")).toBeVisible();
  await expect(colonne.getByRole("listitem")).toHaveText(["Siège social", "Dénomination"]);
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
  /*
   * L'étape du règlement est la sixième, non la septième.
   *
   * Les sept étapes ont été renumérotées ; ce test est resté sur l'ancienne. Il
   * arrivait donc sur « Vos actes » - que le serveur refuse d'ouvrir avant paiement et
   * qui le renvoyait au règlement, sans sa barre : le seul bouton qui restait était
   * celui de la carte, tout en bas. Le test constatait à juste titre qu'il fallait
   * descendre pour l'atteindre.
   */
  await page.goto("/modification?dossier=" + dossier + "&etape=6");

  /*
   * Les deux se voient sans faire défiler : le prix, collé en haut de sa colonne, et
   * le bouton, collé au bas de la fenêtre. Ce test mesurait la hauteur du bouton pour
   * exiger qu'il soit près du haut - une position qu'il n'a jamais eue, et qui n'est
   * pas ce qui compte : ce qui compte est qu'on n'ait pas à le chercher.
   */
  await expect(page.getByText("À régler aujourd'hui")).toBeInViewport();

  const bouton = page.getByRole("button", { name: /Régler et confier/ }).first();
  await expect(bouton).toBeInViewport();
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
  /*
   * La frise dit l'étape, la pastille ne la redit plus.
   *
   * « Étape 1 sur 7 » doublait le fil qui la surplombe, en plus précis que lui : quatre
   * éléments répondaient à « où suis-je » sur cet écran, en comptant le fil d'Ariane et
   * la colonne. La frise situe et permet de revenir en arrière ; elle suffit.
   */
  await expect(page.getByRole("button", { name: /1.*Société/ }).first()).toBeVisible();
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
  /*
   * Les deux champs s'appellent « Code postal » et « Ville ».
   *
   * Ils portaient « Nouveau code postal » et « Nouvelle ville » ; depuis qu'ils
   * tiennent sur la même ligne que « Nouvelle adresse », le mot n'apporte plus rien et
   * a été retiré. Le test cherchait donc des champs qui n'existent plus.
   */
  await expect(adresse).not.toHaveValue("12 rue de la Répu");
  await expect(page.getByLabel("Code postal", { exact: true })).not.toHaveValue("");
  await expect(page.getByLabel("Ville", { exact: true })).not.toHaveValue("");

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
  /*
   * « En qualité de » est une liste, non un champ libre.
   *
   * Les sélecteurs du parcours ne sont plus des <select> ni des champs texte : c'est
   * un bouton qui ouvre une liste `role="listbox"`. Le test le remplissait au clavier,
   * ce qu'aucun bouton n'accepte.
   */
  await page.getByLabel("En qualité de").click();
  await page.getByRole("option", { name: /Président/ }).first().click();
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

/*
 * Les cinq essais de l'éditeur de statuts sont partis dans avocat-modification.
 *
 * Ils ouvraient l'éditeur depuis le parcours du client, à l'étape des actes. Cette
 * étape ne lui est plus servie : une fois le dossier réglé, il suit son avancement et
 * ne saisit plus rien - les actes et leurs retouches appartiennent au cabinet. Les
 * essais visaient donc un écran que le serveur refuse d'ouvrir, et cherchaient un
 * bouton qu'aucun client ne voit.
 *
 * Ce qu'ils garantissent vaut toujours : le texte d'un cadre est bien peint une fois
 * refermé, la barre de mise en forme règle vraiment, un clic dehors referme. Ils le
 * vérifient là où l'éditeur vit.
 */

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

  /*
   * Le destinataire se choisit avant d'être nommé.
   *
   * Le formulaire demandait « Nom du cessionnaire » dans un champ libre ; il demande
   * maintenant d'abord qui c'est - un associé, qu'on prend dans la liste, ou un tiers,
   * qui entre au capital et qu'on nomme. Le test remplissait un champ qui n'existe que
   * dans la seconde branche, sans l'avoir choisie.
   */
  await page.getByRole("radio", { name: "un tiers, qui entre au capital" }).check();
  await page.getByLabel("Civilité, prénom et nom").fill("Paul BERNARD");
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

test("la colonne de droite rappelle ce qu'on change, et suit la frappe", async ({
  page,
  request,
}) => {
  /*
   * On coche les changements à l'étape deux et l'on remplit leurs détails à l'étape
   * trois : entre les deux, rien à l'écran ne disait plus lesquels on avait pris.
   */
  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: {
      dossier,
      societe: SOCIETE,
      codes: ["transfert_siege", "denomination"],
      assemblee: { date: "2026-05-15", associes: [] },
    },
  });
  await page.goto("/modification?dossier=" + dossier + "&etape=3");

  const colonne = page.getByRole("complementary", {
    name: "Récapitulatif de votre modification",
  });
  await expect(colonne).toBeVisible();
  await expect(colonne.getByText("ESSAI MODIFICATION")).toBeVisible();
  await expect(colonne.getByText("552 100 554")).toBeVisible();
  await expect(colonne.getByText("15 000 €")).toBeVisible();
  await expect(colonne.getByText("15 mai 2026")).toBeVisible();

  /* Les deux changements cochés, sous leur intitulé court. */
  await expect(colonne.getByRole("listitem")).toHaveText(["Siège social", "Dénomination"]);
});

test("une étape 3 remplie mène à l'assemblée, même sans associé inscrit", async ({
  page,
  request,
}) => {
  /*
   * Le cul-de-sac : les manques du procès-verbal étaient mêlés à ceux des détails, si
   * bien que « Continuer » refusait d'avancer en disant « Aucun associé n'est inscrit à
   * l'assemblée » - et l'assemblée est l'étape suivante, qu'on ne pouvait donc pas
   * atteindre. Le dossier n'était plus récupérable autrement qu'en tapant `?etape=4`.
   */
  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: {
      dossier,
      societe: SOCIETE,
      codes: ["transfert_siege"],
      valeurs: {
        nouvelleAdresse: "3 rue de la Forge",
        nouveauCodePostal: "69003",
        nouvelleVille: "Lyon",
        dateEffetTransfert: "2026-09-15",
      },
      assemblee: { date: "2026-09-01", associes: [] },
    },
  });

  await page.goto("/modification?dossier=" + dossier + "&etape=3");
  await page.getByRole("button", { name: "Continuer" }).click();

  await expect(page.getByRole("heading", { name: "L'assemblée" })).toBeVisible();

  /*
   * Et c'est là que la phrase se lit, sous le formulaire qui la répare - à l'essai
   * suivant : on ne reproche rien à qui vient d'arriver sur l'étape.
   */
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByText("Aucun associé n'est inscrit")).toBeVisible();
  await expect(page.getByRole("heading", { name: "L'assemblée" })).toBeVisible();
});

test("« Corriger » mène à l'étape où le manque se répare", async ({ page, request }) => {
  /*
   * Le bouton renvoyait à l'étape 1 ou à l'étape 3, jamais ailleurs : un associé
   * manquant à l'assemblée menait aux détails, une étape trop tôt.
   */
  const dossier = await ouvrirUnDossier(request);
  await request.put("/api/formalites/modification", {
    data: {
      dossier,
      societe: SOCIETE,
      codes: ["transfert_siege"],
      valeurs: {
        nouvelleAdresse: "3 rue de la Forge",
        nouveauCodePostal: "69003",
        nouvelleVille: "Lyon",
        dateEffetTransfert: "2026-09-15",
      },
      assemblee: { date: "2026-09-01", associes: [] },
    },
  });

  await page.goto("/modification?dossier=" + dossier + "&etape=6");
  await page.getByRole("button", { name: "Corriger" }).click();

  await expect(page.getByRole("heading", { name: "L'assemblée" })).toBeVisible();
});
