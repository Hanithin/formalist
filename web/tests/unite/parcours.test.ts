import { describe, it, expect } from "vitest";
import {
  ETAPES,
  verifierEtape,
  premiereEtapeIncomplete,
  etapeAccessible,
  avancementParcours,
  associesProposables,
  libellesDesAssocies,
  motAssocie,
  type Brouillon,
} from "@/domain/formalite/parcours";

/** Les sept étapes du parcours d'origine, les associés en deuxième. */
const societe: Brouillon = {
  forme: "SASU",
  denomination: "ATELIER MERIDIEN",
  activite: "Conseil en design",
  adresse: "12 rue des Lilas",
  codePostal: "75011",
  ville: "Paris",
  associes: [
    {
      type: "physique",
      personne: { prenom: "Camille", nom: "Durand", dateDeNaissance: "1990-04-12" },
      apport: 1000,
      parts: 100,
    },
  ],
};

/*
 * `capitalLibere` n'y figure pas, et c'est le sujet.
 *
 * Aucun écran ne l'écrit : le jeu d'essai le posait à la main, et masquait ainsi que
 * l'étape 4 lisait un champ toujours vide. Ce qui est libéré se compte sur les
 * associés, comme ici.
 */
const complet: Brouillon = {
  ...societe,
  dirigeants: [{ associe: 0 }],
  capital: 1000,
  partsTotales: 100,
  offre: "starter",
};

describe("le parcours suit les sept étapes d'origine", () => {
  it("les libellés courts sont ceux du fil d'étapes", () => {
    expect(ETAPES.map((e) => e.libelleCourt)).toEqual([
      "Société",
      "Associés",
      "Dirigeants",
      "Capital",
      "Documents",
      "Offres",
      "Mes documents",
    ]);
  });
});

describe("le mot qui désigne les porteurs de parts", () => {
  it("une société par actions a des actionnaires", () => {
    expect(motAssocie("SAS")).toBe("Actionnaire");
    expect(motAssocie("SASU")).toBe("Actionnaire");
    expect(motAssocie("SA")).toBe("Actionnaire");
  });

  it("les autres formes ont des associés", () => {
    expect(motAssocie("SARL")).toBe("Associé");
    expect(motAssocie("SCI")).toBe("Associé");
    expect(motAssocie(undefined)).toBe("Associé");
  });

  it("le pluriel n'apparaît qu'au deuxième", () => {
    expect(libellesDesAssocies("SARL", 1).libelleCourt).toBe("Associé");
    expect(libellesDesAssocies("SARL", 2).libelleCourt).toBe("Associés");
  });

  it("une forme unipersonnelle reste au singulier", () => {
    expect(libellesDesAssocies("SASU", 1).libelleCourt).toBe("Actionnaire");
    expect(libellesDesAssocies("SASU", 1).description).toContain("unique");
  });
});

describe("étape 1, la société", () => {
  it("un brouillon vide manque de tout", () => {
    const champs = verifierEtape(1, {}).map((a) => a.champ);
    expect(champs).toContain("forme");
    expect(champs).toContain("denomination");
  });

  it("les associés ne sont plus jugés ici : ils ont leur étape", () => {
    expect(verifierEtape(1, { ...societe, associes: [] })).toEqual([]);
  });

  it("complète, elle ne signale rien", () => {
    expect(verifierEtape(1, societe)).toEqual([]);
  });

  it("un code postal à quatre chiffres est refusé", () => {
    expect(verifierEtape(1, { ...societe, codePostal: "7501" })[0].champ).toBe("codePostal");
  });

  it("un nom fait d'espaces ne compte pas comme renseigné", () => {
    const champs = verifierEtape(1, { ...societe, denomination: "   " }).map((a) => a.champ);
    expect(champs).toContain("denomination");
  });

  it("une SASU refuse deux associés", () => {
    const champs = verifierEtape(2, {
      ...societe,
      associes: [...societe.associes!, { type: "physique", personne: { prenom: "B", nom: "B" } }],
    }).map((a) => a.champ);
    expect(champs).toContain("associes");
  });

  it("un porteur sans nom est signalé, avec son rang et le bon mot", () => {
    // La société d'essai est une SASU : on parle donc d'actionnaire.
    const anomalies = verifierEtape(2, {
      ...societe,
      associes: [{ type: "physique", personne: { prenom: "Camille" } }],
    });
    expect(anomalies.some((a) => a.message.includes("actionnaire 1"))).toBe(true);

    const sarl = verifierEtape(2, {
      ...societe,
      forme: "SARL",
      associes: [{ type: "physique", personne: { prenom: "Camille" } }],
    });
    expect(sarl.some((a) => a.message.includes("associé 1"))).toBe(true);
  });

  it("la date de naissance est exigée : le greffe la demande", () => {
    const anomalies = verifierEtape(2, {
      ...societe,
      associes: [{ type: "physique", personne: { prenom: "Camille", nom: "Durand" } }],
    });
    expect(anomalies.some((a) => a.champ.endsWith("dateDeNaissance"))).toBe(true);
  });

  it("un associé marié doit renseigner son conjoint", () => {
    const anomalies = verifierEtape(2, {
      ...societe,
      associes: [
        {
          type: "physique",
          personne: {
            prenom: "Camille",
            nom: "Durand",
            dateDeNaissance: "1990-04-12",
            situationMatrimoniale: "Marié(e)",
          },
        },
      ],
    });
    expect(anomalies.some((a) => a.champ.endsWith("conjoint"))).toBe(true);
  });

  it("un associé célibataire n'a pas de conjoint à renseigner", () => {
    expect(
      verifierEtape(2, {
        ...societe,
        associes: [
          {
            type: "physique",
            personne: {
              prenom: "Camille",
              nom: "Durand",
              dateDeNaissance: "1990-04-12",
              situationMatrimoniale: "Célibataire",
            },
          },
        ],
      })
    ).toEqual([]);
  });

  it("un associé personne morale est jugé sur sa dénomination", () => {
    const anomalies = verifierEtape(2, {
      ...societe,
      associes: [{ type: "morale", societe: {} }],
    });
    expect(anomalies.some((a) => a.message.includes("dénomination"))).toBe(true);
  });

  it("une banque « Autre » sans nom bloque l'attestation de dépôt", () => {
    const champs = verifierEtape(1, { ...societe, banque: "Autre" }).map((a) => a.champ);
    expect(champs).toContain("banqueAutre.nom");
  });

  it("une banque de la liste n'a rien à préciser", () => {
    expect(verifierEtape(1, { ...societe, banque: "Qonto" })).toEqual([]);
  });
});

describe("étape 3, les dirigeants", () => {
  it("le mot employé suit la forme juridique", () => {
    expect(verifierEtape(3, { forme: "SARL" })[0].message).toContain("gérant");
    expect(verifierEtape(3, { forme: "SASU" })[0].message).toContain("président");
  });

  it("un dirigeant repris d'un associé n'a pas d'état civil à saisir", () => {
    expect(verifierEtape(3, { ...societe, dirigeants: [{ associe: 0 }] })).toEqual([]);
  });

  it("un dirigeant qui désigne un associé retiré est signalé", () => {
    const anomalies = verifierEtape(3, { ...societe, dirigeants: [{ associe: 4 }] });
    expect(anomalies[0].message).toContain("n'existe plus");
  });

  it("une autre personne doit être nommée", () => {
    const anomalies = verifierEtape(3, { ...societe, dirigeants: [{ personne: {} }] });
    expect(anomalies[0].champ).toBe("dirigeants.0");
  });
});

describe("étape 4, le capital", () => {
  it("la répartition doit couvrir le capital", () => {
    // 50 parts sur 100 émises, à 20 € la part : 1 000 € souscrits sur 2 000 €.
    const anomalies = verifierEtape(4, {
      ...complet,
      capital: 2000,
      capitalLibere: 2000,
      partsTotales: 100,
      associes: [{ type: "physique", personne: { nom: "A" }, parts: 50 }],
    });
    expect(anomalies.some((a) => a.champ === "repartition")).toBe(true);
  });

  it("cohérente, elle passe", () => {
    expect(verifierEtape(4, complet)).toEqual([]);
  });

  it("les parts réparties doivent faire le total annoncé", () => {
    const anomalies = verifierEtape(4, { ...complet, partsTotales: 200 });
    expect(anomalies.some((a) => a.champ === "partsTotales")).toBe(true);
  });

  it("un versement ne peut pas dépasser ce qui est souscrit", () => {
    const anomalies = verifierEtape(4, {
      ...complet,
      associes: [{ ...complet.associes![0], versement: 5000 }],
    });
    expect(anomalies.some((a) => a.champ.endsWith("versement"))).toBe(true);
  });

  /*
   * Ce qui est libéré se compte sur les associés.
   *
   * `capitalLibere` n'est écrit par aucun écran : il valait zéro sur tous les dossiers,
   * et toute forme qui exige une libération minimale - la moitié pour une SAS, le
   * cinquième pour une SARL - restait bloquée par « exige de libérer au moins 50 % du
   * capital », sur un écran qui affichait pourtant « Versé 2 000 €, reste 0 € ». Le jeu
   * d'essai posait le champ à la main, et ne voyait donc rien.
   */
  it("le capital libéré se lit sur les associés, non dans un champ que rien ne remplit", () => {
    expect(verifierEtape(4, complet)).toEqual([]);
  });

  it("et il bloque quand la libération est réellement insuffisante", () => {
    // Une SASU libère au moins la moitié : 400 € versés sur 1 000 € ne suffisent pas.
    const anomalies = verifierEtape(4, {
      ...complet,
      associes: [{ ...complet.associes![0], versement: 400 }],
    });

    expect(anomalies.some((a) => a.champ === "libere")).toBe(true);
  });

  it("refuse une valeur nominale sous le centime", () => {
    /*
     * Trois mille milliards d'actions pour deux mille euros passaient l'étape : chacune
     * valait six dix-milliardièmes d'euro, un nombre que ni les statuts, ni la liste
     * des souscripteurs, ni l'attestation de dépôt ne peuvent porter. L'écran affichait
     * « à 0 € l'une », arrondi à six décimales.
     */
    const anomalies = verifierEtape(4, {
      ...complet,
      partsTotales: 3_000_000_000_000,
      associes: [{ ...complet.associes![0], parts: 3_000_000_000_000 }],
    });

    expect(anomalies.some((a) => a.message.includes("moins d'un centime"))).toBe(true);
  });

  it("laisse passer un centime tout rond", () => {
    // Cent mille parts pour mille euros : un centime l'une, et c'est écrivable.
    const anomalies = verifierEtape(4, {
      ...complet,
      partsTotales: 100_000,
      associes: [{ ...complet.associes![0], parts: 100_000 }],
    });

    expect(anomalies.some((a) => a.message.includes("centime"))).toBe(false);
  });

  it("un apport en nature compte comme libéré : il est fait le jour même", () => {
    const anomalies = verifierEtape(4, {
      ...complet,
      associes: [
        {
          ...complet.associes![0],
          versement: 0,
          apportEnNature: { description: "Matériel", montant: 1000 },
        },
      ],
    });

    expect(anomalies.some((a) => a.champ === "libere")).toBe(false);
  });
});

describe("étapes qui ne bloquent pas", () => {
  it("les pièces se vérifient à leur dépôt", () => {
    expect(verifierEtape(5, {})).toEqual([]);
  });

  it("les actes sont produits par le dossier, il n'y a rien à saisir", () => {
    expect(verifierEtape(7, {})).toEqual([]);
  });

  it("l'offre, elle, est exigée", () => {
    expect(verifierEtape(6, {})[0].champ).toBe("offre");
  });
});

describe("progression dans le parcours", () => {
  it("un brouillon vide bloque à la première étape", () => {
    expect(premiereEtapeIncomplete({})).toBe(1);
  });

  it("aucune étape vide ne se déclare complète", () => {
    // Sans forme juridique, les étapes des associés et du capital passaient à
    // travers les règles de forme et se disaient faites alors que rien n'était saisi.
    expect(verifierEtape(2, {}).length).toBeGreaterThan(0);
    expect(verifierEtape(4, {}).length).toBeGreaterThan(0);
  });

  it("la société renseignée fait avancer d'un cran", () => {
    expect(premiereEtapeIncomplete(societe)).toBe(3);
  });

  it("un brouillon complet ne bloque plus", () => {
    expect(premiereEtapeIncomplete(complet)).toBeNull();
  });

  it("on ne saute pas par-dessus une étape incomplète", () => {
    // Demander le capital sans dirigeant ramène à l'étape des dirigeants.
    expect(etapeAccessible(4, societe)).toBe(3);
  });

  it("revenir en arrière reste libre", () => {
    expect(etapeAccessible(1, societe)).toBe(1);
  });

  it("une étape hors bornes est ramenée dans le parcours", () => {
    expect(etapeAccessible(99, complet)).toBe(ETAPES.length);
    expect(etapeAccessible(-3, complet)).toBe(1);
  });

  it("un dossier vide est à zéro", () => {
    /*
     * Les pièces et les actes ne demandent rien à saisir : les compter au
     * dénominateur affichait « 29 % renseigné » sur un dossier où rien n'avait été
     * touché - un chiffre qui promet un travail déjà commencé.
     */
    expect(avancementParcours({})).toBe(0);
    expect(avancementParcours(complet)).toBe(100);
  });

  it("l'avancement progresse à chaque étape franchie", () => {
    const vide = avancementParcours({});
    const uneEtape = avancementParcours(societe);
    expect(uneEtape).toBeGreaterThan(vide);
    expect(uneEtape).toBeLessThan(100);
  });
});

describe("les associés qu'un dirigeant peut reprendre", () => {
  const deux = [
    { type: "physique" as const, personne: { prenom: "Camille", nom: "Durand" } },
    { type: "physique" as const, personne: { prenom: "Paul", nom: "Martin" } },
  ];

  it("tous, quand aucun n'est encore désigné", () => {
    expect(associesProposables(deux, [{ personne: {} }], 0).map((a) => a.nom)).toEqual([
      "Camille Durand",
      "Paul Martin",
    ]);
  });

  it("un associé déjà désigné par un autre dirigeant est écarté", () => {
    // La même personne ne peut pas être à la fois présidente et directrice générale.
    const dirigeants = [{ associe: 0 }, { personne: {} }];
    expect(associesProposables(deux, dirigeants, 1).map((a) => a.nom)).toEqual(["Paul Martin"]);
  });

  it("le choix du dirigeant courant reste dans sa propre liste", () => {
    const dirigeants = [{ associe: 0 }, { associe: 1 }];
    expect(associesProposables(deux, dirigeants, 0).map((a) => a.rang)).toEqual([0]);
  });

  it("un associé sans nom est désigné par son rang", () => {
    expect(associesProposables([{ type: "physique", personne: {} }], [], 0)[0].nom).toBe(
      "Associé 1"
    );
  });

  it("une société associée est désignée par sa dénomination", () => {
    const morale = [{ type: "morale" as const, societe: { denomination: "HOLDING KERN" } }];
    expect(associesProposables(morale, [], 0)[0].nom).toBe("HOLDING KERN");
  });
});

describe("le capital se répartit en parts, pas en euros saisis", () => {
  /**
   * L'écran de répartition saisit un nombre de parts ; le montant souscrit s'en
   * déduit. La vérification lisait un champ « apport » que cet écran ne remplit
   * pas : l'étape était alors impossible à franchir, quoi qu'on saisisse.
   */
  const parParts: Brouillon = {
    ...societe,
    capital: 1000,
    capitalLibere: 1000,
    partsTotales: 100,
    associes: [
      {
        type: "physique",
        personne: { prenom: "Camille", nom: "Durand", dateDeNaissance: "1990-04-12" },
        parts: 100,
        versement: 1000,
      },
    ],
  };

  it("des parts qui couvrent le capital suffisent", () => {
    expect(verifierEtape(4, parParts)).toEqual([]);
  });

  it("des parts qui ne le couvrent pas sont signalées", () => {
    const anomalies = verifierEtape(4, {
      ...parParts,
      partsTotales: 200,
      associes: [{ ...parParts.associes![0], parts: 100 }],
    });
    expect(anomalies.some((a) => a.champ === "repartition" || a.champ === "partsTotales")).toBe(
      true
    );
  });

  it("un apport en nature compte dans le souscrit", () => {
    expect(
      verifierEtape(4, {
        ...parParts,
        associes: [
          {
            ...parParts.associes![0],
            versement: 700,
            apportEnNature: { montant: 300, description: "Matériel" },
          },
        ],
      })
    ).toEqual([]);
  });
});
