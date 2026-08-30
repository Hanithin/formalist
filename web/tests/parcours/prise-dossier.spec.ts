import { test, expect } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/infrastructure/db/generated/client";
import { retirerDossiers } from "./nettoyage";

/**
 * Un dossier proposé à tous les avocats, pris par le premier.
 *
 * Deux avocats qui cliquent dans la même seconde liraient tous deux « libre » avant
 * que l'autre n'écrive : le second effacerait le premier sans que personne ne le
 * sache. C'est la base qui tranche, en une instruction conditionnelle.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? "",
    options: "-c timezone=UTC",
  }),
});

const ouverts: number[] = [];

/** Un dossier complet, tel que l'étape 5 l'exige pour laisser transmettre. */
const SASU_COMPLETE = {
  forme: "SASU",
  denomination: "ESSAI TRANSMISSION",
  activite: "Conseil aux entreprises",
  adresse: "3 rue Centrale",
  codePostal: "33000",
  ville: "Bordeaux",
  capital: 1000,
  capitalLibere: 1000,
  partsTotales: 100,
  offre: "business",
  associes: [
    {
      type: "physique" as const,
      personne: {
        civilite: "Madame" as const,
        prenom: "Camille",
        nom: "Durand",
        dateDeNaissance: "1985-04-12",
      },
      parts: 100,
      versement: 1000,
    },
  ],
  dirigeants: [{ associe: 0 }],
};

/** Un dossier transmis que personne n'a pris. */
async function dossierEnAttente(societe: string) {
  const client = await prisma.users.findFirstOrThrow({
    where: { email: "parcours@exemple.test" },
  });

  const dossier = await prisma.formalites.create({
    data: {
      user_id: client.id,
      type: "creation",
      forme: "SASU",
      societe,
      status: "en_attente_validation",
      phase: 5,
    },
  });
  ouverts.push(dossier.id);
  return dossier;
}

test.describe("prise d'un dossier", () => {
  test.afterAll(async () => {
    if (ouverts.length > 0) await retirerDossiers(ouverts);
    await prisma.$disconnect();
  });

  test.describe("vu par un avocat", () => {
    test.use({ storageState: "./tests/parcours/session-avocat.json" });

    test("il prend un dossier libre, et le second arrivé l'apprend", async ({ request }) => {
      const dossier = await dossierEnAttente("PRISE ESSAI " + Date.now());

      const premiere = await request.post("/api/avocat/prise", { data: { dossier: dossier.id } });
      expect(premiere.status()).toBe(200);
      expect((await premiere.json()).deja).toBe(false);

      const avocat = await prisma.users.findFirstOrThrow({
        where: { email: "avocat-parcours@exemple.test" },
      });
      const apres = await prisma.formalites.findUniqueOrThrow({ where: { id: dossier.id } });
      expect(apres.assigned_avocat_id).toBe(avocat.id);

      // Le même avocat qui reclique : ce n'est pas un conflit, c'est déjà le sien.
      const encore = await request.post("/api/avocat/prise", { data: { dossier: dossier.id } });
      expect(encore.status()).toBe(200);
      expect((await encore.json()).deja).toBe(true);
    });

    /*
     * La prise était le seul geste du parcours dont le client n'apprenait rien.
     *
     * L'avis existait, partait par courriel, et son commentaire disait pourquoi : « le
     * client a réglé, puis plus rien pendant des heures ». Seule l'assignation par
     * l'administration le déclenchait - les deux vrais boutons passent par cette
     * route, et ne disaient rien.
     */
    test("prendre un dossier le dit au client", async ({ request }) => {
      const dossier = await dossierEnAttente("PRISE AVIS " + Date.now());

      await request.post("/api/avocat/prise", { data: { dossier: dossier.id } });

      const client = await prisma.users.findFirstOrThrow({
        where: { email: "parcours@exemple.test" },
      });
      const avis = await prisma.notifications.findFirst({
        where: {
          formalite_id: dossier.id,
          user_id: client.id,
          type: "dossier_pris_en_charge",
        },
      });

      expect(avis).not.toBeNull();
      expect(avis?.content).toContain("PRISE AVIS");
    });

    /*
     * La liste appliquait la règle du domaine et ne proposait pas un dossier clos ;
     * ce contrôle-ci n'en retenait que la moitié, et l'appel direct l'attribuait.
     */
    test("un dossier clos ne se prend pas", async ({ request }) => {
      for (const statut of ["terminee", "archive", "rejete"]) {
        const dossier = await dossierEnAttente("CLOS " + statut + " " + Date.now());
        await prisma.formalites.update({
          where: { id: dossier.id },
          data: { status: statut },
        });

        const reponse = await request.post("/api/avocat/prise", {
          data: { dossier: dossier.id },
        });
        expect(reponse.status(), statut).toBe(403);
        expect((await reponse.json()).error, statut).toContain("clos");

        const apres = await prisma.formalites.findUniqueOrThrow({ where: { id: dossier.id } });
        expect(apres.assigned_avocat_id, statut).toBeNull();
      }
    });

    test("un dossier déjà pris par un confrère est refusé, en le nommant", async ({ request }) => {
      const dossier = await dossierEnAttente("DEJA PRIS " + Date.now());

      /*
       * Un confrère créé pour l'occasion, non un compte trouvé en base.
       *
       * Le test visait une adresse réelle du développeur : sur une base neuve - celle
       * de la vérification automatique - elle n'existe pas, et le test échouait sans
       * rien dire du code. Un essai ne doit rien devoir aux données d'une machine.
       */
      const autre = await prisma.users.upsert({
        where: { email: "confrere-parcours@exemple.test" },
        update: {},
        create: {
          email: "confrere-parcours@exemple.test",
          password_hash: "x",
          salt: "x",
          name: "Maître Rousseau",
          role: "avocat",
          roles: JSON.stringify(["user", "avocat"]),
          email_verified: true,
        },
      });
      await prisma.formalites.update({
        where: { id: dossier.id },
        data: { assigned_avocat_id: autre.id },
      });

      const trop_tard = await request.post("/api/avocat/prise", { data: { dossier: dossier.id } });
      expect(trop_tard.status()).toBe(409);

      const corps = await trop_tard.json();
      expect(corps.pris).toBe(true);
      expect(corps.error).toContain("déjà été pris");
    });

    test("deux prises simultanées n'en laissent passer qu'une", async ({ request }) => {
      /*
       * Le cœur du sujet : lire puis écrire laisserait passer les deux. La mise à
       * jour est conditionnelle, et c'est la base qui départage.
       */
      const dossier = await dossierEnAttente("COURSE ESSAI " + Date.now());

      const reponses = await Promise.all(
        Array.from({ length: 4 }, () =>
          request.post("/api/avocat/prise", { data: { dossier: dossier.id } })
        )
      );

      const succes = reponses.filter((r) => r.status() === 200);
      // Le même avocat quatre fois : la première prend, les autres constatent.
      expect(succes.length).toBeGreaterThan(0);

      const corps = await Promise.all(succes.map((r) => r.json()));
      expect(corps.filter((c) => c.deja === false)).toHaveLength(1);
    });
  });

  test.describe("vu par le client", () => {
    test("il transmet son dossier, et tous les avocats en sont prévenus", async ({ request }) => {
      /*
       * Ce geste n'existait pas : la seule route qui change l'état exige d'être
       * avocat, et le dossier restait « en cours » quoi que le client fasse.
       */
      const client = await prisma.users.findFirstOrThrow({
        where: { email: "parcours@exemple.test" },
      });

      const dossier = await prisma.formalites.create({
        data: {
          user_id: client.id,
          type: "creation",
          forme: "SASU",
          societe: "TRANSMISSION ESSAI " + Date.now(),
          status: "en_cours",
          phase: 1,
          data_json: JSON.stringify(SASU_COMPLETE),
        },
      });
      ouverts.push(dossier.id);

      const reponse = await request.post("/api/formalites/transmission", {
        data: { dossier: dossier.id },
      });
      expect(reponse.status()).toBe(200);

      const corps = await reponse.json();
      expect(corps.deja).toBe(false);
      expect(corps.proposes).toBeGreaterThan(0);

      const apres = await prisma.formalites.findUniqueOrThrow({ where: { id: dossier.id } });
      expect(apres.status).toBe("en_attente_validation");

      // Chaque avocat a reçu l'offre.
      const avis = await prisma.notifications.findMany({
        where: { formalite_id: dossier.id, type: "dossier_a_prendre" },
      });
      expect(avis.length).toBe(corps.proposes);
    });

    /*
     * Un dossier repris après corrections revenait en attente sans que personne ne le
     * sache : la proposition renonçait - juste pour le cabinet, muet pour l'avocat qui
     * l'avait pris - et le dossier dormait jusqu'à ce qu'il pense à le rouvrir.
     */
    test("le dossier corrigé revient, et son avocat l'apprend", async ({ request }) => {
      const client = await prisma.users.findFirstOrThrow({
        where: { email: "parcours@exemple.test" },
      });
      const avocat = await prisma.users.findFirstOrThrow({
        where: { email: "avocat-parcours@exemple.test" },
      });

      const dossier = await prisma.formalites.create({
        data: {
          user_id: client.id,
          type: "creation",
          forme: "SASU",
          societe: "RETOUR ESSAI " + Date.now(),
          status: "corrections_demandees",
          phase: 5,
          assigned_avocat_id: avocat.id,
          data_json: JSON.stringify(SASU_COMPLETE),
        },
      });
      ouverts.push(dossier.id);

      const reponse = await request.post("/api/formalites/transmission", {
        data: { dossier: dossier.id },
      });
      expect(reponse.status()).toBe(200);

      /* Il n'est pas reproposé au cabinet : il appartient toujours au même avocat. */
      expect((await reponse.json()).proposes).toBe(0);

      const avis = await prisma.notifications.findFirst({
        where: {
          formalite_id: dossier.id,
          user_id: avocat.id,
          type: "dossier_retransmis",
        },
      });
      expect(avis).not.toBeNull();
    });

    test("un dossier vide ne se transmet pas", async ({ page, request }) => {
      // L'avocat relirait des blancs, et le dossier occuperait la file pour rien.
      const dossier = Number((await (await request.post("/api/formalites/brouillon")).json()).dossier);
      ouverts.push(dossier);
      await page.goto("/creation?dossier=" + dossier);

      const reponse = await request.post("/api/formalites/transmission", { data: { dossier } });
      expect(reponse.status()).toBe(400);
      expect((await reponse.json()).error).toContain("incomplet");
    });

    test("il ne prend pas un dossier à la place d'un avocat", async ({ request }) => {
      const dossier = await dossierEnAttente("REFUS CLIENT " + Date.now());
      expect((await request.post("/api/avocat/prise", { data: { dossier: dossier.id } })).status()).toBe(
        403
      );
    });
  });
});

/**
 * La liste du cabinet : chercher, trier, borner, paginer.
 *
 * Trente dossiers s'affichaient d'un bloc, sans recherche ni tri : retrouver celui
 * d'un client demandait de parcourir la page à l'œil.
 */
test.describe("la liste du cabinet", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  test("la recherche restreint la liste et tient dans l'adresse", async ({ page }) => {
    await page.goto("/avocat");
    await expect(page.getByLabel("Rechercher un dossier")).toBeVisible();

    await page.getByLabel("Rechercher un dossier").fill("parcours-en-cours-introuvable");
    await expect(page).toHaveURL(/q=parcours-en-cours-introuvable/);
    await expect(page.getByText(/Aucun dossier ne correspond/)).toBeVisible();

    // Une recherche se partage : rouvrir l'adresse rend le même écran.
    await page.reload();
    await expect(page.getByLabel("Rechercher un dossier")).toHaveValue(
      "parcours-en-cours-introuvable"
    );
  });

  test("une période dont la fin précède le début est signalée, pas appliquée", async ({ page }) => {
    await page.goto("/avocat?du=2026-08-15&au=2026-08-01");
    // Le texte plutôt que role=alert : Next place un signaleur de navigation qui
    // porte le même rôle, et la sélection stricte trouverait les deux.
    await expect(page.getByText(/précède son début/)).toBeVisible();
    // La liste reste celle d'avant : on ne vide pas l'écran sur une saisie en cours.
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("le tri et la recherche survivent au changement de page", async ({ page }) => {
    /*
     * Le tri n'est plus un `<select>` mais une liste écrite - voir ChampChoix :
     * `toHaveValue` ne s'applique pas à un bouton, et c'est le libellé retenu qui se
     * lit, non la clé qui voyage dans l'adresse.
     */
    await page.goto("/avocat?tri=ancien&q=parcours");
    await expect(page.getByLabel("Trier par")).toContainText(
      "Sans mouvement depuis longtemps"
    );

    // Les liens de pagination reconduisent les critères ; sans page, rien à cliquer.
    const suivant = page.getByRole("link", { name: "Suivant" });
    if (await suivant.count()) {
      await suivant.click();
      await expect(page).toHaveURL(/tri=ancien/);
      await expect(page).toHaveURL(/q=parcours/);
    }
  });
});

test.describe("l'ouverture d'un dossier", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  test("cliquer une ligne ouvre le dossier", async ({ page }) => {
    /*
     * La ligne mène au dossier.
     *
     * Elle ouvrait un panneau qui redisait ce que la ligne montrait déjà, et dont le
     * seul geste propre était un bouton « Ouvrir le dossier » : deux clics pour
     * arriver là où l'on allait de toute façon.
     */
    // Son propre dossier : les autres séries en créent et en suppriment en
    // parallèle, et une ligne qui disparaît entre l'affichage et le clic ferait
    // échouer un test qui n'a rien à voir.
    const marque = "LIGNE LECTURE " + Date.now();
    const dossier = await dossierEnAttente(marque);

    await page.goto("/avocat?q=" + encodeURIComponent(marque));
    await expect(page.getByRole("table")).toBeVisible();

    await page.locator("tbody tr").first().click();

    await page.waitForURL(new RegExp("/avocat/" + dossier.id));
    await expect(
      page.getByRole("heading", { name: new RegExp(dossier.societe, "i") })
    ).toBeVisible();
  });

  test("un dossier qui attend se prend depuis la ligne", async ({ page }) => {
    const dossier = await dossierEnAttente("LIGNE ESSAI " + Date.now());

    await page.goto("/avocat?q=" + encodeURIComponent(dossier.societe));
    await expect(page.getByRole("table")).toBeVisible();

    /*
     * Accepter mène au dossier.
     *
     * Prendre puis rester devant la liste laisserait l'avocat sans rien à faire de ce
     * qu'il vient d'accepter.
     */
    await page.getByRole("button", { name: /Prendre en charge le dossier/ }).first().click();

    await page.waitForURL(new RegExp("/avocat/" + dossier.id));
    await expect(page.getByRole("heading", { name: new RegExp(dossier.societe, "i") })).toBeVisible();

    const apres = await prisma.formalites.findUniqueOrThrow({ where: { id: dossier.id } });
    expect(apres.assigned_avocat_id).not.toBeNull();
  });
});

test.describe("les compteurs du cabinet", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  test("ce qui vaut zéro s'efface au lieu de crier", async ({ page }) => {
    /*
     * Quatre zéros en gros caractères se lisaient comme une alerte, et attiraient
     * l'œil sur ce qui n'existe pas.
     */
    await page.goto("/avocat");
    await page.getByRole("table").waitFor();

    // Le libellé reste, la valeur devient un tiret annoncé « aucun ».
    await expect(page.getByText("À vérifier").first()).toBeVisible();
    expect(await page.getByLabel("aucun").count()).toBeGreaterThan(0);

    // Et nulle part un « 0 » seul, ni dans les cartes ni sur les onglets.
    await expect(page.getByText("0", { exact: true })).toHaveCount(0);
  });
});

/**
 * Ce qu'un avocat peut faire du dossier lui-même.
 *
 * Trois gestes n'existaient pas : refuser un dossier impossible - les seuls états que
 * l'interface posait étaient « corrections demandées » et « en attente de validation »,
 * si bien qu'un objet illicite ne pouvait que boucler en demandes de reprise -, rendre
 * au cabinet un dossier qu'on ne peut pas suivre, et appeler un confrère autrement
 * qu'en lui rendant le dossier en entier.
 */
test.describe("le dossier lui-même", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  async function dossierPris(societe: string) {
    const dossier = await dossierEnAttente(societe);
    const avocat = await prisma.users.findFirstOrThrow({
      where: { email: "avocat-parcours@exemple.test" },
    });
    await prisma.formalites.update({
      where: { id: dossier.id },
      data: { assigned_avocat_id: avocat.id },
    });
    return dossier;
  }

  test("il refuse un dossier, avec son motif", async ({ request }) => {
    const dossier = await dossierPris("REFUS DOSSIER " + Date.now());

    const reponse = await request.put("/api/avocat/dossier", {
      data: {
        dossier: dossier.id,
        etat: "rejete",
        commentaire: "L'objet social suppose un agrément que la société n'a pas.",
      },
    });
    expect(reponse.status()).toBe(200);

    const apres = await prisma.formalites.findUniqueOrThrow({ where: { id: dossier.id } });
    expect(apres.status).toBe("rejete");

    /* Le client reçoit l'avis, et le motif l'attend dans son fil. */
    const client = await prisma.users.findFirstOrThrow({
      where: { email: "parcours@exemple.test" },
    });
    expect(
      await prisma.notifications.count({
        where: { formalite_id: dossier.id, user_id: client.id, type: "dossier_rejete" },
      })
    ).toBe(1);
    const message = await prisma.messages.findFirstOrThrow({
      where: { formalite_id: dossier.id },
    });
    expect(message.kind).toBe("rejection");
    expect(message.content).toContain("agrément");
  });

  test("il se retire du dossier, qui repart dans la file", async ({ request }) => {
    const dossier = await dossierPris("DESSAISISSEMENT " + Date.now());

    const reponse = await request.put("/api/avocat/dessaisissement", {
      data: { dossier: dossier.id, motif: "Conflit d'intérêts." },
    });
    expect(reponse.status()).toBe(200);

    const corps = await reponse.json();
    expect(corps.deja).toBe(false);
    /* Il repart dans la file : les avocats en sont prévenus comme au premier jour. */
    expect(corps.proposes).toBeGreaterThan(0);

    const apres = await prisma.formalites.findUniqueOrThrow({ where: { id: dossier.id } });
    expect(apres.assigned_avocat_id).toBeNull();

    const client = await prisma.users.findFirstOrThrow({
      where: { email: "parcours@exemple.test" },
    });
    expect(
      await prisma.notifications.count({
        where: { formalite_id: dossier.id, user_id: client.id, type: "dossier_rendu" },
      })
    ).toBe(1);

    /* Et il se reprend : la prise redevient possible. */
    expect((await request.post("/api/avocat/prise", { data: { dossier: dossier.id } })).status()).toBe(
      200
    );
  });

  test("il invite un avocat, qui voit le dossier et le travaille", async ({ request }) => {
    const dossier = await dossierPris("CONFRERE " + Date.now());

    const confrere = await prisma.users.upsert({
      where: { email: "confrere-parcours@exemple.test" },
      update: { role: "avocat", suspended: false, name: "Maître Rousseau" },
      create: {
        email: "confrere-parcours@exemple.test",
        password_hash: "x",
        salt: "x",
        name: "Maître Rousseau",
        role: "avocat",
        roles: JSON.stringify(["user", "avocat"]),
        email_verified: true,
      },
    });

    const reponse = await request.post("/api/avocat/confreres", {
      data: { dossier: dossier.id, courriel: "confrere-parcours@exemple.test" },
    });
    expect(reponse.status()).toBe(200);
    expect((await reponse.json()).confrere).toBe("Maître Rousseau");

    /* Il l'apprend : une invitation qu'il faut annoncer de vive voix n'en est pas une. */
    expect(
      await prisma.notifications.count({
        where: { formalite_id: dossier.id, user_id: confrere.id, type: "confrere_invite" },
      })
    ).toBe(1);

    /*
     * Deux fois n'est pas une faute : c'est un clic de trop. Et c'est la base qui
     * tranche : lire puis écrire laissait passer deux clics dans la même seconde, dont
     * le second heurtait l'index unique - l'avocat lisait « Erreur serveur » sur une
     * invitation qui venait pourtant d'aboutir.
     */
    const encore = await request.post("/api/avocat/confreres", {
      data: { dossier: dossier.id, courriel: "confrere-parcours@exemple.test" },
    });
    expect((await encore.json()).deja).toBe(true);

    const simultanees = await Promise.all(
      Array.from({ length: 4 }, () =>
        request.post("/api/avocat/confreres", {
          data: { dossier: dossier.id, courriel: "confrere-parcours@exemple.test" },
        })
      )
    );
    expect(simultanees.every((r) => r.status() === 200)).toBe(true);
    expect(
      await prisma.dossier_confreres.count({ where: { formalite_id: dossier.id } })
    ).toBe(1);

    /* Il se lit, et se retire. */
    const liste = await request.get("/api/avocat/confreres?dossier=" + dossier.id);
    expect((await liste.json()).confreres).toHaveLength(1);

    expect(
      (
        await request.delete("/api/avocat/confreres", {
          data: { dossier: dossier.id, avocat: confrere.id },
        })
      ).status()
    ).toBe(200);
    expect(
      await prisma.dossier_confreres.count({ where: { formalite_id: dossier.id } })
    ).toBe(0);
  });

  test("on n'invite qu'un avocat", async ({ request }) => {
    const dossier = await dossierPris("CONFRERE REFUS " + Date.now());

    const reponse = await request.post("/api/avocat/confreres", {
      data: { dossier: dossier.id, courriel: "parcours@exemple.test" },
    });
    expect(reponse.status()).toBe(403);
    expect((await reponse.json()).error).toContain("Aucun avocat");
  });
});
