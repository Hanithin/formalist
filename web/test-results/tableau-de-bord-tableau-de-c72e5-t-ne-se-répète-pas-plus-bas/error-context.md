# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tableau-de-bord.spec.ts >> tableau de bord du client >> le dossier mis en avant ne se répète pas plus bas
- Location: tests/parcours/tableau-de-bord.spec.ts:58:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.textContent: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('region', { name: 'Reprendre' }).locator('strong').first()

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - complementary [ref=e3]:
      - link [ref=e5] [cursor=pointer]:
        - /url: /tableau-de-bord
        - img "Formalist" [ref=e6]
      - link "Vous travaillez sur Création PARCOURS SIGNATURE" [ref=e7] [cursor=pointer]:
        - /url: /formalites
        - generic [ref=e8]: PS
        - generic [ref=e9]:
          - generic [ref=e10]:
            - generic [ref=e11]: Vous travaillez sur
            - generic [ref=e12]: Création
          - generic [ref=e13]: PARCOURS SIGNATURE
      - button "Nouvelle formalité" [ref=e16] [cursor=pointer]:
        - generic [ref=e17]: +
        - text: Nouvelle formalité
      - generic [ref=e18]:
        - navigation "Navigation principale" [ref=e19]:
          - link "Tableau de bord" [ref=e20] [cursor=pointer]:
            - /url: /tableau-de-bord
          - paragraph [ref=e27]: Mon activité
          - link "Mes formalités 2 en cours" [ref=e28] [cursor=pointer]:
            - /url: /formalites
            - text: Mes formalités
            - generic [ref=e33]: 2 en cours
          - link "Mes documents" [ref=e34] [cursor=pointer]:
            - /url: /documents
          - link "Messagerie 1 non lu" [ref=e38] [cursor=pointer]:
            - /url: /messagerie
            - text: Messagerie
            - generic [ref=e42]: 1 non lu
          - paragraph [ref=e43]: Services juridiques
          - link "Dépôt des comptes" [ref=e44] [cursor=pointer]:
            - /url: /depot-des-comptes
          - link "Contrats" [ref=e49] [cursor=pointer]:
            - /url: /contrats
          - link "Consultation juridique" [ref=e54] [cursor=pointer]:
            - /url: /consultations
          - paragraph [ref=e58]: Mon compte
          - link "Équipe" [ref=e59] [cursor=pointer]:
            - /url: /equipe
          - link "Paramètres" [ref=e66] [cursor=pointer]:
            - /url: /parametres
          - separator [ref=e71]
          - link "Centre d'aide" [ref=e72] [cursor=pointer]:
            - /url: /aide
        - button "Voir la suite du menu" [ref=e77] [cursor=pointer]
      - generic [ref=e80]:
        - generic [ref=e81]: CP
        - generic [ref=e82]:
          - generic [ref=e83]: Camille Parcours
          - generic [ref=e84]: parcours@exemple.test
        - button "Notifications" [ref=e86] [cursor=pointer]
        - link "Paramètres" [ref=e90] [cursor=pointer]:
          - /url: /parametres
        - button "Se déconnecter" [ref=e94] [cursor=pointer]
    - main [ref=e99]:
      - generic [ref=e100]:
        - heading "Bonjour Camille, comment avancent vos projets ?" [level=1] [ref=e101]
        - generic [ref=e102]:
          - generic [ref=e103]: Dimanche 23 août 2026
          - button "Nouvelle formalité" [ref=e104] [cursor=pointer]:
            - generic [ref=e105]: +
            - text: Nouvelle formalité
      - generic [ref=e106]:
        - generic [ref=e107]:
          - generic [ref=e108]:
            - term [ref=e109]: "4"
            - definition [ref=e110]: actions requises
          - generic [ref=e111]:
            - term [ref=e112]: "2"
            - definition [ref=e113]: formalités en cours
          - generic [ref=e114]:
            - term [ref=e115]: "2"
            - definition [ref=e116]: documents
        - region [ref=e117]:
          - generic [ref=e118]:
            - heading "Reprendre" [level=2] [ref=e119]
            - generic [ref=e120]: Création
          - paragraph [ref=e121]: SASU PARCOURS SIGNATURE
          - paragraph [ref=e122]: "Compléter les informations : nom, forme juridique, capital et dirigeant."
          - generic [ref=e123]:
            - 'progressbar "Avancement : 80 %" [ref=e124]'
            - generic [ref=e126]: 80 %
            - link "Compléter" [ref=e127] [cursor=pointer]:
              - /url: /creation?dossier=18625
        - region [ref=e128]:
          - generic [ref=e129]:
            - heading "Documents récents" [level=2] [ref=e130]
            - link "Tous les documents" [ref=e131] [cursor=pointer]:
              - /url: /documents
          - list [ref=e132]:
            - listitem [ref=e133]:
              - link "PDF 23 août Pièce d'identité.pdf PARCOURS EN COURS" [ref=e134] [cursor=pointer]:
                - /url: /documents
                - generic [ref=e135]:
                  - generic [ref=e136]: PDF
                  - generic [ref=e137]: 23 août
                - generic "Pièce d'identité.pdf" [ref=e138]
                - generic [ref=e139]: PARCOURS EN COURS
            - listitem [ref=e140]:
              - link "DOCX 23 août Statuts constitutifs.docx PARCOURS EN COURS" [ref=e141] [cursor=pointer]:
                - /url: /documents
                - generic [ref=e142]:
                  - generic [ref=e143]: DOCX
                  - generic [ref=e144]: 23 août
                - generic "Statuts constitutifs.docx" [ref=e145]
                - generic [ref=e146]: PARCOURS EN COURS
        - generic [ref=e147]:
          - generic [ref=e148]:
            - region [ref=e149]:
              - heading "Ce qui requiert votre attention" [level=2] [ref=e151]
              - list [ref=e152]:
                - listitem [ref=e153]:
                  - link "Un document à remplacer PARCOURS EN COURS · Votre avocat a demandé un justificatif conforme Remplacer" [ref=e154] [cursor=pointer]:
                    - /url: /creation?dossier=18622
                    - generic [ref=e156]:
                      - generic [ref=e157]: Un document à remplacer
                      - generic [ref=e158]:
                        - strong [ref=e159]: PARCOURS EN COURS
                        - text: · Votre avocat a demandé un justificatif conforme
                    - generic [ref=e160]: Remplacer
                - listitem [ref=e161]:
                  - link "Compléter les informations PARCOURS EN COURS · Nom, forme juridique, capital et dirigeant Compléter" [ref=e162] [cursor=pointer]:
                    - /url: /creation?dossier=18622
                    - generic [ref=e164]:
                      - generic [ref=e165]: Compléter les informations
                      - generic [ref=e166]:
                        - strong [ref=e167]: PARCOURS EN COURS
                        - text: · Nom, forme juridique, capital et dirigeant
                    - generic [ref=e168]: Compléter
            - region [ref=e169]:
              - heading "Formalités en cours 2" [level=2] [ref=e171]:
                - text: Formalités en cours
                - generic [ref=e172]: "2"
              - generic [ref=e173]:
                - generic [ref=e174]:
                  - generic [ref=e175]: Formalité
                  - generic [ref=e176]: Société
                  - generic [ref=e177]: Avancement
                - list [ref=e178]:
                  - listitem [ref=e179]:
                    - generic [ref=e180]:
                      - generic [ref=e181]: Création SASU
                      - generic [ref=e182]: Étape 4 sur 5 · Signature
                    - generic "SASU PARCOURS SIGNATURE" [ref=e183]
                    - generic [ref=e184]:
                      - 'progressbar "Avancement : 80 %" [ref=e185]'
                      - generic [ref=e187]: 80 %
                    - link "Compléter" [ref=e188] [cursor=pointer]:
                      - /url: /creation?dossier=18625
                  - listitem [ref=e189]:
                    - generic [ref=e190]:
                      - generic [ref=e191]: Création SASU
                      - generic [ref=e192]: Étape 3 sur 5 · Documents
                    - generic "SASU PARCOURS EN COURS" [ref=e193]
                    - generic [ref=e194]:
                      - 'progressbar "Avancement : 60 %" [ref=e195]'
                      - generic [ref=e197]: 60 %
                    - link "Remplacer" [ref=e198] [cursor=pointer]:
                      - /url: /creation?dossier=18622
          - complementary [ref=e199]:
            - region [ref=e200]:
              - heading "Échéances à venir" [level=2] [ref=e202]
              - generic [ref=e203]:
                - paragraph [ref=e204]: Aucune échéance à venir
                - paragraph [ref=e205]: Nous afficherons ici les prochaines obligations juridiques de vos sociétés.
            - region [ref=e206]:
              - heading "Activité récente" [level=2] [ref=e208]
              - paragraph [ref=e210]: Aucune activité récente.
    - button "Messages, 1 non lus" [ref=e211] [cursor=pointer]:
      - text: Messages
      - generic [ref=e212]: "1"
  - alert [ref=e213]
```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | import { retirerDossiers } from "./nettoyage";
  3   | 
  4   | /**
  5   |  * Le tableau de bord et l'espace avocat.
  6   |  *
  7   |  * Le jeu de données contient deux sociétés, dont une terminée, un document
  8   |  * refusé et un avocat assigné.
  9   |  */
  10  | 
  11  | test.describe("tableau de bord du client", () => {
  12  |   test("annonce en chiffres ce qu'il y a à savoir, et tait les zéros", async ({ page }) => {
  13  |     /*
  14  |      * Une ligne discrète sous la salutation, non un bloc de cases : ces chiffres ne
  15  |      * demandent rien, ils situent. Et un zéro ne s'écrit pas - « 0 échéance » occupe la
  16  |      * place d'un chiffre pour annoncer une absence, et l'on relit pour vérifier qu'on
  17  |      * n'a rien manqué.
  18  |      */
  19  |     await page.goto("/tableau-de-bord");
  20  | 
  21  |     const indicateurs = page.locator("dl[class*='indicateurs']");
  22  |     await expect(indicateurs).toBeVisible();
  23  |     await expect(indicateurs.getByText(/formalités? en cours/)).toBeVisible();
  24  |     await expect(indicateurs.getByText("0", { exact: true })).toHaveCount(0);
  25  |   });
  26  | 
  27  |   test("la salutation reprend la phrase du moment, et la date passe à droite", async ({
  28  |     page,
  29  |   }) => {
  30  |     await page.goto("/tableau-de-bord");
  31  | 
  32  |     const titre = page.getByRole("heading", { level: 1 });
  33  |     await expect(titre).toHaveText(/^(Bonjour|Bonsoir) Camille, .+/);
  34  | 
  35  |     // La date n'est plus collée sous le prénom : elle accompagne le bouton, à droite.
  36  |     const boiteTitre = await titre.boundingBox();
  37  |     const boiteDate = await page.getByText(/^(Dimanche|Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi)/).first().boundingBox();
  38  |     expect(boiteDate!.x).toBeGreaterThan(boiteTitre!.x + boiteTitre!.width);
  39  |   });
  40  | 
  41  |   test("dit ce qui requiert l'attention, avec la société concernée", async ({ page }) => {
  42  |     await page.goto("/tableau-de-bord");
  43  | 
  44  |     await expect(
  45  |       page.getByRole("heading", { name: "Ce qui requiert votre attention" })
  46  |     ).toBeVisible();
  47  |     // Le document refusé du jeu de données doit remonter en premier.
  48  |     await expect(page.getByText("Un document à remplacer").first()).toBeVisible();
  49  |     await expect(page.getByText(/PARCOURS EN COURS/).first()).toBeVisible();
  50  |   });
  51  | 
  52  |   test("chaque action mène directement là où il faut agir", async ({ page }) => {
  53  |     await page.goto("/tableau-de-bord");
  54  |     const lien = page.getByRole("link", { name: "Remplacer" }).first();
  55  |     await expect(lien).toHaveAttribute("href", /\/creation\?dossier=\d+/);
  56  |   });
  57  | 
  58  |   test("le dossier mis en avant ne se répète pas plus bas", async ({ page }) => {
  59  |     /*
  60  |      * C'était le défaut le plus visible : un même dossier figurait dans le bandeau de
  61  |      * reprise, dans les vignettes et dans la liste des attentes. Sur vingt dossiers,
  62  |      * l'accueil affichait vingt fois la même phrase sans jamais dire ce qui pressait.
  63  |      */
  64  |     await page.goto("/tableau-de-bord");
  65  | 
  66  |     const reprise = page.getByRole("region", { name: "Reprendre" });
  67  |     await expect(reprise).toBeVisible();
  68  | 
> 69  |     const societeReprise = await reprise.locator("strong").first().textContent();
      |                                                                    ^ Error: locator.textContent: Test timeout of 30000ms exceeded.
  70  |     expect(societeReprise, "le bandeau doit nommer une société").toBeTruthy();
  71  | 
  72  |     const attention = page.getByRole("region", { name: "Ce qui requiert votre attention" });
  73  |     await expect(attention.getByText(societeReprise!.trim(), { exact: true })).toHaveCount(0);
  74  |   });
  75  | 
  76  |   test("les formalités en cours sont des formalités, non des sociétés", async ({ page }) => {
  77  |     /*
  78  |      * La section s'appelait « Vos sociétés » et montrait des barres d'avancement avec
  79  |      * un bouton « Continuer » : ce sont des dossiers. Une société est permanente, une
  80  |      * formalité est une opération - la confusion tenait au seul titre.
  81  |      */
  82  |     await page.goto("/tableau-de-bord");
  83  | 
  84  |     await expect(page.getByRole("heading", { name: "Formalités en cours" })).toBeVisible();
  85  |     await expect(page.getByRole("heading", { name: /Vos sociétés/ })).toHaveCount(0);
  86  | 
  87  |     const section = page.getByRole("region", { name: "Formalités en cours" });
  88  |     const vignettes = section.locator("li");
  89  |     expect(await vignettes.count()).toBeLessThanOrEqual(3);
  90  | 
  91  |     // Chaque vignette distingue le type de formalité du nom de la société.
  92  |     await expect(section.getByText(/Création|Modification|Dépôt des comptes|Fermeture/).first()).toBeVisible();
  93  |   });
  94  | 
  95  |   test("une section d'échéances existe, même sans échéance connue", async ({ page }) => {
  96  |     /*
  97  |      * Nous n'avons pas de calendrier des obligations : la section reste vide plutôt
  98  |      * que d'afficher un exemple qui ne bougerait jamais. Elle doit exister quand même,
  99  |      * sans quoi personne ne saura qu'elle se remplira.
  100 |      */
  101 |     await page.goto("/tableau-de-bord");
  102 |     await expect(page.getByRole("heading", { name: "Échéances à venir" })).toBeVisible();
  103 |   });
  104 | 
  105 |   test("« Voir tout » mène à la liste des formalités", async ({ page, request }) => {
  106 |     /*
  107 |      * Le lien n'apparaît que s'il reste des formalités à voir : trois vignettes au
  108 |      * plus. Le jeu de données en compte parfois exactement trois - le seuil se mesure
  109 |      * donc sur les dossiers ouverts, non sur le total, qui inclut les terminés.
  110 |      */
  111 |     const { dossiers } = (await (await request.get("/api/formalites")).json()) as {
  112 |       dossiers: { status: string | null }[];
  113 |     };
  114 |     const ouverts = dossiers.filter((d) => d.status !== "terminee" && d.status !== "archive");
  115 |     test.skip(ouverts.length <= 3, "il faut plus de trois dossiers ouverts");
  116 | 
  117 |     await page.goto("/tableau-de-bord");
  118 |     const section = page.getByRole("region", { name: "Formalités en cours" });
  119 |     await expect(section.getByRole("link", { name: "Voir tout" })).toHaveAttribute(
  120 |       "href",
  121 |       "/formalites"
  122 |     );
  123 |   });
  124 | 
  125 |   test("aucun lien de l'accueil ne mène nulle part", async ({ page, request }) => {
  126 |     // Les vignettes ont pointé sur /formalites/<id>, qui n'existe pas : la page
  127 |     // s'affichait bien et « Continuer » rendait un 404.
  128 |     await page.goto("/tableau-de-bord");
  129 | 
  130 |     const adresses = await page.getByRole("link").evaluateAll((liens) =>
  131 |       liens
  132 |         .map((l) => (l as HTMLAnchorElement).getAttribute("href") ?? "")
  133 |         .filter((h) => h.startsWith("/"))
  134 |     );
  135 | 
  136 |     for (const adresse of [...new Set(adresses)]) {
  137 |       expect(
  138 |         (await request.get(adresse)).status(),
  139 |         adresse + " ne répond pas"
  140 |       ).toBeLessThan(400);
  141 |     }
  142 |   });
  143 | });
  144 | 
  145 | /**
  146 |  * Ouvre la page complète d'un dossier depuis la liste.
  147 |  *
  148 |  * Le clic sur le nom ouvre désormais un panneau de détail plutôt que de quitter la
  149 |  * liste : la page complète se rejoint depuis ce panneau.
  150 |  */
  151 | async function ouvrirLeDossier(page: import("@playwright/test").Page, societe: string) {
  152 |   await page.goto("/avocat");
  153 |   await page.getByRole("button", { name: societe, exact: true }).click();
  154 |   await page.getByRole("dialog").getByRole("link", { name: "Ouvrir le dossier" }).click();
  155 |   await page.waitForURL(/\/avocat\/\d+/);
  156 | }
  157 | 
  158 | test.describe("espace avocat", () => {
  159 |   test.use({ storageState: "./tests/parcours/session-avocat.json" });
  160 | 
  161 |   test("liste les dossiers du cabinet", async ({ page }) => {
  162 |     await page.goto("/avocat");
  163 |     await expect(page.getByRole("heading", { level: 1 })).toContainText("Espace avocat");
  164 |     // Le nom de la société est un bouton depuis qu'il ouvre le panneau de détail.
  165 |     await expect(page.getByRole("button", { name: "PARCOURS EN COURS", exact: true })).toBeVisible();
  166 |   });
  167 | 
  168 |   test("un filtre laisse exactement le nombre de dossiers qu'il annonce", async ({ page }) => {
  169 |     /*
```