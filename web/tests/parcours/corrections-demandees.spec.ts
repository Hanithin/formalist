import { test, expect } from "@playwright/test";
import { prisma } from "../../src/infrastructure/db/client";
import { retirerDossiers } from "./nettoyage";
import { COMPTE } from "./preparer";

/**
 * Ce que l'avocat demande de reprendre, vu du client.
 *
 * Le motif saisi par l'avocat ne partait que dans le journal d'audit, que le client ne
 * voit pas. Le courriel lui disait pourtant « le détail est dans votre messagerie », où
 * rien n'était écrit, et l'écran affichait « À vous de jouer » avec un bouton qui menait
 * au formulaire sans un mot d'explication : il apprenait qu'on lui demandait quelque
 * chose sans pouvoir savoir quoi.
 */

const MOTIF = "Le justificatif de domicile date de plus de trois mois. Merci d'en joindre un récent.";

/*
 * Un essai à la fois dans ce fichier.
 *
 * Plusieurs posent des messages non lus sur le même compte, et le bandeau d'accueil
 * n'en montre qu'un : menés de front, chacun vérifiait celui d'un autre.
 */
test.describe.configure({ mode: "serial" });

const semes: number[] = [];

test.afterAll(async () => {
  if (semes.length > 0) await retirerDossiers(semes);
});

async function dossierEnVerification() {
  /*
   * Le compte exact, non le premier qui contient « parcours ».
   *
   * L'administrateur d'essai s'appelle « admin-parcours@exemple.test » : la recherche
   * approchante rendait tantôt l'un, tantôt l'autre, et le dossier appartenait alors à
   * quelqu'un que la session ne connaît pas. L'écran refusait de l'ouvrir, sans que
   * rien n'explique pourquoi.
   */
  const client = await prisma.users.findUniqueOrThrow({ where: { email: COMPTE.email } });
  const avocat = await prisma.users.findFirstOrThrow({
    where: { email: { startsWith: "avocat-parcours" } },
  });

  const dossier = await prisma.formalites.create({
    data: {
      user_id: client.id,
      assigned_avocat_id: avocat.id,
      type: "creation",
      forme: "SASU",
      societe: "CORRECTIONS ESSAI",
      status: "en_attente_validation",
      phase: 5,
      business_sub_phase: "5a",
      data_json: JSON.stringify({ denomination: "CORRECTIONS ESSAI", forme: "SASU", paye: true }),
    },
  });
  semes.push(dossier.id);
  return dossier.id;
}

test.describe("l'avocat demande des corrections", () => {
  test.describe.configure({ mode: "serial" });

  let dossier = 0;

  test.describe("côté avocat", () => {
    test.use({ storageState: "./tests/parcours/session-avocat.json" });

    test("le motif part avec la demande", async ({ request }) => {
      dossier = await dossierEnVerification();

      const reponse = await request.put("/api/avocat/dossier", {
        data: { dossier, etat: "corrections_demandees", commentaire: MOTIF },
      });
      expect(reponse.status()).toBe(200);

      // Il est écrit au fil du dossier, non au seul journal que le client ne voit pas.
      const messages = await prisma.messages.findMany({ where: { formalite_id: dossier } });
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe(MOTIF);
      expect(messages[0].kind).toBe("correction_request");
    });

    test("le motif d'un refus y arrive aussi", async ({ request }) => {
      /*
       * L'avis d'un refus dit « le motif est dans votre messagerie » : il n'y était pas
       * davantage que celui d'une demande de corrections.
       */
      const refuse = await dossierEnVerification();
      const reponse = await request.put("/api/avocat/dossier", {
        data: { dossier: refuse, etat: "rejete", commentaire: "Objet social non conforme." },
      });
      expect(reponse.status()).toBe(200);

      const messages = await prisma.messages.findMany({ where: { formalite_id: refuse } });
      expect(messages.map((m) => m.content)).toEqual(["Objet social non conforme."]);
    });
  });

  test.describe("côté client", () => {
    test("le client lit ce qui est demandé sans le chercher", async ({ page }) => {
      await page.goto("/creation?dossier=" + dossier);

      await expect(page.getByText("À vous de jouer")).toBeVisible();
      await expect(page.getByText("Ce que l'avocat demande")).toBeVisible();
      await expect(page.getByText(MOTIF)).toBeVisible();
    });

    test("et le bouton mène au fil où il peut répondre", async ({ page }) => {
      /*
       * Il menait à l'étape des documents du formulaire : on ne pouvait ni lire la
       * demande, ni y répondre.
       */
      await page.goto("/creation?dossier=" + dossier);
      await page.getByRole("link", { name: "Voir ce qui est demandé" }).click();

      await expect(page).toHaveURL(new RegExp("/messagerie\\?dossier=" + dossier));
      await expect(page.getByText(MOTIF).first()).toBeVisible();
    });
  });
});

test.describe("un dossier parti chez l'avocat", () => {
  test("le formulaire est là quand l'avocat renvoie le dossier", async ({ page }) => {
    // C'est là qu'on reprend ce qui est demandé : sans lui, rien à corriger.
    const renvoye = await dossierEnVerification();
    await prisma.formalites.update({
      where: { id: renvoye },
      data: { status: "corrections_demandees" },
    });

    await page.goto("/creation?dossier=" + renvoye);
    await expect(page.getByText("Informations de la société")).toBeVisible();
    await expect(page.getByText("À vous de jouer")).toBeVisible();
  });

  test("une auto-entreprise ouverte ici mène à sa propre page", async ({ page }) => {
    /*
     * La garde comparait le type à « auto-entreprise » quand la valeur stockée est
     * « auto-entrepreneur » : elle ne se déclenchait jamais, et le dossier s'ouvrait
     * sur le fil de la création - « Capital », « Associé », « Offres ».
     */
    const client = await prisma.users.findUniqueOrThrow({ where: { email: COMPTE.email } });
    const auto = await prisma.formalites.create({
      data: {
        user_id: client.id,
        type: "auto-entrepreneur",
        forme: "AE",
        societe: "AUTO EGAREE",
        status: "en_cours",
        phase: 1,
        data_json: "{}",
      },
    });
    semes.push(auto.id);

    await page.goto("/creation?dossier=" + auto.id);
    await expect(page).toHaveURL(new RegExp("/auto-entrepreneur\\?dossier=" + auto.id));
  });

  test("le formulaire reste accessible une fois le dossier chez l'avocat", async ({ page }) => {
    /*
     * Le masquer paraissait juste - il n'y a plus d'informations à saisir - mais c'est
     * par lui que le client dépose l'attestation de dépôt de capital et celle de
     * parution, que le suivi et les courriels lui réclament précisément à ce
     * moment-là. Le serveur, lui, n'a jamais refusé ces dépôts.
     */
    const parti = await dossierEnVerification();
    await page.goto("/creation?dossier=" + parti);

    await expect(page.getByRole("heading", { name: "Où en est votre dossier" })).toBeVisible();
    await expect(page.getByText("Informations de la société")).toBeVisible();
  });

  test("une modification ouverte ici mène à sa propre page", async ({ page }) => {
    /*
     * Rien ne l'empêchait : l'écran affichait le fil de la création - « Capital »,
     * « Associé », « Offres » - au-dessus d'un formulaire de création vide, pour un
     * dossier qui n'en est pas un.
     */
    const client = await prisma.users.findUniqueOrThrow({ where: { email: COMPTE.email } });
    const autre = await prisma.formalites.create({
      data: {
        user_id: client.id,
        type: "modification",
        forme: "SAS",
        societe: "MODIF EGAREE",
        status: "en_cours",
        phase: 1,
        data_json: JSON.stringify({ codes: ["denomination"] }),
      },
    });
    semes.push(autre.id);

    await page.goto("/creation?dossier=" + autre.id);
    await expect(page).toHaveURL(new RegExp("/modification\\?dossier=" + autre.id));
  });
});

test.describe("une modification réglée", () => {
  test("s'ouvre sur son suivi, au lieu de renvoyer d'où l'on vient", async ({ page }) => {
    /*
     * La carte de « Mes formalités » mène au parcours de modification, qui renvoyait à
     * « Mes formalités » dès que le dossier était réglé : le clic ne faisait rien du
     * tout, et le client n'avait aucun endroit où voir où en était sa modification.
     */
    const client = await prisma.users.findUniqueOrThrow({ where: { email: COMPTE.email } });
    const reglee = await prisma.formalites.create({
      data: {
        user_id: client.id,
        type: "modification",
        forme: "SAS",
        societe: "MODIF REGLEE",
        status: "en_attente_validation",
        phase: 5,
        business_sub_phase: "5a",
        data_json: JSON.stringify({
          codes: ["denomination"],
          societe: { denomination: "MODIF REGLEE" },
          valeurs: { nouvelleDenomination: "AUTRE NOM" },
          paye: true,
        }),
      },
    });
    semes.push(reglee.id);

    await page.goto("/formalites");
    await page.getByLabel("Rechercher une formalité").fill("MODIF REGLEE");
    await page.getByRole("list", { name: "Formalités" }).getByText("MODIF REGLEE").click();

    await expect(page).toHaveURL(new RegExp("/modification\\?dossier=" + reglee.id));
    /*
     * La phrase du dossier réglé a été réécrite : elle disait « réglée et suivie par le
     * cabinet », elle dit ce que le client a maintenant à faire - c'est-à-dire rien.
     * Ce que le test garde reste le même : la carte mène au suivi, non à la saisie.
     */
    await expect(page.getByRole("heading", { name: "Où en est votre dossier" })).toBeVisible();
    await expect(page.getByText(/Vous n'avez rien à remplir/)).toBeVisible();
    await expect(page.getByText(/où en est votre modification/)).toBeVisible();
  });
});

/*
 * Le bandeau d'accueil n'existe plus, et ses deux essais avec lui.
 *
 * Il annonçait « Maître X vous demande une correction » en tête du tableau de bord.
 * L'accueil a été refait pour répondre à « qu'est-ce qui m'attend » plutôt qu'à
 * « voici vos dossiers » : un même dossier y figurait trois fois - dans le bandeau,
 * dans les vignettes et dans la liste des attentes - et sur un compte à vingt
 * dossiers, rien ne disait ce qui pressait. Le bandeau est parti à ce moment-là ; les
 * essais sont restés, à chercher un élément que plus aucune page ne rend.
 *
 * Ce qu'ils garantissaient tient toujours, et se vérifie plus haut dans ce fichier :
 * le client lit ce que l'avocat demande sur son dossier, et le bouton le mène au fil
 * où il peut répondre. C'est là que la demande doit se lire - sur le dossier qu'elle
 * concerne, non sur un bandeau qui ne pouvait en montrer qu'une à la fois.
 */

test.describe("l'accueil d'un administrateur", () => {
  test.use({ storageState: "./tests/parcours/session-admin.json" });

  test("ne compte que ses dossiers, pas ceux de la plateforme", async ({ page }) => {
    /*
     * listerDossiers rend tout à un administrateur : son accueil annonçait « Vos
     * sociétés » avec les dossiers de tous les clients, et « Maître Dupont vous a
     * écrit » pour un message reçu chez quelqu'un d'autre. Le lien menait alors à une
     * messagerie où ce fil n'existe pas - elle ne montre que les siens - et l'écran
     * restait vide. La bibliothèque de documents et la messagerie posaient déjà la
     * règle ; l'accueil était le dernier à ne pas la suivre.
     */
    const enBase = await prisma.formalites.count();
    expect(enBase).toBeGreaterThan(3);

    await page.goto("/tableau-de-bord");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Aucun dossier d'un autre compte ne s'affiche sous « Vos sociétés ».
    await expect(page.getByText("PARCOURS EN COURS")).toHaveCount(0);
    await expect(page.getByText("PARCOURS IMMATRICULEE")).toHaveCount(0);
  });
});
