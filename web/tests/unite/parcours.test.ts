import { describe, it, expect } from "vitest";
import {
  ETAPES,
  verifierEtape,
  premiereEtapeIncomplete,
  etapeAccessible,
  avancementParcours,
  associesProposables,
  type Brouillon,
} from "@/domain/formalite/parcours";

/** Les six étapes du parcours d'origine : les associés sont dans la première. */
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

const complet: Brouillon = {
  ...societe,
  dirigeants: [{ associe: 0 }],
  capital: 1000,
  capitalLibere: 1000,
  partsTotales: 100,
  offre: "starter",
};

describe("le parcours suit les six étapes d'origine", () => {
  it("les libellés courts sont ceux du fil d'étapes", () => {
    expect(ETAPES.map((e) => e.libelleCourt)).toEqual([
      "Société",
      "Dirigeants",
      "Capital",
      "Documents",
      "Offres",
      "Mes documents",
    ]);
  });
});

describe("étape 1, la société et ses associés", () => {
  it("un brouillon vide manque de tout", () => {
    const champs = verifierEtape(1, {}).map((a) => a.champ);
    expect(champs).toContain("forme");
    expect(champs).toContain("denomination");
    expect(champs).toContain("associes");
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
    const champs = verifierEtape(1, {
      ...societe,
      associes: [...societe.associes!, { type: "physique", personne: { prenom: "B", nom: "B" } }],
    }).map((a) => a.champ);
    expect(champs).toContain("associes");
  });

  it("un associé sans nom est signalé, avec son rang", () => {
    const anomalies = verifierEtape(1, {
      ...societe,
      associes: [{ type: "physique", personne: { prenom: "Camille" } }],
    });
    expect(anomalies.some((a) => a.message.includes("associé 1"))).toBe(true);
  });

  it("la date de naissance est exigée : le greffe la demande", () => {
    const anomalies = verifierEtape(1, {
      ...societe,
      associes: [{ type: "physique", personne: { prenom: "Camille", nom: "Durand" } }],
    });
    expect(anomalies.some((a) => a.champ.endsWith("dateDeNaissance"))).toBe(true);
  });

  it("un associé marié doit renseigner son conjoint", () => {
    const anomalies = verifierEtape(1, {
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
      verifierEtape(1, {
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
    const anomalies = verifierEtape(1, {
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

describe("étape 2, les dirigeants", () => {
  it("le mot employé suit la forme juridique", () => {
    expect(verifierEtape(2, { forme: "SARL" })[0].message).toContain("gérant");
    expect(verifierEtape(2, { forme: "SASU" })[0].message).toContain("président");
  });

  it("un dirigeant repris d'un associé n'a pas d'état civil à saisir", () => {
    expect(verifierEtape(2, { ...societe, dirigeants: [{ associe: 0 }] })).toEqual([]);
  });

  it("un dirigeant qui désigne un associé retiré est signalé", () => {
    const anomalies = verifierEtape(2, { ...societe, dirigeants: [{ associe: 4 }] });
    expect(anomalies[0].message).toContain("n'existe plus");
  });

  it("une autre personne doit être nommée", () => {
    const anomalies = verifierEtape(2, { ...societe, dirigeants: [{ personne: {} }] });
    expect(anomalies[0].champ).toBe("dirigeants.0");
  });
});

describe("étape 3, le capital", () => {
  it("la répartition doit couvrir le capital", () => {
    // 50 parts sur 100 émises, à 20 € la part : 1 000 € souscrits sur 2 000 €.
    const anomalies = verifierEtape(3, {
      ...complet,
      capital: 2000,
      capitalLibere: 2000,
      partsTotales: 100,
      associes: [{ type: "physique", personne: { nom: "A" }, parts: 50 }],
    });
    expect(anomalies.some((a) => a.champ === "repartition")).toBe(true);
  });

  it("cohérente, elle passe", () => {
    expect(verifierEtape(3, complet)).toEqual([]);
  });

  it("les parts réparties doivent faire le total annoncé", () => {
    const anomalies = verifierEtape(3, { ...complet, partsTotales: 200 });
    expect(anomalies.some((a) => a.champ === "partsTotales")).toBe(true);
  });

  it("un versement ne peut pas dépasser ce qui est souscrit", () => {
    const anomalies = verifierEtape(3, {
      ...complet,
      associes: [{ ...complet.associes![0], versement: 5000 }],
    });
    expect(anomalies.some((a) => a.champ.endsWith("versement"))).toBe(true);
  });
});

describe("étapes qui ne bloquent pas", () => {
  it("les pièces se vérifient à leur dépôt", () => {
    expect(verifierEtape(4, {})).toEqual([]);
  });

  it("les actes sont produits par le dossier, il n'y a rien à saisir", () => {
    expect(verifierEtape(6, {})).toEqual([]);
  });

  it("l'offre, elle, est exigée", () => {
    expect(verifierEtape(5, {})[0].champ).toBe("offre");
  });
});

describe("progression dans le parcours", () => {
  it("un brouillon vide bloque à la première étape", () => {
    expect(premiereEtapeIncomplete({})).toBe(1);
  });

  it("aucune étape vide ne se déclare complète", () => {
    // Sans forme juridique, les étapes des associés et du capital passaient à
    // travers les règles de forme et se disaient faites alors que rien n'était saisi.
    expect(verifierEtape(1, {}).length).toBeGreaterThan(0);
    expect(verifierEtape(3, {}).length).toBeGreaterThan(0);
  });

  it("la société renseignée fait avancer d'un cran", () => {
    expect(premiereEtapeIncomplete(societe)).toBe(2);
  });

  it("un brouillon complet ne bloque plus", () => {
    expect(premiereEtapeIncomplete(complet)).toBeNull();
  });

  it("on ne saute pas par-dessus une étape incomplète", () => {
    // Demander le capital sans dirigeant ramène à l'étape des dirigeants.
    expect(etapeAccessible(3, societe)).toBe(2);
  });

  it("revenir en arrière reste libre", () => {
    expect(etapeAccessible(1, societe)).toBe(1);
  });

  it("une étape hors bornes est ramenée dans le parcours", () => {
    expect(etapeAccessible(99, complet)).toBe(ETAPES.length);
    expect(etapeAccessible(-3, complet)).toBe(1);
  });

  it("l'avancement se compte en étapes complètes", () => {
    // Sur un brouillon vide, seules les pièces et les actes ne bloquent pas.
    expect(avancementParcours({})).toBe(33);
    expect(avancementParcours(complet)).toBe(100);
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
    expect(verifierEtape(3, parParts)).toEqual([]);
  });

  it("des parts qui ne le couvrent pas sont signalées", () => {
    const anomalies = verifierEtape(3, {
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
      verifierEtape(3, {
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
