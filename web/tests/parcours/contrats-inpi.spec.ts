import { test, expect } from "@playwright/test";

/**
 * Contrats et registre national.
 */

test.describe("contrats", () => {
  test("un contrat se crée puis s'enregistre", async ({ request }) => {
    const creation = await request.post("/api/contrats", {
      data: { type: "prestation", titre: "Refonte du site" },
    });
    expect(creation.status()).toBe(201);
    const { contrat } = await creation.json();

    const enregistrement = await request.put("/api/contrats/" + contrat.id, {
      data: {
        valeurs: {
          partieA: "SARL Exemple",
          partieB: "Studio Durand",
          mission: "Refonte complète",
          montant: 12000,
          dateDebut: "2026-09-01",
        },
      },
    });
    expect(enregistrement.status()).toBe(200);
  });

  test("un type de contrat inventé est refusé", async ({ request }) => {
    const reponse = await request.post("/api/contrats", {
      data: { type: "contrat_de_mariage" },
    });
    expect(reponse.status()).toBe(400);
  });

  test("un contrat incomplet ne se génère pas", async ({ request }) => {
    const { contrat } = await (
      await request.post("/api/contrats", { data: { type: "cdi" } })
    ).json();

    const reponse = await request.put("/api/contrats/" + contrat.id, {
      data: { etat: "genere" },
    });
    expect(reponse.status()).toBe(400);
    expect((await reponse.json()).anomalies.length).toBeGreaterThan(0);
  });

  test("un contrat complet se génère", async ({ request }) => {
    const { contrat } = await (
      await request.post("/api/contrats", { data: { type: "cdi", titre: "Embauche" } })
    ).json();

    await request.put("/api/contrats/" + contrat.id, {
      data: {
        valeurs: {
          partieA: "SARL Exemple",
          partieB: "Camille Durand",
          poste: "Développeuse",
          remuneration: 48000,
          dateDebut: "2026-09-01",
        },
      },
    });

    const reponse = await request.put("/api/contrats/" + contrat.id, {
      data: { etat: "genere" },
    });
    expect(reponse.status()).toBe(200);
  });

  test("on ne saute pas d'étape dans le cycle de vie", async ({ request }) => {
    const { contrat } = await (
      await request.post("/api/contrats", { data: { type: "prestation" } })
    ).json();

    const reponse = await request.put("/api/contrats/" + contrat.id, {
      data: { etat: "signe" },
    });
    expect(reponse.status()).toBe(403);
  });

  test("le contrat d'un autre client est inaccessible", async ({ request }) => {
    const reponse = await request.get("/api/contrats/999999");
    expect(reponse.status()).toBe(403);
  });

  test("sans session, rien n'est accessible", async ({ browser }) => {
    const anonyme = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    expect((await anonyme.request.get("/api/contrats")).status()).toBe(401);
    await anonyme.close();
  });
});

test.describe("registre national", () => {
  test("un SIREN mal formé est refusé avant tout appel extérieur", async ({ request }) => {
    const reponse = await request.get("/api/societe/12345");
    expect(reponse.status()).toBe(400);
    expect((await reponse.json()).error).toContain("neuf chiffres");
  });

  test("sans identifiants configurés, le refus est clair", async ({ request }) => {
    const reponse = await request.get("/api/societe/552100554");
    // 503 quand le registre n'est pas configuré ou ne répond pas, 200 sinon.
    expect([200, 404, 503]).toContain(reponse.status());

    if (reponse.status() === 503) {
      const { error } = await reponse.json();
      // Ni identifiants ni trace d'exécution dans la réponse.
      expect(error).not.toMatch(/INPI_|password|token/i);
    }
  });

  test("sans session, le registre n'est pas interrogeable", async ({ browser }) => {
    // Sans quoi la plateforme servirait de relais gratuit vers l'INPI.
    const anonyme = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    expect((await anonyme.request.get("/api/societe/552100554")).status()).toBe(401);
    await anonyme.close();
  });
});
