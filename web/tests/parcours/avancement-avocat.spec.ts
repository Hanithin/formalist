import { test, expect } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/infrastructure/db/generated/client";
import { retirerDossiers } from "./nettoyage";

/**
 * L'avancement du dossier, du côté du cabinet.
 *
 * Les cinq pastilles - Transmis, Révision, Vérifié, Dépôt, KBIS - existaient dans la
 * liste et aucune ne s'allumait : aucune route n'écrivait jamais la colonne. Et le
 * Kbis n'avait aucun chemin pour arriver dans le dossier du client, alors que le
 * message de fin le lui promettait.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? "",
    options: "-c timezone=UTC",
  }),
});

const PDF = Buffer.from("%PDF-1.4\nfaux document d'essai\n%%EOF\n");
const ouverts: number[] = [];

test.describe("avancement du cabinet", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  test.afterAll(async () => {
    if (ouverts.length > 0) await retirerDossiers(ouverts);
    await prisma.$disconnect();
  });

  /** Un dossier confié à l'avocat d'essai, transmis et prêt à être suivi. */
  async function dossierDuCabinet(societe: string) {
    const client = await prisma.users.findFirstOrThrow({
      where: { email: "parcours@exemple.test" },
    });
    const avocat = await prisma.users.findFirstOrThrow({
      where: { email: "avocat-parcours@exemple.test" },
    });

    const dossier = await prisma.formalites.create({
      data: {
        user_id: client.id,
        assigned_avocat_id: avocat.id,
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

  test("les étapes s'allument une à une, sans en sauter", async ({ page, request }) => {
    const dossier = await dossierDuCabinet("AVANCEMENT ESSAI " + Date.now());

    await page.goto("/avocat/" + dossier.id + "?onglet=avancement");
    /* La carte de cinq étages est devenue une ligne : « Le client voit … ». */
    await expect(
      page.getByRole("region", { name: "Avancement annoncé au client" })
    ).toBeVisible();

    // Un dossier neuf n'entre qu'en 5a.
    const saut = await request.put("/api/avocat/dossier", {
      data: { dossier: dossier.id, sousPhase: "5c" },
    });
    expect(saut.status()).toBe(403);

    /*
     * La barre lit, elle n'avance pas.
     *
     * Quatre étapes sur cinq se déduisent du travail fait. La cinquième - le dépôt au
     * guichet - se déclare depuis sa tâche, où elle est expliquée : la barre portait un
     * second bouton pour le même geste, à trois lignes de distance.
     */
    await expect(page.getByRole("button", { name: /Passer à/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /déposé au guichet/i })).toHaveCount(0);

    // Une fois le dossier vérifié, le dépôt se déclare depuis la tâche.
    for (const etape of ["5a", "5b", "5c"]) {
      await request.put("/api/avocat/dossier", {
        data: { dossier: dossier.id, sousPhase: etape },
      });
    }
    await page.reload();
    /* La ligne entière est le geste : son nom porte le titre de la tâche puis le sien. */
    await expect(
      page.getByRole("button", { name: /Marquer comme effectué/ }).first()
    ).toBeVisible();

    // Et le retour d'un cran reste possible : c'est une correction de saisie.
    await expect(page.getByRole("button", { name: /Revenir à . Révision/ })).toBeVisible();
  });

  test("« Vérifié » dit au client où en est son dossier, sans rien lui demander", async ({
    request,
  }) => {
    /*
     * On lui écrivait « à vous de jouer : publiez l'annonce légale », avec un prix à
     * l'appui. L'avis est rédigé et publié par le cabinet, ici comme partout ailleurs
     * sur le site : le client n'a jamais eu à choisir un journal.
     */
    const dossier = await dossierDuCabinet("ANNONCE ESSAI " + Date.now());

    for (const etape of ["5a", "5b", "5c"]) {
      const reponse = await request.put("/api/avocat/dossier", {
        data: { dossier: dossier.id, sousPhase: etape },
      });
      expect(reponse.status()).toBe(200);
    }

    /*
     * À « Vérifié », les actes sont chez lui : c'est le moment où sa banque peut lui
     * délivrer l'attestation de dépôt, et donc celui où on la lui demande. L'avis part
     * à la place de l'annonce de vérification - c'est la même nouvelle, dont l'une dit
     * en plus ce qu'il reste à faire.
     */
    const demande = await prisma.notifications.findFirst({
      where: { formalite_id: dossier.id, type: "attestation_attendue" },
    });
    expect(demande?.content).toContain("attestation de dépôt de capital");

    // Et plus rien ne l'invite à publier quoi que ce soit.
    const invitation = await prisma.notifications.count({
      where: { formalite_id: dossier.id, type: "annonce_a_publier" },
    });
    expect(invitation).toBe(0);
  });

  /*
   * L'attestation ne se réclamait pas au bon moment.
   *
   * L'avis partait à l'entrée en « Révision », c'est-à-dire à la seconde où l'avocat
   * prenait le dossier : la banque n'ouvre le compte que sur présentation des statuts,
   * et les statuts étaient précisément ce qu'il était en train de relire.
   */
  test("l'attestation ne se demande pas tant que les actes sont en relecture", async ({
    request,
  }) => {
    const dossier = await dossierDuCabinet("ATTESTATION ESSAI " + Date.now());

    for (const etape of ["5a", "5b"]) {
      await request.put("/api/avocat/dossier", { data: { dossier: dossier.id, sousPhase: etape } });
    }

    expect(
      await prisma.notifications.count({
        where: { formalite_id: dossier.id, type: "attestation_attendue" },
      })
    ).toBe(0);

    await request.put("/api/avocat/dossier", { data: { dossier: dossier.id, sousPhase: "5c" } });

    expect(
      await prisma.notifications.count({
        where: { formalite_id: dossier.id, type: "attestation_attendue" },
      })
    ).toBe(1);
  });

  /*
   * Une fois l'attestation au dossier, « Vérifié » redevient une nouvelle simple.
   */
  test("l'attestation reçue, « Vérifié » ne redemande rien", async ({ request }) => {
    const dossier = await dossierDuCabinet("VERIFIE ESSAI " + Date.now());
    await prisma.documents.create({
      data: {
        formalite_id: dossier.id,
        name: "Attestation de dépôt de capital",
        type: "depot-capital",
        file_path: "essai-attestation.pdf",
        uploaded_by: "user",
        status: "verified",
      },
    });

    for (const etape of ["5a", "5b", "5c"]) {
      await request.put("/api/avocat/dossier", { data: { dossier: dossier.id, sousPhase: etape } });
    }

    const avis = await prisma.notifications.findFirst({
      where: { formalite_id: dossier.id, type: "dossier_verifie" },
    });
    expect(avis?.content).toContain("vérifié");
    expect(
      await prisma.notifications.count({
        where: { formalite_id: dossier.id, type: "attestation_attendue" },
      })
    ).toBe(0);
  });

  test("le Kbis se dépose et arrive chez le client", async ({ page, request }) => {
    const dossier = await dossierDuCabinet("KBIS ESSAI " + Date.now());

    /*
     * Le dépôt d'abord, le document du greffe ensuite.
     *
     * Les deux livrables tenaient leur propre carte, déposable à tout moment : ils sont
     * devenus la tâche « Remettre extrait Kbis », que le domaine empêche tant que le
     * dossier n'est pas déposé au guichet - on n'a pas de récépissé avant d'avoir
     * déposé.
     */
    for (const etape of ["5a", "5b", "5c", "5d"]) {
      await request.put("/api/avocat/dossier", {
        data: { dossier: dossier.id, sousPhase: etape },
      });
    }

    await page.goto("/avocat/" + dossier.id);
    /*
     * Le libellé nomme le document que le greffe délivre pour ce type de dossier :
     * « Extrait Kbis » pour une création, « Kbis à jour » pour une modification. Il
     * était écrit « Kbis » en dur, et l'avocat d'une modification lisait qu'il devait
     * remettre un Kbis, que le greffe ne délivre pas dans ce cas.
     */
    await page.getByLabel(/Déposer extrait kbis/i).setInputFiles({
      name: "kbis.pdf",
      mimeType: "application/pdf",
      buffer: PDF,
    });

    /*
     * Le dépôt s'attend sur son résultat, non sur un message.
     *
     * Le test guettait le premier élément de rôle « status » portant « déposé ». Depuis
     * que le dossier tient sur un écran, l'encart des pièces manquantes est là aussi -
     * « jamais déposée » - et l'attente passait avant que le fichier soit écrit.
     */
    await expect
      .poll(
        () => prisma.documents.count({ where: { formalite_id: dossier.id, type: "kbis" } }),
        { timeout: 20_000 }
      )
      .toBe(1);

    const depose = await prisma.documents.findFirstOrThrow({
      where: { formalite_id: dossier.id, type: "kbis" },
    });
    expect(depose.uploaded_by).toBe("avocat");

    /*
     * Et le client l'apprend.
     *
     * C'était le seul geste du parcours dont personne n'apprenait rien : la tâche
     * promettait « le client en est prévenu aussitôt », l'étape 5e était la seule sans
     * avis, et conclure sans document - le chemin dégradé - envoyait bien un courriel.
     */
    const client = await prisma.users.findFirstOrThrow({
      where: { email: "parcours@exemple.test" },
    });
    const avis = await prisma.notifications.findFirst({
      where: {
        formalite_id: dossier.id,
        user_id: client.id,
        type: "document_final_remis",
      },
    });
    expect(avis).not.toBeNull();
    expect(avis?.content).toContain("Extrait Kbis");

    // Un type inventé n'ouvre pas le dépôt : ce serait un fourre-tout.
    const corps = new FormData();
    corps.append("dossier", String(dossier.id));
    corps.append("type", "n-importe-quoi");
    corps.append("fichier", new Blob([PDF], { type: "application/pdf" }), "x.pdf");
    expect((await request.post("/api/avocat/livrables", { multipart: corps })).status()).toBe(400);
  });

  /*
   * Le document porte le nom que le greffe lui donne pour ce dossier.
   *
   * Les deux titres étaient fixes : le client d'un dépôt de comptes recevait dans ses
   * documents une pièce intitulée « Kbis », là où le bouton disait « Déposer le
   * récépissé de dépôt ».
   */
  test("le document du greffe porte le nom du dossier, non celui d'une création", async ({
    request,
  }) => {
    const dossier = await dossierDuCabinet("COMPTES ESSAI " + Date.now());
    await prisma.formalites.update({ where: { id: dossier.id }, data: { type: "comptes" } });

    for (const etape of ["5a", "5b", "5c", "5d"]) {
      await request.put("/api/avocat/dossier", { data: { dossier: dossier.id, sousPhase: etape } });
    }

    const corps = new FormData();
    corps.append("dossier", String(dossier.id));
    corps.append("type", "kbis");
    corps.append("fichier", new Blob([PDF], { type: "application/pdf" }), "recepisse.pdf");
    expect((await request.post("/api/avocat/livrables", { multipart: corps })).status()).toBe(201);

    const depose = await prisma.documents.findFirstOrThrow({
      where: { formalite_id: dossier.id, type: "kbis" },
    });
    expect(depose.name).toBe("Récépissé de dépôt");
  });

  /*
   * Aucun écran ne clôturait un dossier : il restait « en attente de validation » à
   * vie, sa date de fin n'était jamais écrite, et son client le voyait indéfiniment
   * parmi ses formalités en cours.
   */
  test("le dossier se clôture, une fois le document remis", async ({ request }) => {
    const dossier = await dossierDuCabinet("CLOTURE ESSAI " + Date.now());

    /* Avant la remise, le geste est refusé : c'est le travail fini qu'on clôt. */
    const trop_tot = await request.put("/api/avocat/cloture", { data: { dossier: dossier.id } });
    expect(trop_tot.status()).toBe(403);
    expect((await trop_tot.json()).error).toContain("extrait Kbis");

    for (const etape of ["5a", "5b", "5c", "5d"]) {
      await request.put("/api/avocat/dossier", { data: { dossier: dossier.id, sousPhase: etape } });
    }
    const corps = new FormData();
    corps.append("dossier", String(dossier.id));
    corps.append("type", "kbis");
    corps.append("fichier", new Blob([PDF], { type: "application/pdf" }), "kbis.pdf");
    await request.post("/api/avocat/livrables", { multipart: corps });

    /*
     * Et l'avis doit avoir paru : la constitution s'annonce, la parution fait partie
     * du dossier déposé. Un dossier se terminait en laissant l'étape « Annonce légale
     * publiée » en cours à vie sur le suivi du client, sur une société immatriculée.
     */
    const sansAvis = await request.put("/api/avocat/cloture", { data: { dossier: dossier.id } });
    expect(sansAvis.status()).toBe(403);
    expect((await sansAvis.json()).error).toContain("avis de constitution");

    await request.post("/api/formalites/annonce", {
      data: { dossier: dossier.id, publies: true },
    });

    const reponse = await request.put("/api/avocat/cloture", { data: { dossier: dossier.id } });
    expect(reponse.status()).toBe(200);
    expect((await reponse.json()).deja).toBe(false);

    const apres = await prisma.formalites.findUniqueOrThrow({ where: { id: dossier.id } });
    expect(apres.status).toBe("terminee");
    /* La date de fin n'était jamais écrite : rien ne posait cet état. */
    expect(apres.finalized_at).not.toBeNull();

    const client = await prisma.users.findFirstOrThrow({
      where: { email: "parcours@exemple.test" },
    });
    const avis = await prisma.notifications.findMany({
      where: { formalite_id: dossier.id, user_id: client.id },
    });
    /* La fin se dit une fois : le passage par « validé » est silencieux. */
    expect(avis.filter((a) => a.type === "dossier_termine")).toHaveLength(1);
    expect(avis.filter((a) => a.type === "dossier_valide")).toHaveLength(0);

    // Reclôturer ne fait rien, et ne réécrit pas la date.
    const encore = await request.put("/api/avocat/cloture", { data: { dossier: dossier.id } });
    expect((await encore.json()).deja).toBe(true);
  });

  test("« KBIS délivré » exige le Kbis", async ({ request }) => {
    // Une pastille verte sans Kbis mentirait, et le message de fin le promet au client.
    const dossier = await dossierDuCabinet("SANS KBIS " + Date.now());

    for (const etape of ["5a", "5b", "5c", "5d"]) {
      expect(
        (await request.put("/api/avocat/dossier", { data: { dossier: dossier.id, sousPhase: etape } }))
          .status()
      ).toBe(200);
    }

    const refus = await request.put("/api/avocat/dossier", {
      data: { dossier: dossier.id, sousPhase: "5e" },
    });
    expect(refus.status()).toBe(403);
    expect((await refus.json()).error).toContain("Kbis");
  });

  test.describe("vu par un client", () => {
    test.use({ storageState: "./tests/parcours/session.json" });

    test("il ne dépose pas lui-même son Kbis", async ({ request }) => {
      const dossier = await prisma.formalites.findFirstOrThrow({
        where: { users_formalites_user_idTousers: { email: "parcours@exemple.test" } },
      });

      const corps = new FormData();
      corps.append("dossier", String(dossier.id));
      corps.append("type", "kbis");
      corps.append("fichier", new Blob([PDF], { type: "application/pdf" }), "kbis.pdf");

      expect((await request.post("/api/avocat/livrables", { multipart: corps })).status()).toBe(403);
    });
  });
});

/**
 * Le suivi, vu par le client.
 *
 * Il ne savait rien : l'écran ne portait qu'un état technique - « en attente de
 * validation » - qui ne dit ni qui attend, ni ce qu'on attend de lui.
 */
test.describe("suivi côté client", () => {
  const prisma2 = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL ?? "",
      options: "-c timezone=UTC",
    }),
  });

  const miens: number[] = [];

  test.afterAll(async () => {
    if (miens.length > 0) await retirerDossiers(miens);
    await prisma2.$disconnect();
  });

  test("il dit l'étape en cours, à qui est la main, et le geste attendu", async ({ page }) => {
    const compte = await prisma2.users.findFirstOrThrow({
      where: { email: "parcours@exemple.test" },
    });

    const dossier = await prisma2.formalites.create({
      data: {
        user_id: compte.id,
        type: "creation",
        forme: "SASU",
        societe: "SUIVI ESSAI " + Date.now(),
        status: "valide",
        phase: 5,
        business_sub_phase: "5c",
      },
    });
    miens.push(dossier.id);

    await prisma2.documents.create({
      data: {
        formalite_id: dossier.id,
        name: "Attestation de dépôt de capital",
        type: "depot-capital",
        status: "uploaded",
      },
    });

    await page.goto("/creation?dossier=" + dossier.id);

    const suivi = page.getByRole("region", { name: "Avancement du dossier" });
    await expect(suivi).toBeVisible();

    /*
     * L'attestation de parution n'est plus réclamée au client.
     *
     * Le cabinet rédige l'avis, le fait paraître et le joint au dossier : le client a
     * payé pour ne pas s'en occuper. Le dossier attend donc le cabinet, et le suivi le
     * dit au lieu de tendre un bouton.
     */
    await expect(suivi.getByText(/s'en occupe|En attente d'un avocat/)).toBeVisible();
    await expect(suivi.getByRole("link", { name: /parution/ })).toHaveCount(0);
    // Les six étapes sont là, et l'état technique n'apparaît nulle part.
    await expect(suivi.getByText("Kbis délivré")).toBeVisible();
    await expect(page.getByText("en_attente_validation")).toHaveCount(0);

    /*
     * Chaque ligne dit où elle en est.
     * La liste ne se distinguait que par un rond plein, un rond vide et un gris plus
     * pâle : on voyait qu'il se passait quelque chose sans savoir où l'on en était.
     */
    const etapes = suivi.getByRole("listitem");
    await expect(etapes.first()).toContainText(/Terminé|En cours|À vous|À venir/);
    await expect(suivi.getByText("À venir").first()).toBeVisible();
    await expect(suivi.getByText("Terminé", { exact: true }).first()).toBeVisible();
  });

  test("tant qu'on remplit le dossier, le suivi ne s'affiche pas", async ({ page, request }) => {
    // Deux indicateurs d'avancement côte à côte se contrediraient.
    const { dossier } = await (await request.post("/api/formalites/brouillon")).json();
    await page.goto("/creation?dossier=" + dossier);
    await expect(page.getByRole("region", { name: "Avancement du dossier" })).toHaveCount(0);
  });
});

/**
 * Corriger un dossier depuis l'espace avocat.
 *
 * La fenêtre promet que « les actes seront reproduits à partir de ces valeurs, et
 * repasseront en relecture ». Les quatre autres parcours le faisaient ; la création
 * s'en remettait à l'état courant, si bien que des actes déjà validés - donc déjà chez
 * le client, qui avait pu les télécharger - étaient remplacés en silence par d'autres,
 * qu'aucune relecture n'avait vus.
 */
test.describe("la correction d'un dossier de création", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  const ouverts: number[] = [];

  test.afterAll(async () => {
    if (ouverts.length > 0) await retirerDossiers(ouverts);
  });

  async function dossierAvecActes(societe: string) {
    const client = await prisma.users.findFirstOrThrow({
      where: { email: "parcours@exemple.test" },
    });
    const avocat = await prisma.users.findFirstOrThrow({
      where: { email: "avocat-parcours@exemple.test" },
    });

    const dossier = await prisma.formalites.create({
      data: {
        user_id: client.id,
        assigned_avocat_id: avocat.id,
        type: "creation",
        forme: "SASU",
        societe,
        status: "en_attente_validation",
        phase: 5,
        business_sub_phase: "5c",
        data_json: JSON.stringify({
          forme: "SASU",
          denomination: societe,
          activite: "Conseil aux entreprises",
          adresse: "3 rue Centrale",
          codePostal: "33000",
          ville: "Bordeaux",
          /* L'article des apports est écrit par dépositaire : sans banque, il sort vide. */
          banque: "Qonto",
          capital: 1000,
          capitalLibere: 1000,
          partsTotales: 100,
          offre: "business",
          revue: { informations: true, par: avocat.id },
          associes: [
            {
              type: "physique",
              parts: 100,
              versement: 1000,
              personne: {
                civilite: "Madame",
                prenom: "Camille",
                nom: "Durand",
                dateDeNaissance: "1990-06-24",
                villeDeNaissance: "Bordeaux",
                nationalite: "Française",
                situationMatrimoniale: "Célibataire",
                adresse: "3 rue Centrale, 33000 Bordeaux",
                email: "camille@exemple.test",
              },
            },
          ],
          dirigeants: [{ associe: 0 }],
        }),
      },
    });
    ouverts.push(dossier.id);
    return dossier;
  }

  test("elle remet les actes en relecture, et le client en est prévenu", async ({ request }) => {
    const dossier = await dossierAvecActes("CORRECTION ESSAI " + Date.now());

    /* Les actes sont produits, relus, et chez le client. */
    await request.post("/api/formalites/documents", { data: { dossier: dossier.id } });
    await prisma.documents.updateMany({
      where: { formalite_id: dossier.id, uploaded_by: "system" },
      data: { status: "generated" },
    });

    const reponse = await request.put("/api/avocat/correction", {
      data: { dossier: dossier.id, valeurs: { capital: 2000, capitalLibere: 2000 } },
    });
    expect(reponse.status()).toBe(200);
    expect((await reponse.json()).produits).toBeGreaterThan(0);

    /* Aucun acte ne reste chez le client : ils ne sont plus ceux qu'on avait validés. */
    expect(
      await prisma.documents.count({
        where: { formalite_id: dossier.id, uploaded_by: "system", status: "generated" },
      })
    ).toBe(0);

    const client = await prisma.users.findFirstOrThrow({
      where: { email: "parcours@exemple.test" },
    });
    expect(
      await prisma.notifications.count({
        where: { formalite_id: dossier.id, user_id: client.id, type: "actes_retires" },
      })
    ).toBe(1);

    /* Et l'étape redescend : rien n'est plus vérifié. */
    expect(
      (await prisma.formalites.findUniqueOrThrow({ where: { id: dossier.id } }))
        .business_sub_phase
    ).toBe("5b");
  });

  /*
   * L'état civil des personnes se corrige aussi.
   *
   * La fenêtre ne portait que ce que le brouillon range à plat : l'avocat qui lisait
   * « DUPOND » au lieu de « DUPONT » dans les statuts ne pouvait corriger ni le nom, ni
   * la date de naissance, ni le domicile - c'est-à-dire ce qui remplit les actes. Il
   * lui restait à reprendre le Word à la main, ce que cette fenêtre existe pour éviter.
   */
  test("elle atteint le nom d'un associé et le rejoue dans les actes", async ({ page, request }) => {
    const dossier = await dossierAvecActes("CORRECTION PERSONNE " + Date.now());

    await page.goto("/avocat/" + dossier.id);
    await page.getByRole("button", { name: "Corriger le formulaire" }).click();

    const fenetre = page.getByRole("dialog", { name: "Corriger le dossier" });
    await expect(fenetre).toBeVisible();

    /*
     * La fenêtre porte le formulaire du client : on rejoint l'associé par son étape,
     * comme lui l'a rempli, plutôt que par un groupe de champs à plat.
     */
    await fenetre.getByRole("button", { name: "Continuer" }).click();
    await expect(fenetre.getByRole("heading", { level: 2 })).toContainText("Associé");

    const nom = fenetre.getByLabel("Nom", { exact: true });
    await expect(nom).toHaveValue("Durand");
    await nom.fill("DURAND-LOMBARD");

    /*
     * Le parcours enregistre au fil de la frappe : la fenêtre n'a plus qu'à reproduire.
     * Elle ne se ferme qu'une fois les six actes refaits - plusieurs secondes, et
     * davantage quand la suite tourne à plusieurs.
     */
    await fenetre.getByRole("button", { name: /Reproduire les actes/ }).click();
    await expect(fenetre).toHaveCount(0, { timeout: 60_000 });

    /* La valeur est écrite là où le modèle la range, et le reste de la personne tient. */
    await expect
      .poll(async () => {
        const ligne = await prisma.formalites.findUniqueOrThrow({ where: { id: dossier.id } });
        return JSON.parse(ligne.data_json ?? "{}")?.associes?.[0]?.personne ?? {};
      })
      .toMatchObject({ nom: "DURAND-LOMBARD", prenom: "Camille" });
  });

  /* La route accepte un chemin comme identifiant, et n'écrase pas ses voisins. */
  test("elle corrige une personne sans toucher aux autres", async ({ request }) => {
    const dossier = await dossierAvecActes("CORRECTION VOISINS " + Date.now());

    const reponse = await request.put("/api/avocat/correction", {
      data: {
        dossier: dossier.id,
        valeurs: {
          "associes.0.personne.nom": "BERTHIN",
          "associes.0.personne.villeDeNaissance": "Lyon",
        },
      },
    });
    expect(reponse.status()).toBe(200);

    const ligne = await prisma.formalites.findUniqueOrThrow({ where: { id: dossier.id } });
    const brouillon = JSON.parse(ligne.data_json ?? "{}");
    expect(brouillon.associes[0].personne).toMatchObject({
      nom: "BERTHIN",
      villeDeNaissance: "Lyon",
      prenom: "Camille",
    });
    expect(brouillon.denomination).toContain("CORRECTION VOISINS");
  });

  /*
   * À la création, les actes naissent à l'encaissement, dont l'échec est rattrapé par
   * un commentaire promettant « les actes se régénèrent d'un clic côté cabinet ». Le
   * clic n'existait que pour les modifications : le dossier restait sans actes, et la
   * tâche renvoyait vers un onglet où rien ne les produisait.
   */
  test("les actes manquants se produisent depuis l'espace avocat", async ({ page }) => {
    const dossier = await dossierAvecActes("SANS ACTES " + Date.now());

    await page.goto("/avocat/" + dossier.id + "?onglet=travail");
    await page.getByRole("button", { name: "Produire les actes" }).click();

    await expect
      .poll(
        async () =>
          prisma.documents.count({
            where: { formalite_id: dossier.id, uploaded_by: "system" },
          }),
        { timeout: 30_000 }
      )
      .toBeGreaterThan(0);

    /* Et ils attendent l'avocat : un acte produit après transmission n'est pas relu. */
    expect(
      await prisma.documents.count({
        where: { formalite_id: dossier.id, uploaded_by: "system", status: "generated" },
      })
    ).toBe(0);
  });
});

/**
 * L'avis légal d'une création.
 *
 * Trois endroits se contredisaient : le suivi du client annonçait « le cabinet rédige
 * l'avis et joint la parution », l'onglet Annonce de l'avocat répondait « sur ce
 * dossier, l'annonce légale est publiée par le client », et la route qui déclare la
 * parution - écrite exprès pour la création - n'était appelée par aucun écran. L'étape
 * restait « en cours » à vie, et un dossier se clôturait sans qu'aucun avis n'ait paru.
 */
test.describe("l'avis de constitution", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  const ouverts: number[] = [];

  test.afterAll(async () => {
    if (ouverts.length > 0) await retirerDossiers(ouverts);
  });

  async function creation(societe: string) {
    const client = await prisma.users.findFirstOrThrow({
      where: { email: "parcours@exemple.test" },
    });
    const avocat = await prisma.users.findFirstOrThrow({
      where: { email: "avocat-parcours@exemple.test" },
    });

    const dossier = await prisma.formalites.create({
      data: {
        user_id: client.id,
        assigned_avocat_id: avocat.id,
        type: "creation",
        forme: "SASU",
        societe,
        capital: 1000,
        status: "en_attente_validation",
        phase: 5,
        business_sub_phase: "5c",
        data_json: JSON.stringify({
          forme: "SASU",
          denomination: societe,
          adresse: "3 rue Centrale",
          codePostal: "33000",
          ville: "Bordeaux",
          /* L'article des apports est écrit par dépositaire : sans banque, il sort vide. */
          banque: "Qonto",
          capital: 1000,
        }),
      },
    });
    ouverts.push(dossier.id);
    return dossier;
  }

  test("le cabinet a une tâche, un texte, et de quoi déclarer la parution", async ({ page }) => {
    const dossier = await creation("AVIS ESSAI " + Date.now());

    await page.goto("/avocat/" + dossier.id + "?onglet=travail");
    await expect(page.getByText("Publier l'avis de constitution")).toBeVisible();

    await page.goto("/avocat/" + dossier.id + "?onglet=annonce");
    /* Le texte est composé depuis le dossier : il n'y a qu'à le copier. */
    /* Le nom paraît deux fois : en titre de page et dans le récapitulatif de la colonne. */
    await expect(page.getByRole("heading", { name: /AVIS ESSAI/ })).toBeVisible();

    await page.getByRole("button", { name: "Marquer comme publiés" }).click();

    await expect
      .poll(async () => {
        const apres = await prisma.formalites.findUniqueOrThrow({ where: { id: dossier.id } });
        return JSON.parse(apres.data_json ?? "{}").avisPublies === true;
      })
      .toBe(true);
  });

  /* Et l'étape du client, qui n'avait aucun moyen d'être franchie, se coche. */
  test("le suivi du client s'en trouve avancé", async ({ page, request }) => {
    const dossier = await creation("AVIS SUIVI " + Date.now());

    await request.post("/api/formalites/annonce", {
      data: { dossier: dossier.id, publies: true },
    });

    await page.goto("/avocat/" + dossier.id + "?onglet=annonce");
    await expect(page.getByRole("button", { name: "Revenir sur la publication" })).toBeVisible();
  });
});

/*
 * Le cabinet ne se vérifie pas lui-même.
 *
 * Le compte des pièces à vérifier prenait tout ce qui portait « déposé » : le Kbis, le
 * récépissé, le registre des bénéficiaires - remis par l'avocat - rejoignaient la file
 * des justificatifs du client. Un dossier clos finissait sur « 1 pièce à vérifier », et
 * l'on demandait à l'avocat de valider le document qu'il venait de déposer.
 */
test.describe("les pièces à vérifier", () => {
  test.use({ storageState: "./tests/parcours/session-avocat.json" });

  const ouverts: number[] = [];
  test.afterAll(async () => {
    if (ouverts.length > 0) await retirerDossiers(ouverts);
  });

  test("ne comptent pas ce que le cabinet a déposé", async ({ page, request }) => {
    const client = await prisma.users.findFirstOrThrow({
      where: { email: "parcours@exemple.test" },
    });
    const avocat = await prisma.users.findFirstOrThrow({
      where: { email: "avocat-parcours@exemple.test" },
    });
    const dossier = await prisma.formalites.create({
      data: {
        user_id: client.id,
        assigned_avocat_id: avocat.id,
        type: "creation",
        forme: "SASU",
        societe: "PIECES CABINET " + Date.now(),
        status: "en_attente_validation",
        phase: 5,
        business_sub_phase: "5d",
      },
    });
    ouverts.push(dossier.id);

    const corps = new FormData();
    corps.append("dossier", String(dossier.id));
    corps.append("type", "kbis");
    corps.append("fichier", new Blob([PDF], { type: "application/pdf" }), "kbis.pdf");
    expect((await request.post("/api/avocat/livrables", { multipart: corps })).status()).toBe(201);

    await page.goto("/avocat/" + dossier.id + "?onglet=travail");
    await expect(page.getByText(/pièce à vérifier|pièces à vérifier/)).toHaveCount(0);
  });
});
