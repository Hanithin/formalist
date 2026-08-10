import { test, expect } from "@playwright/test";

/**
 * Transitions de dossier, montée en offre et conversion PDF.
 */

/** Crée un dossier appartenant au compte d'essai et rend son identifiant. */
async function nouveauDossier(request: import("@playwright/test").APIRequestContext) {
  const { dossier } = await (await request.post("/api/formalites/brouillon")).json();
  return dossier as number;
}

test.describe("transitions, côté avocat", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  test("l'avocat fait passer un dossier en validation", async ({ request }) => {
    const dossiers = await (await request.get("/api/formalites")).json();
    const cible = dossiers.dossiers.find(
      (d: { societe: string }) => d.societe === "PARCOURS EN COURS"
    );

    const reponse = await request.put("/api/avocat/dossier", {
      data: { dossier: cible.id, etat: "en_attente_validation" },
    });
    expect(reponse.status()).toBe(200);
    expect((await reponse.json()).etat).toBe("en_attente_validation");
  });

  test("on ne saute pas d'étape", async ({ request }) => {
    const dossiers = await (await request.get("/api/formalites")).json();
    // Un dossier immatriculé, assigné à cet avocat : il ne revient pas en arrière.
    const cible = dossiers.dossiers.find(
      (d: { societe: string }) => d.societe === "PARCOURS IMMATRICULEE"
    );

    const reponse = await request.put("/api/avocat/dossier", {
      data: { dossier: cible.id, etat: "en_attente_validation" },
    });
    expect(reponse.status()).toBe(403);
    expect((await reponse.json()).error).toContain("ne peut pas passer");
  });

  test("un état inventé est refusé", async ({ request }) => {
    const dossiers = await (await request.get("/api/formalites")).json();
    const cible = dossiers.dossiers[0];

    const reponse = await request.put("/api/avocat/dossier", {
      data: { dossier: cible.id, etat: "etat_invente" },
    });
    expect(reponse.status()).toBe(403);
  });

  test("repasser au même état ne change rien et ne se plaint pas", async ({ request }) => {
    const dossiers = await (await request.get("/api/formalites")).json();
    const cible = dossiers.dossiers[0];

    const premier = await request.put("/api/avocat/dossier", {
      data: { dossier: cible.id, etat: cible.status },
    });
    expect(premier.status()).toBe(200);
    expect((await premier.json()).inchange).toBe(true);
  });

  test("un avocat ne s'assigne qu'à lui-même", async ({ request }) => {
    const dossiers = await (await request.get("/api/formalites")).json();
    const cible = dossiers.dossiers[0];

    const reponse = await request.put("/api/avocat/dossier", {
      data: { dossier: cible.id, avocat: 999999 },
    });
    expect(reponse.status()).toBe(403);
  });
});

test.describe("un client ne fait pas transiter son dossier", () => {
  test("le changement d'état lui est refusé", async ({ request }) => {
    const dossier = await nouveauDossier(request);
    const reponse = await request.put("/api/avocat/dossier", {
      data: { dossier, etat: "valide" },
    });
    expect(reponse.status()).toBe(403);
  });
});

test.describe("montée en offre", () => {
  test("le client monte d'offre sur son dossier", async ({ request }) => {
    const dossier = await nouveauDossier(request);

    const reponse = await request.put("/api/formalites/offre", {
      data: { dossier, offre: "business" },
    });
    expect(reponse.status()).toBe(200);
    expect((await reponse.json()).offre).toBe("business");
  });

  test("on ne redescend pas", async ({ request }) => {
    const dossier = await nouveauDossier(request);
    await request.put("/api/formalites/offre", { data: { dossier, offre: "premium" } });

    const reponse = await request.put("/api/formalites/offre", {
      data: { dossier, offre: "starter" },
    });
    expect(reponse.status()).toBe(403);
  });

  test("une offre inventée est refusée", async ({ request }) => {
    const dossier = await nouveauDossier(request);
    const reponse = await request.put("/api/formalites/offre", {
      data: { dossier, offre: "platine" },
    });
    expect(reponse.status()).toBe(403);
  });

  test("le dossier d'un autre client est refusé", async ({ request }) => {
    const reponse = await request.put("/api/formalites/offre", {
      data: { dossier: 999999, offre: "business" },
    });
    expect(reponse.status()).toBe(403);
  });
});

test.describe("conversion PDF", () => {
  test("un fichier qu'on n'a pas le droit de lire ne se convertit pas", async ({ request }) => {
    // Sans ce contrôle, la conversion deviendrait un moyen détourné de lire les
    // documents des autres.
    const reponse = await request.get("/api/formalites/pdf?nom=fichier-inconnu.docx");
    expect(reponse.status()).toBe(404);
  });

  test("un format autre que Word est refusé", async ({ request }) => {
    const reponse = await request.get("/api/formalites/pdf?nom=" + encodeURIComponent("../db.js"));
    expect([400, 404]).toContain(reponse.status());
  });

  test("sans session, rien n'est converti", async ({ browser }) => {
    const anonyme = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const reponse = await anonyme.request.get("/api/formalites/pdf?nom=quelconque.docx");
    expect(reponse.status()).toBe(401);
    await anonyme.close();
  });
});
