import { test, expect } from "@playwright/test";

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

test("les changements se cochent dès l'écran d'entrée, et plusieurs à la fois", async ({ page }) => {
  /*
   * Ils y étaient en cartes inertes : elles avaient tout l'air de cases à cocher et
   * n'en étaient pas. On cliquait, rien ne se passait.
   */
  await page.goto("/modification");

  await page.getByText("Transfert de siège social").click();
  await page.getByText("Changement de dénomination").click();
  await expect(page.getByText("2 modifications sélectionnées")).toBeVisible();

  // Un second clic décoche : la sélection se corrige sans repartir de zéro.
  await page.getByText("Transfert de siège social").click();
  await expect(page.getByText("1 modification sélectionnée")).toBeVisible();

  await page.getByRole("button", { name: "Commencer" }).click();
  await page.waitForURL(/\/modification\?dossier=\d+/);

  // La sélection a suivi le dossier plutôt que d'être reperdue en changeant d'écran.
  await page.goto(page.url() + "&etape=2");
  await expect(page.getByRole("checkbox", { name: /Changement de dénomination/ })).toBeChecked();
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

test("les cartes d'une même ligne ont la même hauteur", async ({ page }) => {
  // « Changement de dirigeant » a la description la plus longue : sa carte dépassait
  // sa voisine, et la grille se lisait de travers.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/modification");

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
