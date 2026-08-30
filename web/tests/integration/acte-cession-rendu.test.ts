import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  actesDeCession,
  donneesDeLActeDeCession,
  verifierLActeDeCession,
  motsDeLaCession,
  identificationDuTiers,
} from "@/domain/modification/acte-cession";
import { rendreLActeDeCession } from "@/infrastructure/documents/modeles-cabinet";
import { MODELE_CESSION } from "@/domain/modification/gabarit";
import type { ContexteGabarit } from "@/domain/modification/gabarit";

/**
 * L'acte de cession universel, lu dans le document signé.
 *
 * Le modèle est tiré de deux actes réels. C'est là qu'est le danger : un modèle
 * fabriqué par « enregistrer sous » garde les noms, les montants et les sièges du
 * dossier dont il vient, et ils ressortent des mois plus tard chez un autre client, au
 * milieu d'un acte qui part à l'enregistrement. Le premier test de ce fichier lit donc
 * le .docx lui-même, avant tout rendu.
 */

function texteDu(docx: Buffer): string {
  return new PizZip(docx)
    .file("word/document.xml")!
    .asText()
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const SOCIETE = {
  denomination: "ATELIER LAUGIER",
  forme: "SAS",
  siren: "101581148",
  adresse: "12 rue Vauban",
  codePostal: "69006",
  ville: "Lyon",
  capital: 1000,
  villeRcs: "Lyon",
};

const ASSOCIES = [
  {
    nature: "physique",
    civilite: "Monsieur",
    prenom: "Paul",
    nom: "MERCIER",
    parts: 500,
    neLe: "1972-06-18",
    neA: "Nantes (Loire-Atlantique)",
    nationalite: "Française",
    adresse: "7 rue Sainte-Catherine, 69001 Lyon",
  },
  {
    nature: "morale",
    denomination: "MERCIER FRERES",
    forme: "SARL",
    capital: 8000,
    siege: "5 place Bellecour, 69002 Lyon",
    siren: "512345678",
    representant: "Madame Claire MERCIER",
    parts: 300,
  },
  {
    nature: "physique",
    civilite: "Madame",
    prenom: "Anne",
    nom: "ROUSSEL",
    parts: 200,
    neLe: "1980-11-02",
    neA: "Grenoble (Isère)",
    nationalite: "Française",
    adresse: "14 cours Gambetta, 69007 Lyon",
  },
];

function contexte(
  cessions: Record<string, unknown>[],
  valeurs: Record<string, string> = {},
  forme = "SAS"
): ContexteGabarit {
  return {
    societe: { ...SOCIETE, forme },
    assemblee: { date: "2026-09-15", totalParts: 1000, associes: ASSOCIES },
    codes: ["cession_parts"],
    valeurs,
    cessions,
  } as unknown as ContexteGabarit;
}

const VERS_UN_TIERS = [
  {
    cedant: 0,
    parts: 500,
    prix: 5000,
    date: "2026-09-15",
    vers: "tiers",
    nom: "Monsieur Julien BERNARD",
    nature: "physique",
    neLe: "1985-03-04",
    neA: "Lyon (Rhône)",
    nationalite: "Française",
    adresse: "3 rue des Lilas, 69003 Lyon",
  },
];

function rendre(
  cessions: Record<string, unknown>[],
  valeurs: Record<string, string> = {},
  forme = "SAS",
  rang = 0
): string {
  const dossier = contexte(cessions, valeurs, forme);
  expect(verifierLActeDeCession(dossier).filter((a) => a.gravite === "bloquant")).toEqual([]);
  const groupes = actesDeCession(dossier);
  return texteDu(rendreLActeDeCession(donneesDeLActeDeCession(dossier, groupes[rang])));
}

describe("le modèle lui-même", () => {
  it("ne contient aucune donnée des actes dont il est tiré", () => {
    /*
     * Les deux actes de référence portent des noms de sociétés, de personnes, des
     * sièges et des montants. Aucun ne doit avoir survécu dans le modèle : ce serait
     * une fuite de données d'un client vers un autre, dans un document qui part au
     * service des impôts.
     */
    const brut = readFileSync(
      path.join(process.cwd(), "..", "templates", MODELE_CESSION)
    );
    const texte = texteDu(brut);

    for (const trace of [
      "STERLING PEAK",
      "GREMLINS",
      "1CORP",
      "SAJDA",
      "MADFAI",
      "KLEICHE",
      "HOURI",
      "TRIADE",
      "MNH ENTERPRISES",
      "LT489",
      "N'DIAYE",
      "BELHADJ",
      "Meulan",
      "Le Havre",
      "Penthièvre",
      "Laugier",
      "899 979 934",
      "908 221 138",
      "101 581 148",
      "254 900",
      "253 900",
      "13 août 2026",
    ]) {
      expect(texte, "trace laissée par un acte réel : " + trace).not.toContain(trace);
    }
  });

  it("n'écrit aucun montant ni aucune unité en dur", () => {
    /*
     * « 1 euros » se lit dans un acte signé, et la cession à l'euro symbolique n'est
     * pas une hypothèse d'école : l'unité est une balise, pas du texte.
     */
    const texte = texteDu(
      readFileSync(path.join(process.cwd(), "..", "templates", MODELE_CESSION))
    );
    expect(texte).not.toContain(" euros");
    // Le symbole existe dans le modèle - « ({prix} €) » - mais jamais après un chiffre.
    expect(texte).not.toMatch(/\d\s*€/);
    /*
     * Aucun montant : un nombre groupé par milliers ne peut venir que d'un dossier.
     * Les seuls chiffres tolérés sont la numérotation des sous-articles et les
     * références légales - l'article 635 du code général des impôts.
     */
    expect(texte).not.toMatch(/\d[  ]\d{3}/);
    for (const nombre of texte.match(/\d+/g) ?? []) {
      expect(["1", "2", "3", "635"], "chiffre en dur : " + nombre).toContain(nombre);
    }
  });
});

describe("l'acte parle la langue de la forme sociale", () => {
  it("cède des actions dans une société par actions", () => {
    const texte = rendre(VERS_UN_TIERS, {}, "SAS");
    expect(texte).toContain("Contrat de cession d'actions");
    expect(texte).toContain("cinq cents (500) actions ordinaires");
    expect(texte).not.toContain("parts sociales");
  });

  it("cède des parts sociales dans une société à responsabilité limitée", () => {
    const texte = rendre(VERS_UN_TIERS, {}, "SARL");
    expect(texte).toContain("Contrat de cession de parts sociales");
    expect(texte).toContain("cinq cents (500) parts sociales ordinaires");
    expect(texte).not.toContain("actions ordinaires");
  });

  it("fonde l'agrément sur le texte de la forme", () => {
    expect(motsDeLaCession("SAS").fondementAgrement).toContain("L. 227-14");
    expect(motsDeLaCession("SARL").fondementAgrement).toContain("L. 223-14");
    expect(motsDeLaCession("SCI").titres).toBe("parts sociales");
  });
});

describe("plusieurs cédants dans un seul acte", () => {
  const DEUX_CEDANTS = [
    { cedant: 0, parts: 500, prix: 5000, date: "2026-09-15", vers: "tiers", nom: "HOLDING MERCIER", nature: "morale", forme: "SASU", capital: 100, siren: "889970943", villeRcs: "Lyon", adresse: "3 rue des Lilas, 69003 Lyon", representant: "son Président" },
    { cedant: 1, parts: 300, prix: 3000, date: "2026-09-15", vers: "tiers", nom: "HOLDING MERCIER", nature: "morale" },
  ];

  it("les groupe, et totalise le prix et les titres", () => {
    const texte = rendre(DEUX_CEDANTS);

    expect(texte).toContain("huit cents (800) actions");
    expect(texte).toContain("80 % du capital social");
    expect(texte).toContain("huit mille euros (8 000 €)");
    expect(texte).toContain("10 euros par action");
  });

  it("accorde les verbes au pluriel", () => {
    /*
     * « Les Cédants déclare » se lit dans un acte enregistré aux impôts, et rien dans
     * le document ne peut le prévenir : c'est la couche d'adaptation qui accorde.
     */
    const texte = rendre(DEUX_CEDANTS, {
      cessionGarantiePassif: "Oui",
      cessionDureeGarantie: "trois ans",
    });

    expect(texte).toContain("Les Cédants déclarent");
    expect(texte).toContain("pleins et entiers propriétaires");
    expect(texte).toContain("inscrites à leur nom");
    expect(texte).toContain("Les Cédants garantissent");
    expect(texte).toContain("s'engagent solidairement à garantir");
    expect(texte).not.toMatch(/Les Cédants (déclare|garantit|s'engage|s'interdit) /);
  });

  it("garde le singulier pour un cédant seul", () => {
    const texte = rendre(VERS_UN_TIERS);

    expect(texte).toContain("Le Cédant déclare");
    expect(texte).toContain("plein et entier propriétaire");
    expect(texte).toContain("inscrites à son nom");
    expect(texte).not.toContain("Les Cédants");
  });

  it("détaille la détention de chacun", () => {
    const texte = rendre(DEUX_CEDANTS);
    expect(texte).toContain("La détention se répartit comme suit :");
    expect(texte).toMatch(/a\)\t.*500 actions, soit 50 % du capital/);
    expect(texte).toMatch(/b\)\t.*300 actions, soit 30 % du capital/);
  });
});

describe("deux acquéreurs font deux actes", () => {
  const VERS_DEUX = [
    { cedant: 0, parts: 500, prix: 5000, date: "2026-09-15", vers: "tiers", nom: "PREMIER ACQUEREUR", nature: "morale" },
    { cedant: 1, parts: 300, prix: 3000, date: "2026-09-15", vers: "tiers", nom: "SECOND ACQUEREUR", nature: "morale" },
  ];

  it("ne mélange pas deux contrats", () => {
    /*
     * Deux acquéreurs ne sont pas parties l'un pour l'autre : les réunir dans un acte
     * viderait la clause de confidentialité de son sens, et ferait signer à chacun un
     * prix qui n'est pas le sien.
     */
    expect(actesDeCession(contexte(VERS_DEUX))).toHaveLength(2);

    const premier = rendre(VERS_DEUX, {}, "SAS", 0);
    expect(premier).toContain("PREMIER ACQUEREUR");
    expect(premier).not.toContain("SECOND ACQUEREUR");
    expect(premier).toContain("cinq mille euros (5 000 €)");

    const second = rendre(VERS_DEUX, {}, "SAS", 1);
    expect(second).toContain("SECOND ACQUEREUR");
    expect(second).not.toContain("PREMIER ACQUEREUR");
    expect(second).toContain("trois mille euros (3 000 €)");
  });
});

describe("l'identité des parties", () => {
  it("porte l'état civil d'un acquéreur personne physique", () => {
    const texte = rendre(VERS_UN_TIERS);
    expect(texte).toContain(
      "Monsieur Julien BERNARD, né le 4 mars 1985, à Lyon (Rhône), de nationalité française, demeurant 3 rue des Lilas, 69003 Lyon"
    );
  });

  it("porte l'immatriculation d'un acquéreur personne morale", () => {
    const texte = rendre([
      {
        cedant: 0, parts: 500, prix: 5000, date: "2026-09-15", vers: "tiers",
        nom: "HOLDING MERCIER", nature: "morale", forme: "SASU", capital: 100,
        siren: "889970943", villeRcs: "Lyon", adresse: "3 rue des Lilas, 69003 Lyon",
        representant: "son Président, Monsieur Paul MERCIER",
      },
    ]);
    expect(texte).toContain("HOLDING MERCIER, société par actions simplifiée unipersonnelle");
    expect(texte).toContain("au capital de 100 euros");
    expect(texte).toContain("sous le numéro 889 970 943");
    expect(texte).toContain("représentée par son Président, Monsieur Paul MERCIER");
  });

  it("ne laisse pas de virgule suspendue quand une mention manque", () => {
    // Un acte à trous se lit comme un brouillon : la mention absente disparaît.
    expect(identificationDuTiers({ nom: "Monsieur Paul DURAND", vers: "tiers" } as never)).toBe(
      "Monsieur Paul DURAND"
    );
  });

  it("fait intervenir les associés qui ne sont ni cédants ni acquéreurs", () => {
    const texte = rendre(VERS_UN_TIERS);
    expect(texte).toContain("Et, intervenant aux présentes :");
    /*
     * L'intervenant est identifié comme les autres parties.
     *
     * Il donne son agrément dans l'acte : il y est partie, et un acte présenté à
     * l'enregistrement ne connaît pas deux manières de nommer les gens.
     */
    expect(texte).toContain(
      "Madame Anne ROUSSEL, née le 2 novembre 1980, à Grenoble (Isère), de nationalité " +
        "française, demeurant 14 cours Gambetta, 69007 Lyon, en sa qualité d'autre actionnaire"
    );
    // Deux associés restent en dehors de la cession : le pluriel les désigne.
    expect(texte).toContain("les Associés Intervenants");
  });
});

describe("la garantie d'actif et de passif", () => {
  it("s'écrit en entier quand elle est consentie", () => {
    const texte = rendre(VERS_UN_TIERS, {
      cessionGarantiePassif: "Oui",
      cessionDureeGarantie: "cinq ans",
      cessionPlafondGarantie: "50 000 euros",
    });

    expect(texte).toContain("Garantie d'actif et de passif");
    expect(texte).toContain("consentie pour une durée de cinq ans");
    expect(texte).toContain("Elle est plafonnée à 50 000 euros.");
  });

  it("s'écarte expressément quand elle ne l'est pas", () => {
    /*
     * Le silence n'est pas neutre : il laisse les parties découvrir après coup
     * qu'aucune garantie n'a été stipulée. L'acte le dit, et dit pourquoi.
     */
    const texte = rendre(VERS_UN_TIERS, { cessionGarantiePassif: "Non" });

    expect(texte).toContain("Absence de garantie d'actif et de passif");
    expect(texte).toContain("aucune garantie d'actif et de passif n'est consentie");
    expect(texte).not.toContain("s'engage à garantir l'Acquéreur contre toute réclamation");
  });

  it("refuse une garantie sans durée", () => {
    const alertes = verifierLActeDeCession(
      contexte(VERS_UN_TIERS, { cessionGarantiePassif: "Oui" })
    );
    expect(alertes.map((a) => a.champ)).toContain("cessionDureeGarantie");
  });
});

describe("les contrôles avant de produire l'acte", () => {
  it("refuse un acquéreur sans nom", () => {
    const alertes = verifierLActeDeCession(
      contexte([{ cedant: 0, parts: 100, prix: 100, vers: "tiers", nom: "" }])
    );
    expect(alertes.map((a) => a.champ)).toContain("cession-0-nom");
  });

  it("refuse un dossier sans nombre total de titres", () => {
    /*
     * C'est lui qui donne le pourcentage cédé, et c'est cette mention que
     * l'administration fiscale regarde.
     */
    const sansTotal = {
      societe: SOCIETE,
      assemblee: { date: "2026-09-15", associes: [{ nature: "physique", nom: "DURAND" }] },
      codes: ["cession_parts"],
      valeurs: {},
      cessions: VERS_UN_TIERS,
    } as unknown as ContexteGabarit;

    expect(verifierLActeDeCession(sansTotal).map((a) => a.champ)).toContain(
      "assemblee-total-parts"
    );
  });

  it("laisse passer un dossier complet", () => {
    expect(verifierLActeDeCession(contexte(VERS_UN_TIERS))).toEqual([]);
  });
});

describe("les accords de l'acte", () => {
  /*
   * Le participe s'accorde avec la partie qu'il désigne. L'acte écrivait « Madame
   * Claire MARTIN, ci-après dénommé « le Cédant » » et « Monsieur Jean DUPONT,
   * ci-après désignée « l'Associé Intervenant » » : le premier figé au masculin, le
   * second au féminin. Un acte enregistré au service des impôts porte les deux fautes.
   */
  it("la cédante est dénommée, l'intervenant est désigné", () => {
    /* La cédante est l'associée n° 3 : Madame Anne ROUSSEL. */
    const texte = rendre([
      { cedant: 2, parts: 100, prix: 5000, date: "2026-03-01", vers: "tiers", nom: "Marc BERTIN" },
    ]);

    expect(texte).toContain("ci-après dénommée");
    expect(texte).toContain("ci-après désigné « l'Acquéreur »");
  });

  /* Une société qui acquiert se désigne au féminin : « la société X, désignée ». */
  it("une société acquéreuse est désignée au féminin", () => {
    const texte = rendre([
      {
        cedant: 0,
        parts: 100,
        prix: 5000,
        date: "2026-03-01",
        vers: "tiers",
        nature: "morale",
        nom: "HOLDING SUD",
        forme: "SAS",
        capital: 40000,
        siren: "842019336",
        villeRcs: "Lyon",
        representant: "Monsieur Luc GARNIER",
      },
    ]);

    expect(texte).toContain("ci-après désignée « l'Acquéreur »");
    expect(texte).toContain("ci-après dénommé « le Cédant »");
  });

  /*
   * L'origine de propriété s'enchaîne : « lesquelles {origine} et sont intégralement
   * libérées ». Un libellé de menu à la place du membre de phrase donnait « lesquelles
   * Acquisition auprès d'un tiers et sont intégralement libérées ».
   */
  it("l'origine de propriété se lit au fil de la phrase", () => {
    const texte = rendre([
      {
        cedant: 0,
        parts: 100,
        prix: 5000,
        date: "2026-03-01",
        vers: "tiers",
        nom: "Marc BERTIN",
        origine: "Acquisition auprès d'un tiers",
      },
    ]);

    expect(texte).toContain("lesquelles ont été acquises auprès d'un précédent titulaire et");
  });
});

describe("plusieurs cédants dans le même acte", () => {
  /*
   * Trois associés qui cèdent le même jour au même acquéreur signent un contrat : un
   * prix global, un enregistrement. Ce que l'acte doit alors mettre au pluriel, il le
   * met - sauf deux endroits, que seul ce cas révélait.
   */
  const troisCedants = [
    { cedant: 0, parts: 200, prix: 20000, date: "2026-03-01", vers: "tiers", nom: "HOLDING SUD",
      origine: "ont été souscrites lors de la constitution de la Société" },
    { cedant: 1, parts: 100, prix: 10000, date: "2026-03-01", vers: "tiers", nom: "HOLDING SUD",
      origine: "ont été acquises auprès d'un précédent titulaire" },
    { cedant: 2, parts: 100, prix: 10000, date: "2026-03-01", vers: "tiers", nom: "HOLDING SUD",
      origine: "ont été reçues par voie de transmission à titre gratuit" },
  ];

  /*
   * L'origine n'était celle que du premier : l'acte affirmait pour les trois que les
   * parts avaient été souscrites à la constitution. Deux déclarations fausses dans un
   * contrat qui se présente à l'enregistrement.
   */
  it("chaque cédant porte son origine quand elles diffèrent", () => {
    const texte = rendre(troisCedants);

    expect(texte).toContain("leur appartiennent dans les conditions détaillées ci-après");
    expect(texte).toContain("qui ont été souscrites lors de la constitution de la Société");
    expect(texte).toContain("qui ont été acquises auprès d'un précédent titulaire");
    expect(texte).toContain("qui ont été reçues par voie de transmission à titre gratuit");
  });

  /* Quand elles concordent, la phrase reste commune et la liste ne les répète pas. */
  it("une origine commune se dit une fois", () => {
    const texte = rendre(
      troisCedants.map((c) => ({ ...c, origine: "ont été acquises auprès d'un précédent titulaire" }))
    );

    expect(texte).toContain("lesquelles ont été acquises auprès d'un précédent titulaire et");
    expect(texte).not.toContain("qui ont été acquises");
  });

  /* Le prix se versait « au profit du cédant », seul, dans un acte qui en compte trois. */
  it("le prix se verse aux cédants", () => {
    expect(rendre(troisCedants)).toContain("par virement bancaire aux Cédants");
    expect(rendre([troisCedants[0]])).toContain("par virement bancaire au Cédant");
  });
});

describe("l'identité des parties", () => {
  /*
   * Le cédant se lisait « Monsieur Paul MERCIER », rien de plus, pendant que
   * l'acquéreur donnait ses date et lieu de naissance, sa nationalité et son domicile.
   * Deux registres dans le même paragraphe, dans un acte qui part au service des
   * impôts : l'état civil du cédant vient de l'associé, il est demandé à l'étape des
   * cessions, et il s'imprime là où l'acte nomme les parties.
   */
  it("nomme le cédant aussi complètement que l'acquéreur", () => {
    const texte = rendre(VERS_UN_TIERS);
    expect(texte).toContain(
      "Monsieur Paul MERCIER, né le 18 juin 1972, à Nantes (Loire-Atlantique), de " +
        "nationalité française, demeurant 7 rue Sainte-Catherine, 69001 Lyon"
    );
  });

  it("accorde le participe avec la civilité", () => {
    /* « Madame Anne ROUSSEL, né le » se lisait dans l'acte des trois cédants. */
    const texte = rendre([{ ...VERS_UN_TIERS[0], cedant: 2, parts: 200 }]);
    expect(texte).toContain("Madame Anne ROUSSEL, née le 2 novembre 1980");
    expect(texte).not.toContain("Madame Anne ROUSSEL, né le");
  });

  it("laisse une société se désigner par son immatriculation", () => {
    /* Une personne morale portait déjà son identité complète : rien ne change. */
    const texte = rendre([{ ...VERS_UN_TIERS[0], cedant: 1, parts: 300 }]);
    expect(texte).toContain(
      "la société MERCIER FRERES, société à responsabilité limitée au capital de 8 000 euros"
    );
  });

  it("réclame l'état civil d'un cédant qui n'en a pas", () => {
    /*
     * Le manque se répare à la case, non au moment de la relecture : chaque champ
     * absent porte son propre message, sous le champ qui l'attend.
     */
    const sansEtatCivil = {
      ...contexte(VERS_UN_TIERS),
      assemblee: {
        date: "2026-09-15",
        totalParts: 1000,
        associes: [{ nature: "physique", civilite: "Monsieur", prenom: "Paul", nom: "MERCIER", parts: 500 }],
      },
    } as unknown as ContexteGabarit;

    expect(verifierLActeDeCession(sansEtatCivil).map((a) => a.champ)).toEqual([
      "associe-0-ne-le",
      "associe-0-ne-a",
      "associe-0-nationalite",
      "associe-0-adresse",
    ]);
    expect(verifierLActeDeCession(sansEtatCivil)[0].message).toBe(
      "Indiquez la date de naissance de Paul MERCIER : l'acte identifie chaque partie."
    );
  });

  it("ne réclame rien deux fois au même cédant", () => {
    /* Céder deux fois ne fait pas deux personnes : un seul jeu de messages. */
    const deuxFois = {
      ...contexte([VERS_UN_TIERS[0], { ...VERS_UN_TIERS[0], parts: 100, nom: "HOLDING SUD" }]),
      assemblee: {
        date: "2026-09-15",
        totalParts: 1000,
        associes: [{ nature: "physique", civilite: "Monsieur", prenom: "Paul", nom: "MERCIER", parts: 500 }],
      },
    } as unknown as ContexteGabarit;

    expect(verifierLActeDeCession(deuxFois).filter((a) => a.champ.startsWith("associe-"))).toHaveLength(4);
  });
});
