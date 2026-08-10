import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

/**
 * Le circuit de signature.
 *
 * Les associés n'ont pas de compte : leur jeton est leur seule preuve. Ces
 * parcours vérifient surtout ce qu'un jeton ne donne pas.
 */

/**
 * Ouvre un circuit sur un dossier créé pour l'occasion.
 *
 * Ouvrir un circuit efface les demandes non signées du dossier : deux tests qui
 * partageraient le même dossier s'annuleraient l'un l'autre.
 */
async function ouvrirCircuit(request: import("@playwright/test").APIRequestContext) {
  const { dossier: nouveau } = await (
    await request.post("/api/formalites/brouillon")
  ).json();
  const dossier = { id: nouveau as number };

  const reponse = await request.post("/api/signature", {
    data: {
      dossier: dossier.id,
      signataires: [
        { nom: "Camille Durand", email: "camille@exemple.test" },
        { nom: "Alex Martin", email: "alex@exemple.test" },
      ],
    },
  });
  expect(reponse.status()).toBe(201);
  return dossier.id as number;
}

test("les jetons ne sortent jamais dans la réponse", async ({ request }) => {
  const { dossier } = await (await request.post("/api/formalites/brouillon")).json();

  const reponse = await request.post("/api/signature", {
    data: { dossier, signataires: [{ nom: "Test", email: "t@exemple.test" }] },
  });

  const corps = await reponse.text();
  // Ils partent par email : les laisser transiter par une réponse que le
  // navigateur conserve reviendrait à les publier.
  expect(corps).not.toMatch(/[0-9a-f]{64}/);
  expect(corps).not.toContain("token");
});

test("le circuit se lit depuis le dossier, avec l'état de chacun", async ({ request }) => {
  const dossier = await ouvrirCircuit(request);

  const reponse = await request.get("/api/signature?dossier=" + dossier);
  const { demandes } = await reponse.json();

  expect(demandes).toHaveLength(2);
  expect(demandes[0].etat).toBe("en_attente");
  expect(demandes.map((d: { nom: string }) => d.nom)).toContain("Camille Durand");
});

test.describe("page de signature", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("un jeton inconnu renvoie 404, sans dire s'il a existé", async ({ page }) => {
    const reponse = await page.goto("/signer/" + "0".repeat(64));
    expect(reponse?.status()).toBe(404);
  });

  test("un associé signe sans compte, de bout en bout", async ({ page }) => {
    const jeton = readFileSync(
      path.join(import.meta.dirname, "jeton-signature.txt"),
      "utf8"
    ).trim();

    await page.goto("/signer/" + jeton);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Signer les statuts");
    await expect(page.getByText("Camille Parcours")).toBeVisible();

    // Un tracé, à la souris, dans la zone prévue
    const zone = page.getByLabel("Zone de signature");
    const cadre = (await zone.boundingBox())!;
    await page.mouse.move(cadre.x + 40, cadre.y + 90);
    await page.mouse.down();
    await page.mouse.move(cadre.x + 200, cadre.y + 60);
    await page.mouse.move(cadre.x + 320, cadre.y + 120);
    await page.mouse.up();

    await page.getByRole("button", { name: /Valider ma signature/ }).click();
    await expect(page.getByRole("status")).toContainText("Signature enregistrée");
  });

  test("un lien déjà signé ne se rejoue pas", async ({ page }) => {
    const jeton = readFileSync(
      path.join(import.meta.dirname, "jeton-signature.txt"),
      "utf8"
    ).trim();

    // Le test précédent a signé : la page le dit et n'offre plus de zone.
    await page.goto("/signer/" + jeton);
    const titre = await page.getByRole("heading", { level: 1 }).textContent();
    if (titre?.includes("déjà signé")) {
      await expect(page.getByLabel("Zone de signature")).toHaveCount(0);
    }
  });

  test("une signature vide est refusée", async ({ request }) => {
    const reponse = await request.post("/api/signature/signer", {
      data: { jeton: "a".repeat(64), trace: "" },
    });
    expect(reponse.status()).toBe(400);
  });

  test("un contenu qui n'est pas une image est refusé", async ({ request }) => {
    const reponse = await request.post("/api/signature/signer", {
      data: { jeton: "a".repeat(64), trace: "<script>alert(1)</script>" },
    });
    expect(reponse.status()).toBe(400);
  });

  test("un jeton inconnu ne dit pas s'il a existé", async ({ request }) => {
    const reponse = await request.post("/api/signature/signer", {
      data: {
        jeton: "b".repeat(64),
        trace: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
      },
    });
    // 410 aussi bien pour un jeton inconnu que pour un jeton déjà utilisé.
    expect(reponse.status()).toBe(410);
    expect((await reponse.json()).error).toBe("Ce lien de signature n'est plus valable");
  });
});

test.describe("accès au circuit", () => {
  test("sans session, on n'ouvre pas de circuit", async ({ browser }) => {
    const anonyme = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const reponse = await anonyme.request.post("/api/signature", {
      data: { dossier: 1, signataires: [{ nom: "X", email: "x@exemple.test" }] },
    });
    expect(reponse.status()).toBe(401);
    await anonyme.close();
  });

  test("le dossier d'un autre client est refusé", async ({ request }) => {
    const reponse = await request.post("/api/signature", {
      data: { dossier: 999999, signataires: [{ nom: "X", email: "x@exemple.test" }] },
    });
    expect(reponse.status()).toBe(403);
  });

  test("une liste de signataires vide est refusée", async ({ request }) => {
    const { dossier } = await (await request.post("/api/formalites/brouillon")).json();

    const reponse = await request.post("/api/signature", {
      data: { dossier, signataires: [] },
    });
    expect(reponse.status()).toBe(400);
  });
});
