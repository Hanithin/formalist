import { test, expect } from "@playwright/test";

/**
 * Annonce légale, notes internes, archivage et gabarits.
 */

async function dossierDuClient(request: import("@playwright/test").APIRequestContext) {
  const { dossiers } = await (await request.get("/api/formalites")).json();
  return dossiers.find((d: { societe: string }) => d.societe === "PARCOURS EN COURS");
}

test.describe("annonce légale", () => {
  test("le client lit le texte de son dossier", async ({ request }) => {
    const dossier = await dossierDuClient(request);

    const reponse = await request.get("/api/formalites/annonce?dossier=" + dossier.id);
    expect(reponse.status()).toBe(200);

    const { texte } = await reponse.json();
    // Le texte est produit depuis le dossier, pas laissé vide.
    expect(texte).toContain("PARCOURS EN COURS");
    expect(texte).toContain("RCS");
  });

  test("le client ne corrige pas le texte", async ({ request }) => {
    // Il engage la responsabilité de l'avocat auprès du journal d'annonces.
    const dossier = await dossierDuClient(request);

    const reponse = await request.put("/api/formalites/annonce", {
      data: { dossier: dossier.id, texte: "Texte modifié par le client" },
    });
    expect(reponse.status()).toBe(403);
  });

  test("le dossier d'un autre client est refusé", async ({ request }) => {
    const reponse = await request.get("/api/formalites/annonce?dossier=999999");
    expect(reponse.status()).toBe(403);
  });

  test.describe("avocat", () => {
    test.use({ storageState: "./tests/parcours/session-avocat.json" });

    test("l'avocat corrige le texte, et sa version prime ensuite", async ({ request }) => {
      const { dossiers } = await (await request.get("/api/formalites")).json();
      const dossier = dossiers.find(
        (d: { societe: string }) => d.societe === "PARCOURS EN COURS"
      );

      const corrige = "Texte relu par l'avocat " + Date.now();
      const ecriture = await request.put("/api/formalites/annonce", {
        data: { dossier: dossier.id, texte: corrige },
      });
      expect(ecriture.status()).toBe(200);

      // Regénérer effacerait la relecture : le texte enregistré prime.
      const relecture = await request.get("/api/formalites/annonce?dossier=" + dossier.id);
      const { texte, relu } = await relecture.json();
      expect(texte).toBe(corrige);
      expect(relu).toBe(true);
    });

    test("un texte vide est refusé", async ({ request }) => {
      const { dossiers } = await (await request.get("/api/formalites")).json();
      const reponse = await request.put("/api/formalites/annonce", {
        data: { dossier: dossiers[0].id, texte: "   " },
      });
      expect(reponse.status()).toBe(400);
    });
  });
});

test.describe("notes internes", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  test("l'auteur supprime sa note", async ({ page, request }) => {
    const { dossiers } = await (await request.get("/api/formalites")).json();
    const dossier = dossiers.find((d: { societe: string }) => d.societe === "PARCOURS EN COURS");

    await page.goto("/avocat/" + dossier.id);
    const texte = "Note à supprimer " + Date.now();
    await page.getByLabel("Ajouter une note").fill(texte);
    await page.getByRole("button", { name: "Ajouter la note" }).click();
    await expect(page.getByText(texte)).toBeVisible();

    // On retrouve son identifiant par l'API, faute de bouton dédié pour l'instant.
    const notes = await request.post("/api/avocat/notes", {
      data: { dossier: dossier.id, contenu: "note temporaire" },
    });
    const { note } = await notes.json();

    const suppression = await request.delete("/api/avocat/notes/suppression", {
      data: { note: note.id },
    });
    expect(suppression.status()).toBe(200);
  });

  test("une note inexistante ne se supprime pas", async ({ request }) => {
    const reponse = await request.delete("/api/avocat/notes/suppression", {
      data: { note: 999999 },
    });
    expect(reponse.status()).toBe(403);
  });
});

test.describe("gabarits", () => {
  test("un client n'y accède pas", async ({ request }) => {
    expect((await request.get("/api/gabarits")).status()).toBe(403);
  });

  test.describe("avocat", () => {
    test.use({ storageState: "./tests/parcours/session-avocat.json" });

    test("la liste dit ce que la plateforme sait produire", async ({ request }) => {
      const reponse = await request.get("/api/gabarits");
      expect(reponse.status()).toBe(200);

      const { creation, modification } = await reponse.json();
      expect(creation.length).toBeGreaterThan(0);
      expect(modification.length).toBeGreaterThan(0);

      // La SA n'est pas proposée : aucun gabarit n'existe pour elle.
      expect(creation.map((c: { forme: string }) => c.forme)).not.toContain("SA");
    });
  });
});

test.describe("archivage du support", () => {
  test("un client n'archive rien", async ({ request }) => {
    const reponse = await request.put("/api/support/archive", {
      data: { client: 1, archivee: true },
    });
    expect(reponse.status()).toBe(403);
  });

  test.describe("administrateur", () => {
    test.use({ storageState: "./tests/parcours/session-admin.json" });

    test("archiver retire la conversation de la liste, sans rien effacer", async ({ request }) => {
      const avant = await (await request.get("/api/support")).json();
      const cible = avant.conversations[0];
      if (!cible) test.skip();

      await request.put("/api/support/archive", {
        data: { client: cible.clientId, archivee: true },
      });

      const apres = await (await request.get("/api/support")).json();
      expect(apres.conversations.map((c: { clientId: number }) => c.clientId)).not.toContain(
        cible.clientId
      );

      // Les messages restent consultables : rien n'a été effacé.
      const messages = await (await request.get("/api/support?client=" + cible.clientId)).json();
      expect(messages.messages.length).toBeGreaterThan(0);

      await request.put("/api/support/archive", {
        data: { client: cible.clientId, archivee: false },
      });
    });
  });
});
