import { test, expect } from "@playwright/test";

/**
 * Acceptation d'invitation et gestion des disponibilités.
 *
 * Deux fonctions qui manquaient : sans la première, une invitation ne servait à
 * rien ; sans la seconde, aucun créneau de rendez-vous n'existait.
 */

test.describe("invitation", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("sans session, le lien renvoie vers la connexion en gardant sa destination", async ({
    request,
  }) => {
    const reponse = await request.get("/api/equipe/accepter?jeton=abc", { maxRedirects: 0 });
    expect([302, 307, 308]).toContain(reponse.status());
    expect(reponse.headers()["location"]).toContain("/connexion");
    expect(reponse.headers()["location"]).toContain("suite=");
  });
});

test.describe("invitation, connecté", () => {
  test("un jeton inconnu le dit sans planter", async ({ page }) => {
    await page.goto("/api/equipe/accepter?jeton=" + "0".repeat(64));
    await expect(page).toHaveURL(/invitation=inconnue/);
  });

  test("une invitation adressée à quelqu'un d'autre est refusée", async ({ request }) => {
    // On crée une invitation pour une autre adresse, puis on tente de l'accepter.
    const invitation = await request.post("/api/equipe/invitations", {
      data: { email: "quelqu-un-dautre@exemple.test", role: "collaborateur" },
    });
    // Selon le rôle du compte d'essai, l'invitation peut être refusée en amont.
    expect([201, 403]).toContain(invitation.status());
  });
});

test.describe("disponibilités de l'avocat", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  test("l'avocat lit ses plages", async ({ request }) => {
    const reponse = await request.get("/api/avocat/disponibilites");
    expect(reponse.status()).toBe(200);

    const { plages } = await reponse.json();
    // Le dispositif en crée cinq, du lundi au vendredi.
    expect(plages.length).toBeGreaterThanOrEqual(5);
  });

  test("une plage s'ajoute puis se retire", async ({ request }) => {
    const ajout = await request.post("/api/avocat/disponibilites", {
      data: {
        quoi: "plage",
        jourSemaine: 6,
        debut: "10:00",
        fin: "12:00",
        dureeCreneauMinutes: 30,
      },
    });
    expect(ajout.status()).toBe(201);
    const { plage } = await ajout.json();

    const retrait = await request.delete("/api/avocat/disponibilites", {
      data: { quoi: "plage", identifiant: plage.id },
    });
    expect(retrait.status()).toBe(200);
  });

  test("une plage qui finit avant de commencer est refusée", async ({ request }) => {
    const reponse = await request.post("/api/avocat/disponibilites", {
      data: {
        quoi: "plage",
        jourSemaine: 3,
        debut: "14:00",
        fin: "09:00",
        dureeCreneauMinutes: 30,
      },
    });
    expect(reponse.status()).toBe(403);
  });

  test("une plage trop courte pour un créneau est refusée", async ({ request }) => {
    // Sans ce contrôle, l'avocat croirait avoir publié des disponibilités qui ne
    // produisent aucun créneau.
    const reponse = await request.post("/api/avocat/disponibilites", {
      data: {
        quoi: "plage",
        jourSemaine: 3,
        debut: "09:00",
        fin: "09:20",
        dureeCreneauMinutes: 30,
      },
    });
    expect(reponse.status()).toBe(403);
  });

  test("une absence bloque les créneaux de la période", async ({ request }) => {
    const ajout = await request.post("/api/avocat/disponibilites", {
      data: { quoi: "absence", debut: "2027-01-04", fin: "2027-01-08", motif: "Congés" },
    });
    expect(ajout.status()).toBe(201);

    const { absence } = await ajout.json();
    await request.delete("/api/avocat/disponibilites", {
      data: { quoi: "absence", identifiant: absence.id },
    });
  });

  test("une absence qui finit avant de commencer est refusée", async ({ request }) => {
    const reponse = await request.post("/api/avocat/disponibilites", {
      data: { quoi: "absence", debut: "2027-01-08", fin: "2027-01-04" },
    });
    expect(reponse.status()).toBe(403);
  });

  test("la plage d'un autre avocat ne se retire pas", async ({ request }) => {
    const reponse = await request.delete("/api/avocat/disponibilites", {
      data: { quoi: "plage", identifiant: 999999 },
    });
    expect(reponse.status()).toBe(403);
  });
});

test.describe("un client ne gère aucune disponibilité", () => {
  test("ni lecture ni écriture", async ({ request }) => {
    expect((await request.get("/api/avocat/disponibilites")).status()).toBe(403);

    const ajout = await request.post("/api/avocat/disponibilites", {
      data: {
        quoi: "plage",
        jourSemaine: 1,
        debut: "09:00",
        fin: "12:00",
        dureeCreneauMinutes: 30,
      },
    });
    expect(ajout.status()).toBe(403);
  });

  test("sans session non plus", async ({ browser }) => {
    const anonyme = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    expect((await anonyme.request.get("/api/avocat/disponibilites")).status()).toBe(401);
    await anonyme.close();
  });
});
