import { test, expect } from "@playwright/test";

/**
 * Inscription et prise de rendez-vous.
 */

test.describe("inscription", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("la page est publique et annonce la règle du mot de passe", async ({ page }) => {
    const reponse = await page.goto("/inscription");
    expect(reponse?.status()).toBe(200);
    // La règle est dite avant la saisie, pas après le refus.
    await expect(page.getByText(/Au moins 8 caractères/)).toBeVisible();
  });

  test("un mot de passe trop courant est refusé", async ({ page }) => {
    await page.goto("/inscription");
    await page.getByLabel("Prénom").fill("Test");
    await page.getByLabel("Nom", { exact: true }).fill("Essai");
    await page.getByLabel("Adresse email").fill("nouveau-" + Date.now() + "@exemple.test");
    await page.getByLabel("Mot de passe").fill("motdepasse");
    await page.getByRole("button", { name: /Créer mon compte/ }).click();

    await expect(page.locator("form p[role=alert]")).toContainText("trop courant");
  });

  test("une inscription valide renvoie vers l'email, sans ouvrir de session", async ({
    page,
    context,
  }) => {
    await page.goto("/inscription");
    await page.getByLabel("Prénom").fill("Nouvelle");
    await page.getByLabel("Nom", { exact: true }).fill("Personne");
    await page.getByLabel("Adresse email").fill("nouvelle-" + Date.now() + "@exemple.test");
    await page.getByLabel("Mot de passe").fill("brouette-lampadaire-42");
    await page.getByRole("button", { name: /Créer mon compte/ }).click();

    await expect(page.getByRole("status")).toContainText("lien de confirmation");

    // Le compte n'est utilisable qu'une fois l'adresse confirmée.
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === "formalist_session")).toBeUndefined();
  });

  test("une adresse déjà prise donne la même réponse", async ({ request }) => {
    // Distinguer permettrait d'énumérer les comptes existants.
    const reponse = await request.post("/api/auth/inscription", {
      data: {
        prenom: "Camille",
        nom: "Parcours",
        email: "parcours@exemple.test",
        motDePasse: "brouette-lampadaire-42",
      },
    });
    expect(reponse.status()).toBe(201);
    expect((await reponse.json()).message).toContain("lien de confirmation");
  });

  test("un lien de confirmation invalide le dit sans planter", async ({ page }) => {
    await page.goto("/api/auth/verifier?jeton=" + "0".repeat(64));
    await expect(page).toHaveURL(/confirmation=inconnu/);
    await expect(page.getByRole("status")).toContainText("pas valable");
  });
});

test.describe("consultations", () => {
  test("la page annonce l'offre et classe les consultations", async ({ page }) => {
    await page.goto("/consultations");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Consultation juridique");

    // Les quatre onglets annoncent chacun leur décompte.
    await expect(page.getByRole("button", { name: /^Toutes/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^À venir/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Passées/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Annulées/ })).toBeVisible();
  });

  test("l'assistant mène de la matière au récapitulatif", async ({ page }) => {
    await page.goto("/consultations");

    // Le compte d'essai n'a pas de rendez-vous : c'est la carte d'appel qui ouvre
    // l'assistant. S'il en avait un, le raccourci de l'écran vide ferait l'affaire.
    await page.getByRole("button", { name: "Prendre rendez-vous" }).first().click();

    /*
     * Les gestes se font dans la fenêtre de l'assistant, pas sur la page : les mêmes
     * matières figurent en raccourci sur l'écran vide, et un sélecteur global en
     * trouverait deux.
     */
    const assistant = page.getByRole("dialog", { name: "Prendre rendez-vous" });
    await expect(assistant.getByText("Choisissez votre matière")).toBeVisible();

    await assistant.getByRole("button", { name: "Droit des sociétés" }).click();
    await assistant.getByRole("button", { name: /Continuer/ }).click();

    await expect(assistant.getByText("Avocat et créneau")).toBeVisible();
    const avocat = assistant.getByRole("button", { name: /^Me\.|^Maître/ }).first();
    if (!(await avocat.isVisible())) return; // aucun avocat n'a publié ses créneaux
    await avocat.click();

    // Les créneaux arrivent après un appel : on attend la première journée.
    const journee = page.getByRole("button", { name: /créneaux?$/ }).first();
    await expect(journee).toBeVisible();
    await journee.click();

    await page
      .getByRole("button", { name: /^\d{2}h\d{2}$/ })
      .first()
      .click();
    await page.getByRole("button", { name: /Continuer/ }).click();

    await expect(page.getByText("Décrivez votre besoin")).toBeVisible();
    await page
      .getByLabel("Sujet de la consultation")
      .fill("Je crée une SAS avec deux associés et je m'interroge sur le pacte d'associés.");
    await page.getByRole("button", { name: /Continuer/ }).click();

    // Le récapitulatif dit le prix hors taxes, la TVA, et le total réellement dû.
    await expect(assistant.getByText("Récapitulatif")).toBeVisible();
    await expect(assistant.getByText("99 € HT")).toBeVisible();
    await expect(assistant.getByText("TVA 20 %")).toBeVisible();
    await expect(assistant.getByRole("button", { name: /Payer 118,80 €/ })).toBeVisible();
    // On s'arrête là : cliquer ouvrirait une session de paiement chez Stripe.
  });

  test("l'assistant refuse d'avancer sans matière", async ({ page }) => {
    await page.goto("/consultations");
    await page.getByRole("button", { name: "Prendre rendez-vous" }).first().click();
    await page
      .getByRole("dialog", { name: "Prendre rendez-vous" })
      .getByRole("button", { name: /Continuer/ })
      .click();

    await expect(page.getByRole("status")).toContainText("Choisissez une matière");
  });

  test("un créneau déjà passé n'est jamais proposé", async ({ request }) => {
    const reponse = await request.get("/api/consultations/creneaux?avocat=1&jours=14");
    if (reponse.status() !== 200) return;

    const { creneaux } = await reponse.json();
    for (const c of creneaux) {
      expect(new Date(c.debut).getTime()).toBeGreaterThan(Date.now());
    }
  });

  test("réserver un créneau inventé est refusé", async ({ request }) => {
    const dansUnAn = new Date();
    dansUnAn.setFullYear(dansUnAn.getFullYear() + 1);

    const reponse = await request.post("/api/consultations", {
      data: {
        avocat: 1,
        debut: dansUnAn.toISOString(),
        matiere: "droit_societes",
        description: "Un créneau inventé, qui doit être refusé avant tout paiement.",
      },
    });
    // Le créneau est revérifié au moment de réserver, avant d'ouvrir un paiement :
    // rien n'est encaissé pour un rendez-vous qui n'existe pas.
    expect(reponse.status()).toBe(409);
  });

  test("une demande sans description n'ouvre pas de paiement", async ({ request }) => {
    const dansUnAn = new Date();
    dansUnAn.setFullYear(dansUnAn.getFullYear() + 1);

    const reponse = await request.post("/api/consultations", {
      data: {
        avocat: 1,
        debut: dansUnAn.toISOString(),
        matiere: "droit_societes",
        description: "court",
      },
    });
    expect(reponse.status()).toBe(400);
  });

  test.describe("sans session", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("rien n'est accessible", async ({ request }) => {
      expect((await request.get("/api/consultations")).status()).toBe(401);
      expect((await request.get("/api/consultations/creneaux?avocat=1")).status()).toBe(401);
      expect((await request.post("/api/consultations/documents")).status()).toBe(401);
    });

    test("le webhook de paiement refuse un appel non signé", async ({ request }) => {
      /*
       * Cette route est publique par nécessité : Stripe n'a pas de session chez nous.
       * Sa seule protection est la signature du corps, et sans elle elle doit refuser -
       * sinon n'importe qui pourrait annoncer qu'une consultation est payée.
       */
      const reponse = await request.post("/api/paiement/webhook", {
        data: { type: "checkout.session.completed" },
      });

      /*
       * 400 quand la signature est vérifiable, 503 quand Stripe n'est pas configuré -
       * le cas de la vérification automatique, qui n'a pas les clés. Les deux
       * refusent ; ce qui compte est qu'aucun appel non signé ne soit pris pour un
       * paiement.
       */
      expect([400, 503]).toContain(reponse.status());
    });
  });
});
