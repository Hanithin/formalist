import { test, expect } from "@playwright/test";
import { retirerDossiers } from "./nettoyage";

/**
 * La saisie se garde sans attendre « Continuer ».
 *
 * Quatre parcours n'écrivaient qu'au changement d'étape : tout ce qui était tapé depuis
 * le dernier « Continuer » disparaissait à la moindre actualisation, à la fermeture d'un
 * onglet, à une connexion qui lâche. Il fallait tout retaper, et c'est un client qui l'a
 * signalé.
 *
 * Ce n'est pas la validation qui décide de ce qu'on garde ; c'est elle qui décide qu'on
 * avance. La création l'appliquait depuis longtemps, les quatre autres non.
 */

const semes: number[] = [];

test.afterAll(async () => {
  await retirerDossiers(semes);
});

async function dossier(request: import("@playwright/test").APIRequestContext) {
  const ouverture = await request.post("/api/formalites/modification", {
    data: { codes: ["transfert_siege"] },
  });
  expect(ouverture.status()).toBe(201);
  const identifiant = (await ouverture.json()).dossier as number;
  semes.push(identifiant);

  await request.put("/api/formalites/modification", {
    data: {
      dossier: identifiant,
      etape: 3,
      codes: ["transfert_siege"],
      societe: {
        denomination: "ESSAI REPOS",
        forme: "SARL",
        siren: "552100554",
        adresse: "12 rue de la Paix",
        codePostal: "75002",
        ville: "Paris",
        capital: 3000,
      },
    },
  });

  return identifiant;
}

test("ce qu'on tape survit à une actualisation", async ({ page, request }) => {
  const identifiant = await dossier(request);
  await page.goto("/modification?dossier=" + identifiant + "&etape=3");

  const champ = page.locator("[id*='nouvelleAdresse']").first();
  await champ.fill("99 avenue de la Saisie");

  /* Le repos : on écrit une fois la frappe retombée, non à chaque lettre. */
  await page.waitForTimeout(2500);
  await page.reload();

  await expect(champ).toHaveValue("99 avenue de la Saisie");
});

test("et à un départ qui ne laisse pas le temps du repos", async ({ page, request }) => {
  const identifiant = await dossier(request);
  await page.goto("/modification?dossier=" + identifiant + "&etape=3");

  const champ = page.locator("[id*='nouvelleAdresse']").first();
  await champ.fill("12 boulevard du Départ");

  /*
   * La page s'en va avant la seconde et demie de repos.
   *
   * C'est le cas qui coûte le plus cher : la dernière frappe est celle dont on se
   * souvient. `pagehide` l'écrit, et `keepalive` porte l'envoi au-delà du document.
   */
  await page.evaluate(`window.dispatchEvent(new PageTransitionEvent("pagehide"))`);
  await page.waitForTimeout(1200);
  await page.goto("/modification?dossier=" + identifiant + "&etape=3");

  await expect(champ).toHaveValue("12 boulevard du Départ");
});

test("rien ne part tant que rien n'a changé", async ({ page, request }) => {
  const identifiant = await dossier(request);

  let ecritures = 0;
  page.on("request", (r) => {
    if (r.method() === "PUT" && r.url().includes("/api/formalites/modification")) ecritures += 1;
  });

  await page.goto("/modification?dossier=" + identifiant + "&etape=3");
  await page.waitForTimeout(3000);

  /* Arriver sur une page n'est pas la modifier : une écriture ici ne porterait rien. */
  expect(ecritures).toBe(0);
});
