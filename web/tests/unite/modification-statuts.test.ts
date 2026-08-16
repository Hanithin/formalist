import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  normaliser,
  situer,
  reperer,
  reperage,
  recherchesPour,
  retouchesProposees,
  verifierRetouche,
  fragmentsDe,
  RetoucheInvalide,
  type Mot,
} from "@/domain/modification/edition";
import {
  lireLesStatuts,
  appliquerLesRetouches,
  lisibleParLaPolice,
  pageEnImage,
} from "@/infrastructure/documents/statuts";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const executer = promisify(execFile);

/** Ce qu'on lit à l'œil sur une page : la seule preuve que rien n'a disparu. */
async function texteVisible(png: Buffer): Promise<string> {
  const dossier = await mkdtemp(join(tmpdir(), "vue-"));
  try {
    await writeFile(join(dossier, "page.png"), png);
    const { stdout } = await executer("tesseract", [join(dossier, "page.png"), "stdout", "-l", "fra"], {
      timeout: 120_000,
    });
    return stdout;
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}

/**
 * La retouche des statuts, de bout en bout.
 *
 * Le test fabrique un PDF de statuts, y repère l'ancienne adresse, applique la
 * retouche et relit le document produit. C'est le seul contrôle qui prouve quelque
 * chose : une retouche posée aux mauvaises coordonnées produit un fichier valide,
 * de la bonne taille, où l'ancienne adresse reste lisible.
 */

const ANCIENNE = "12 rue de la Paix, 75002 Paris";
const NOUVELLE = "5 avenue Victor Hugo, 69003 Lyon";

async function statutsDEssai(): Promise<Buffer> {
  const document = await PDFDocument.create();
  const police = await document.embedFont(StandardFonts.Helvetica);

  const pages = [
    [
      "STATUTS DE LA SOCIETE ACME CONSEIL",
      "",
      "ARTICLE 4 - SIEGE SOCIAL",
      "Le siege social est fixe au " + ANCIENNE + ".",
      "",
      "ARTICLE 6 - CAPITAL SOCIAL",
      "Le capital social est fixe a la somme de 15000 euros.",
    ],
    [
      "ARTICLE 12 - EXERCICE SOCIAL",
      "L exercice social commence le 1er janvier.",
      "",
      "ARTICLE 14 - DISSOLUTION",
      "La societe est dissoute a l arrivee du terme.",
    ],
  ];

  for (const lignes of pages) {
    const page = document.addPage([595, 842]);
    lignes.forEach((ligne, rang) => {
      if (!ligne) return;
      page.drawText(ligne, { x: 60, y: 760 - rang * 26, size: 11, font: police });
    });
  }

  return Buffer.from(await document.save());
}

describe("la comparaison des textes", () => {
  it("ignore accents, casse et ponctuation", () => {
    /*
     * Les statuts écrivent « SIÈGE SOCIAL » en capitales accentuées, le formulaire
     * « siège social », et une reconnaissance de caractères rend « SIEGE ». Sans
     * cette mise à plat, aucune des trois ne retrouve les deux autres.
     */
    expect(normaliser("SIÈGE SOCIAL")).toBe("siege social");
    expect(normaliser("Paris.")).toBe("paris");
    expect(normaliser("15 000 €")).toBe("15 000");
  });

  it("les diacritiques sont bien retirés", () => {
    // La classe de caractères combinants est invisible à la lecture du code : une
    // réécriture du fichier peut l'aplatir sans que rien ne le signale.
    expect(normaliser("À ÉÈÊ Ç Ù")).toBe("a eee c u");
  });
});

describe("situer un passage", () => {
  const mots: Mot[] = [
    { page: 1, texte: "Le", x: 60, y: 100, largeur: 12, hauteur: 10 },
    { page: 1, texte: "siège", x: 75, y: 100, largeur: 26, hauteur: 10 },
    { page: 1, texte: "est", x: 105, y: 100, largeur: 14, hauteur: 10 },
    { page: 1, texte: "au", x: 122, y: 100, largeur: 12, hauteur: 10 },
    { page: 1, texte: "12", x: 137, y: 100, largeur: 12, hauteur: 10 },
    { page: 1, texte: "rue", x: 152, y: 100, largeur: 16, hauteur: 10 },
    { page: 1, texte: "de", x: 171, y: 100, largeur: 12, hauteur: 10 },
    { page: 1, texte: "la", x: 186, y: 100, largeur: 9, hauteur: 10 },
    { page: 1, texte: "Paix.", x: 198, y: 100, largeur: 24, hauteur: 10 },
  ];

  it("retrouve une suite de mots malgré la ponctuation collée", () => {
    const situes = situer(mots, "12 rue de la Paix");
    expect(situes?.map((m) => m.texte)).toEqual(["12", "rue", "de", "la", "Paix."]);
  });

  it("ne trouve rien quand le passage n'y est pas", () => {
    expect(situer(mots, "5 avenue Victor Hugo")).toBeNull();
  });

  it("un passage replié donne un rectangle par ligne", () => {
    /*
     * Un seul rectangle couvrirait tout ce qui se trouve entre les deux lignes -
     * y compris le texte des lignes intermédiaires, qui disparaîtrait.
     */
    const surDeuxLignes: Mot[] = [
      { page: 1, texte: "12", x: 400, y: 100, largeur: 12, hauteur: 10 },
      { page: 1, texte: "rue", x: 415, y: 100, largeur: 16, hauteur: 10 },
      { page: 1, texte: "de", x: 60, y: 118, largeur: 12, hauteur: 10 },
      { page: 1, texte: "la", x: 75, y: 118, largeur: 9, hauteur: 10 },
      { page: 1, texte: "Paix", x: 87, y: 118, largeur: 22, hauteur: 10 },
    ];

    const zones = reperer(surDeuxLignes, [
      { cle: "transfert_siege", article: "Siège social", cherche: "12 rue de la Paix", propose: NOUVELLE },
    ]);
    expect(zones).toHaveLength(1);
    expect(zones[0].rectangles).toHaveLength(2);
  });
});

describe("ce qu'on cherche dans les statuts", () => {
  const societe = {
    denomination: "ACME CONSEIL",
    adresse: "12 rue de la Paix",
    codePostal: "75002",
    ville: "Paris",
    capital: 15000,
  };

  it("un transfert cherche l'ancienne adresse, pas le titre de l'article", () => {
    /*
     * « ARTICLE 4 » ne dit pas où finit le passage à couvrir, alors que l'ancienne
     * adresse le dit exactement - et nous l'avons déjà, elle vient du registre.
     */
    const recherches = recherchesPour(["transfert_siege"], {
      nouvelleAdresse: "5 avenue Victor Hugo",
      nouveauCodePostal: "69003",
      nouvelleVille: "Lyon",
    }, societe);

    expect(recherches).toHaveLength(1);
    expect(recherches[0].cherche).toBe("12 rue de la Paix, 75002 Paris");
    expect(recherches[0].propose).toBe("5 avenue Victor Hugo, 69003 Lyon");
    // Et un repli sur la voie seule, les statuts n'écrivant pas toujours le code
    // postal sur la même ligne.
    expect(recherches[0].variantes).toContain("12 rue de la Paix");
    // À défaut de la valeur, on saura au moins mener à l'article.
    expect(recherches[0].ancre).toContain("siège social");
  });

  it("un changement de dirigeant ne touche pas aux statuts", () => {
    expect(recherchesPour(["dirigeant"], { typeChangementDirigeant: "Nomination" }, societe)).toEqual(
      []
    );
  });

  it("une prorogation essaie les deux façons d'écrire une durée", () => {
    /*
     * Elles désignent la même durée : deux recherches distinctes annonçaient deux
     * manques pour un seul changement, et le panneau comptait faux.
     */
    const recherches = recherchesPour(["prorogation"], { dureeActuelle: 50, nouvelleDuree: 99 }, societe);
    expect(recherches).toHaveLength(1);
    expect(recherches[0].cherche).toBe("50 années");
    expect(recherches[0].variantes).toContain("50 ans");
  });
});

describe("les garde-fous d'une retouche", () => {
  const page = { largeur: 595, hauteur: 842 };

  it("un rectangle hors page est refusé", () => {
    // Un rectangle hors page ne couvre rien : la retouche paraîtrait appliquée
    // alors que l'ancienne valeur resterait lisible dans le document déposé.
    expect(() =>
      verifierRetouche({ page: 1, x: 580, y: 100, largeur: 200, hauteur: 12, texte: "x", taille: 10 }, page)
    ).toThrow(RetoucheInvalide);
  });

  it("une taille absurde est refusée", () => {
    expect(() =>
      verifierRetouche({ page: 1, x: 60, y: 100, largeur: 100, hauteur: 12, texte: "x", taille: 400 }, page)
    ).toThrow(RetoucheInvalide);
  });

  it("le texte est ramené à ce que la police sait écrire", () => {
    expect(lisibleParLaPolice("l’adresse — « test »")).toBe("l'adresse - « test »");
  });
});

describe("la retouche appliquée à un vrai PDF", () => {
  let statuts: Buffer;

  beforeAll(async () => {
    statuts = await statutsDEssai();
  }, 30_000);

  it("les mots du document arrivent avec leurs positions", async () => {
    const lecture = await lireLesStatuts(statuts);

    expect(lecture.pages).toHaveLength(2);
    expect(lecture.reconnus).toBe(false);
    expect(lecture.mots.map((m) => m.texte)).toContain("SIEGE");
    // Les coordonnées sont en points, origine en haut à gauche.
    const siege = lecture.mots.find((m) => m.texte === "SIEGE")!;
    expect(siege.y).toBeGreaterThan(0);
    expect(siege.y).toBeLessThan(842);
  }, 30_000);

  it("l'ancienne adresse disparaît et la nouvelle la remplace", async () => {
    const lecture = await lireLesStatuts(statuts);

    const zones = reperer(
      lecture.mots,
      recherchesPour(
        ["transfert_siege"],
        {
          nouvelleAdresse: "5 avenue Victor Hugo",
          nouveauCodePostal: "69003",
          nouvelleVille: "Lyon",
        },
        {
          adresse: "12 rue de la Paix",
          codePostal: "75002",
          ville: "Paris",
        }
      )
    );
    expect(zones.length).toBeGreaterThan(0);

    const retouche = await appliquerLesRetouches(statuts, retouchesProposees([zones[0]]));
    const relu = await lireLesStatuts(retouche);
    const texte = relu.mots.map((m) => m.texte).join(" ");

    // Le nouveau texte est écrit en vraies lettres : sélectionnable et cherchable.
    expect(texte).toContain("Victor");
    expect(texte).toContain("Hugo");

    /*
     * Et surtout, l'ancienne adresse n'est plus dans le document.
     *
     * Un simple rectangle blanc la laissait dans la couche texte : elle restait
     * copiable et pdftotext la rendait encore, dans des statuts déposés au greffe.
     */
    expect(texte).not.toContain("Paix");
    expect(texte).not.toContain("75002");
  }, 60_000);

  it("une page sans retouche garde sa couche texte", async () => {
    // Aucune raison de dégrader vingt pages pour en corriger une.
    const zones = reperer(
      (await lireLesStatuts(statuts)).mots,
      recherchesPour(
        ["transfert_siege"],
        { nouvelleAdresse: "5 avenue Victor Hugo", nouveauCodePostal: "69003", nouvelleVille: "Lyon" },
        { adresse: "12 rue de la Paix", codePostal: "75002", ville: "Paris" }
      )
    );

    const retouche = await appliquerLesRetouches(statuts, retouchesProposees([zones[0]]));
    const relu = await lireLesStatuts(retouche);

    const page2 = relu.mots.filter((m) => m.page === 2).map((m) => m.texte).join(" ");
    expect(page2).toContain("DISSOLUTION");
    expect(page2).toContain("EXERCICE");
  }, 60_000);

  it("le reste de la page retouchée demeure lisible", async () => {
    /*
     * La page devient une image : son texte n'est plus extractible, ce qui est le
     * prix de la suppression réelle de l'ancienne valeur. Encore faut-il que rien
     * n'ait disparu à l'œil - c'est ce que cette lecture vérifie.
     */
    const zones = reperer(
      (await lireLesStatuts(statuts)).mots,
      recherchesPour(
        ["transfert_siege"],
        { nouvelleAdresse: "5 avenue Victor Hugo", nouveauCodePostal: "69003", nouvelleVille: "Lyon" },
        { adresse: "12 rue de la Paix", codePostal: "75002", ville: "Paris" }
      )
    );

    const retouche = await appliquerLesRetouches(statuts, retouchesProposees([zones[0]]));
    const vu = await texteVisible(await pageEnImage(retouche, 1));

    expect(vu).toContain("CAPITAL");
    expect(vu).toContain("15000");
    expect(vu).toContain("ACME");
    expect(vu).not.toContain("Paix");
  }, 120_000);
});

describe("la mise en forme d'une retouche", () => {
  it("le gras et l'italique changent la police du document", async () => {
    /*
     * Dans un PDF, le gras ne se règle pas : c'est une autre police. Sans les quatre
     * variantes de chaque famille, cocher « gras » n'aurait aucun effet sur le
     * document produit alors que l'écran l'afficherait.
     */
    const statuts = await statutsDEssai();
    const commun = { page: 1, x: 60, y: 300, largeur: 200, hauteur: 14, taille: 11 };

    const ordinaire = await appliquerLesRetouches(statuts, [
      { ...commun, texte: "Texte temoin", police: "serif" as const },
    ]);
    const grasse = await appliquerLesRetouches(statuts, [
      { ...commun, texte: "Texte temoin", police: "serif" as const, gras: true },
    ]);

    // Le même texte, deux polices : les documents diffèrent.
    expect(ordinaire.equals(grasse)).toBe(false);

    // Et le texte reste lisible dans les deux.
    for (const produit of [ordinaire, grasse]) {
      const relu = await lireLesStatuts(produit);
      expect(relu.mots.map((m) => m.texte).join(" ")).toContain("temoin");
    }
  }, 120_000);

  it("une police inconnue retombe sur le serif, sans faire échouer", async () => {
    // Un dossier ancien n'a pas de police : il doit continuer de se produire.
    const statuts = await statutsDEssai();
    const produit = await appliquerLesRetouches(statuts, [
      { page: 1, x: 60, y: 300, largeur: 200, hauteur: 14, taille: 11, texte: "Sans police" },
    ]);

    const relu = await lireLesStatuts(produit);
    expect(relu.mots.map((m) => m.texte).join(" ")).toContain("police");
  }, 120_000);
});

describe("le souligné et l'alignement", () => {
  const commun = { page: 1, x: 60, y: 300, largeur: 300, hauteur: 14, taille: 11 };

  it("le souligné trace un trait, il ne se déclare pas", async () => {
    /*
     * Aucune police standard ne porte de souligné : il faut le dessiner. Sans cela,
     * cocher « souligné » n'aurait aucun effet sur le document alors que l'écran
     * l'afficherait.
     */
    const statuts = await statutsDEssai();

    const sans = await appliquerLesRetouches(statuts, [{ ...commun, texte: "Texte temoin" }]);
    const avec = await appliquerLesRetouches(statuts, [
      { ...commun, texte: "Texte temoin", souligne: true },
    ]);

    expect(sans.equals(avec)).toBe(false);
    expect((await lireLesStatuts(avec)).mots.map((m) => m.texte).join(" ")).toContain("temoin");
  }, 120_000);

  it("centrer déplace vraiment le texte", async () => {
    // Un PDF ne connaît pas de « texte centré » : il connaît une abscisse. Centrer
    // demande de mesurer le texte, puis de poser l'origine en conséquence.
    const statuts = await statutsDEssai();

    const gauche = await appliquerLesRetouches(statuts, [
      { ...commun, texte: "Repere", alignement: "gauche" as const },
    ]);
    const centre = await appliquerLesRetouches(statuts, [
      { ...commun, texte: "Repere", alignement: "centre" as const },
    ]);
    const droite = await appliquerLesRetouches(statuts, [
      { ...commun, texte: "Repere", alignement: "droite" as const },
    ]);

    const abscisse = async (pdf: Buffer) => {
      const lu = await lireLesStatuts(pdf);
      return lu.mots.find((m) => m.texte.includes("Repere"))!.x;
    };

    const [a, b, c] = [await abscisse(gauche), await abscisse(centre), await abscisse(droite)];
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    // Et le texte reste dans son cadre.
    expect(c).toBeLessThanOrEqual(commun.x + commun.largeur);
  }, 180_000);
});

describe("les polices embarquées", () => {
  it("EB Garamond voyage dans le document", async () => {
    /*
     * Un PDF n'a que quatorze polices garanties ; toute autre doit être embarquée.
     * Sans cela, le sélecteur proposerait un choix sans effet sur le document.
     */
    const statuts = await statutsDEssai();
    const commun = { page: 1, x: 60, y: 300, largeur: 300, hauteur: 14, taille: 11 };

    const standard = await appliquerLesRetouches(statuts, [
      { ...commun, texte: "Texte temoin", police: "serif" as const },
    ]);
    const garamond = await appliquerLesRetouches(statuts, [
      { ...commun, texte: "Texte temoin", police: "garamond" as const },
    ]);

    // La police embarquée alourdit le document : c'est le signe qu'elle y est.
    expect(garamond.byteLength).toBeGreaterThan(standard.byteLength);
    expect((await lireLesStatuts(garamond)).mots.map((m) => m.texte).join(" ")).toContain("temoin");
  }, 180_000);

  it("une police inconnue retombe sur le serif au lieu d'échouer", async () => {
    // Mieux vaut un acte composé autrement que pas d'acte du tout.
    const statuts = await statutsDEssai();
    const produit = await appliquerLesRetouches(statuts, [
      {
        page: 1,
        x: 60,
        y: 300,
        largeur: 300,
        hauteur: 14,
        taille: 11,
        texte: "Repli serif",
        police: "inconnue" as never,
      },
    ]);
    expect((await lireLesStatuts(produit)).mots.map((m) => m.texte).join(" ")).toContain("Repli");
  }, 120_000);
});

describe("le style appliqué à une partie du texte", () => {
  const commun = { page: 1, x: 60, y: 300, largeur: 320, hauteur: 14, taille: 11 };

  it("un seul mot en gras change le document", async () => {
    /*
     * Une retouche portait un style unique : mettre un mot en gras demandait de poser
     * un second cadre à côté, en devinant où finissait le premier. Le texte se découpe
     * donc en morceaux, et chacun a sa police dans le PDF - le gras n'y est pas un
     * réglage.
     */
    const statuts = await statutsDEssai();

    const ordinaire = await appliquerLesRetouches(statuts, [
      { ...commun, texte: "Atelier Nouveau Monde" },
    ]);
    const partiel = await appliquerLesRetouches(statuts, [
      {
        ...commun,
        texte: "Atelier Nouveau Monde",
        fragments: [
          { texte: "Atelier Nouveau " },
          { texte: "Monde", gras: true },
        ],
      },
    ]);

    expect(ordinaire.equals(partiel)).toBe(false);

    // Le texte reste entier et dans l'ordre.
    const relu = (await lireLesStatuts(partiel)).mots.map((m) => m.texte).join(" ");
    expect(relu).toContain("Atelier");
    expect(relu).toContain("Monde");
  }, 180_000);

  it("les morceaux se suivent sans se chevaucher", async () => {
    // Chaque morceau avance l'abscisse de sa propre largeur : mal mesuré, le second
    // s'écrirait par-dessus le premier.
    const statuts = await statutsDEssai();
    const produit = await appliquerLesRetouches(statuts, [
      {
        ...commun,
        texte: "Premier Second",
        fragments: [{ texte: "Premier " }, { texte: "Second", gras: true }],
      },
    ]);

    const mots = (await lireLesStatuts(produit)).mots;
    const premier = mots.find((m) => m.texte.includes("Premier"))!;
    const second = mots.find((m) => m.texte.includes("Second"))!;

    expect(second.x).toBeGreaterThan(premier.x + premier.largeur - 2);
  }, 180_000);

  it("sans découpage, le style du cadre s'applique à tout", () => {
    // Les dossiers ouverts avant le découpage doivent continuer de se lire.
    expect(fragmentsDe({ ...commun, texte: "Tout en gras", gras: true })).toEqual([
      { texte: "Tout en gras", gras: true, italique: undefined, souligne: undefined },
    ]);
  });
});

describe("ce que le repérage ne trouve pas", () => {
  const mots: Mot[] = [
    { page: 1, texte: "ARTICLE", x: 60, y: 100, largeur: 40, hauteur: 10 },
    { page: 1, texte: "5", x: 105, y: 100, largeur: 8, hauteur: 10 },
    { page: 1, texte: "DURÉE", x: 118, y: 100, largeur: 30, hauteur: 10 },
    { page: 1, texte: "La", x: 60, y: 120, largeur: 12, hauteur: 10 },
    { page: 1, texte: "durée", x: 75, y: 120, largeur: 26, hauteur: 10 },
    { page: 1, texte: "est", x: 104, y: 120, largeur: 14, hauteur: 10 },
    { page: 1, texte: "de", x: 121, y: 120, largeur: 12, hauteur: 10 },
    { page: 1, texte: "vingt-trois", x: 136, y: 120, largeur: 50, hauteur: 10 },
    { page: 1, texte: "années", x: 189, y: 120, largeur: 32, hauteur: 10 },
  ];

  const prorogation = recherchesPour(
    ["prorogation"],
    { dureeActuelle: 23, nouvelleDuree: 99 },
    {}
  );

  it("les formulations d'un même changement tiennent en une seule recherche", () => {
    /*
     * « 23 ans » et « 23 années » désignent la même durée. Les chercher séparément
     * annonçait deux manques pour un seul changement, et le panneau comptait faux.
     */
    expect(prorogation).toHaveLength(1);
    expect(prorogation[0].variantes).toContain("23 ans");
  });

  it("à défaut de la valeur, l'article est localisé", () => {
    /*
     * Les statuts écrivent « vingt-trois années » : la valeur ne se retrouve pas. Dire
     * « introuvable » sans rien d'autre oblige à parcourir vingt pages ; on sait au
     * moins mener à l'article.
     */
    const { zones, introuvables } = reperage(mots, prorogation);

    expect(zones).toHaveLength(0);
    expect(introuvables).toHaveLength(1);
    expect(introuvables[0].article).toBeDefined();
    expect(introuvables[0].article!.page).toBe(1);
  });

  it("sans article reconnaissable, on le dit sans prétendre le situer", () => {
    const { introuvables } = reperage(
      [{ page: 1, texte: "Néant", x: 60, y: 100, largeur: 30, hauteur: 10 }],
      prorogation
    );
    expect(introuvables[0].article).toBeUndefined();
  });

  it("une valeur retrouvée ne laisse aucun manque", () => {
    const avecLaValeur: Mot[] = [
      ...mots,
      { page: 1, texte: "23", x: 60, y: 140, largeur: 14, hauteur: 10 },
      { page: 1, texte: "années", x: 78, y: 140, largeur: 32, hauteur: 10 },
    ];
    const { zones, introuvables } = reperage(avecLaValeur, prorogation);

    expect(zones).toHaveLength(1);
    expect(introuvables).toHaveLength(0);
  });
});

describe("les pages écartées", () => {
  it("ne figurent pas dans le document produit", async () => {
    /*
     * Des statuts déposés portent parfois une page de garde du greffe ou un bordereau
     * que le dépôt suivant n'a pas à reprendre.
     */
    const statuts = await statutsDEssai();
    const avant = await lireLesStatuts(statuts);
    expect(avant.pages).toHaveLength(2);

    const produit = await appliquerLesRetouches(statuts, [], [2]);
    const apres = await lireLesStatuts(produit);

    expect(apres.pages).toHaveLength(1);
    // C'est bien la seconde qui est partie.
    expect(apres.mots.map((m) => m.texte).join(" ")).not.toContain("DISSOLUTION");
  }, 120_000);

  it("l'original les garde", async () => {
    // La retouche part des statuts en vigueur et produit un second document : le point
    // de départ ne se perd jamais.
    const statuts = await statutsDEssai();
    await appliquerLesRetouches(statuts, [], [1]);

    const original = await lireLesStatuts(statuts);
    expect(original.pages).toHaveLength(2);
  }, 120_000);

  it("un retrait sans retouche produit quand même un document", async () => {
    // Écarter une page est une modification à part entière, même sans rien réécrire.
    const statuts = await statutsDEssai();
    const produit = await appliquerLesRetouches(statuts, [], [1]);
    expect(produit.equals(statuts)).toBe(false);
  }, 120_000);
});
