import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  normaliser,
  situer,
  reperer,
  recherchesPour,
  retouchesProposees,
  verifierRetouche,
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

    expect(recherches[0].cherche).toBe("12 rue de la Paix, 75002 Paris");
    expect(recherches[0].propose).toBe("5 avenue Victor Hugo, 69003 Lyon");
    // Et un repli sur la voie seule, les statuts n'écrivant pas toujours le code
    // postal sur la même ligne.
    expect(recherches[1].cherche).toBe("12 rue de la Paix");
  });

  it("un changement de dirigeant ne touche pas aux statuts", () => {
    expect(recherchesPour(["dirigeant"], { typeChangementDirigeant: "Nomination" }, societe)).toEqual(
      []
    );
  });

  it("une prorogation cherche les deux façons d'écrire une durée", () => {
    const recherches = recherchesPour(["prorogation"], { dureeActuelle: 50, nouvelleDuree: 99 }, societe);
    expect(recherches.map((r) => r.cherche)).toEqual(["50 ans", "50 années"]);
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
