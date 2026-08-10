import { describe, it, expect } from "vitest";
import { nombreEnFrancais, dateEnFrancais } from "@/domain/formalite/lettres";
import {
  donneesDeGabarit,
  nomDeJeuneFille,
  personneDuDirigeant,
} from "@/domain/formalite/gabarit";
import { apportsDe, valeurNominale } from "@/domain/formalite/capital";
import type { Brouillon } from "@/domain/formalite/parcours";

describe("montants en toutes lettres", () => {
  it("les cas simples", () => {
    expect(nombreEnFrancais(0)).toBe("zéro");
    expect(nombreEnFrancais(1)).toBe("un");
    expect(nombreEnFrancais(1000)).toBe("mille");
  });

  it("les accords qui piègent", () => {
    // « quatre-vingts » prend son s seul, pas suivi d'une unité.
    expect(nombreEnFrancais(80)).toBe("quatre-vingts");
    expect(nombreEnFrancais(81)).toBe("quatre-vingt-un");
    expect(nombreEnFrancais(71)).toBe("soixante et onze");
    expect(nombreEnFrancais(21)).toBe("vingt et un");
    // « cents » s'accorde quand rien ne suit.
    expect(nombreEnFrancais(200)).toBe("deux cents");
    expect(nombreEnFrancais(201)).toBe("deux cent un");
  });

  it("un capital courant", () => {
    expect(nombreEnFrancais(1500)).toBe("mille cinq cents");
    expect(nombreEnFrancais(10000)).toBe("dix mille");
  });

  it("les centimes", () => {
    expect(nombreEnFrancais(1.5)).toBe("un et cinquante centimes");
    expect(nombreEnFrancais(0.01)).toBe("un");
  });

  it("un montant illisible ne rend rien plutôt qu'un mot faux", () => {
    expect(nombreEnFrancais(-5)).toBe("");
    expect(nombreEnFrancais(Number.NaN)).toBe("");
  });
});

describe("dates en français", () => {
  it("une date ISO devient lisible", () => {
    expect(dateEnFrancais("2026-08-10")).toBe("10 août 2026");
    expect(dateEnFrancais("1990-01-01")).toBe("1 janvier 1990");
  });

  it("une entrée absente ou illisible passe sans casser l'acte", () => {
    expect(dateEnFrancais(null)).toBe("-");
    expect(dateEnFrancais("")).toBe("-");
    expect(dateEnFrancais("bientôt")).toBe("bientôt");
  });
});

describe("nom de jeune fille, déduit du nom de la mère", () => {
  it("le mot en capitales est retenu", () => {
    expect(nomDeJeuneFille("Marie DUPONT")).toBe("DUPONT");
    expect(nomDeJeuneFille("Anne-Marie DE LA TOUR")).toBe("TOUR");
  });

  it("sans capitales, le dernier mot est mis en capitales", () => {
    expect(nomDeJeuneFille("Marie Dupont")).toBe("DUPONT");
  });

  it("absent, il vaut un tiret et non un blanc", () => {
    expect(nomDeJeuneFille(undefined)).toBe("-");
    expect(nomDeJeuneFille("   ")).toBe("-");
  });
});

describe("valeur nominale et apports", () => {
  it("la valeur d'une part se déduit du capital et du nombre de parts", () => {
    expect(valeurNominale({ capital: 1000, partsTotales: 100 })).toBe(10);
  });

  it("sans parts émises, elle vaut zéro plutôt qu'une division impossible", () => {
    expect(valeurNominale({ capital: 1000 })).toBe(0);
    expect(valeurNominale({ capital: 1000, partsTotales: 0 })).toBe(0);
  });

  it("un apport en nature est libéré d'emblée", () => {
    const apports = apportsDe(
      { parts: 100, apportEnNature: { montant: 400 }, versement: 600 },
      10
    );
    expect(apports.souscrit).toBe(1000);
    expect(apports.numeraire).toBe(600);
    expect(apports.verse).toBe(1000);
    expect(apports.reste).toBe(0);
    expect(apports.pourcentageLibere).toBe(100);
  });

  it("une libération partielle laisse un reste à verser", () => {
    const apports = apportsDe({ parts: 100, versement: 250 }, 10);
    expect(apports.souscrit).toBe(1000);
    expect(apports.verse).toBe(250);
    expect(apports.reste).toBe(750);
    expect(apports.pourcentageLibere).toBe(25);
  });

  it("sans nombre de parts, le montant saisi fait foi", () => {
    expect(apportsDe({ apport: 500 }, 0).souscrit).toBe(500);
  });
});

describe("le dirigeant repris d'un associé", () => {
  const associes = [
    { type: "physique" as const, personne: { prenom: "Camille", nom: "Durand" } },
  ];

  it("emprunte son état civil à l'associé désigné", () => {
    expect(personneDuDirigeant({ associe: 0 }, associes).nom).toBe("Durand");
  });

  it("garde le sien quand il est une autre personne", () => {
    expect(personneDuDirigeant({ personne: { nom: "Martin" } }, associes).nom).toBe("Martin");
  });
});

describe("les champs remis aux gabarits Word", () => {
  const brouillon: Brouillon = {
    forme: "SAS",
    denomination: "ATELIER MERIDIEN",
    activite: "Conseil en design",
    adresse: "12 rue des Lilas",
    codePostal: "75011",
    ville: "Paris",
    capital: 1000,
    partsTotales: 100,
    banque: "Qonto",
    associes: [
      {
        type: "physique",
        personne: {
          civilite: "Madame",
          prenom: "Camille",
          nom: "Durand",
          dateDeNaissance: "1990-04-12",
          villeDeNaissance: "Lyon",
          nomDeLaMere: "Anne MARTIN",
          situationMatrimoniale: "Marié(e)",
          conjoint: { prenom: "Paul", nom: "Durand", regimeMatrimonial: "Séparation de biens" },
        },
        parts: 100,
        versement: 1000,
      },
    ],
    dirigeants: [{ associe: 0, remuneration: "Fixe" }],
  };

  const donnees = donneesDeGabarit(brouillon);

  it("la société et son capital, en chiffres et en lettres", () => {
    expect(donnees.SOCIETE_NOM).toBe("ATELIER MERIDIEN");
    expect(donnees.CAPITAL_LETTRES).toBe("mille");
    expect(donnees.VALEUR_NOMINALE).toBe("10");
  });

  it("les champs indexés portent le rang de l'associé", () => {
    expect(donnees.HAS_ASSOC_1).toBe(true);
    expect(donnees.ASSOCIE_1).toBe("Madame Camille Durand");
    expect(donnees.DATE_NAISSANCE_1).toBe("12 avril 1990");
    expect(donnees.NOM_JEUNE_FILLE_1).toBe("MARTIN");
    expect(donnees.MONTANT_SOUSCRIT_1).toBe("1 000");
    expect(donnees.PCT_DETENTION_1).toBe("100");
  });

  it("les rangs libres sont explicitement faux, pour que le gabarit s'arrête", () => {
    expect(donnees.HAS_ASSOC_2).toBe(false);
    expect(donnees.HAS_ASSOC_10).toBe(false);
  });

  it("les parts sont numérotées en continu", () => {
    expect(donnees.PARTS_DE_1).toBe("1");
    expect(donnees.PARTS_A_1).toBe("100");
  });

  it("le conjoint et son régime figurent dans l'acte", () => {
    expect(donnees.CONJOINT_PRENOM_1).toBe("Paul");
    expect(donnees.CONJOINT_NOM_1).toBe("Durand");
    expect(donnees.REGIME_MATRIMONIAL_1).toBe("Séparation de biens");
  });

  it("le dirigeant reprend l'état civil de l'associé désigné", () => {
    expect(donnees.GERANT_CIVILITE_NOM_PRENOM).toBe("Madame Camille Durand");
    expect(donnees.GERANT_EST_FEMME).toBe(true);
    expect(donnees.GERANT_LIEU_NAISSANCE).toBe("Lyon");
    expect(donnees.REMUNERATION_DG).toBe("Fixe");
  });

  it("la situation matrimoniale tombe au milieu d'une phrase, donc en minuscules", () => {
    expect(donnees.SITUATION_MATRIMONIALE_1).toBe("marié(e)");
  });

  it("un champ vide s'écrit « - » : dans un acte, un blanc se lit comme un oubli", () => {
    const vide = donneesDeGabarit({});
    expect(vide.SOCIETE_NOM).toBe("-");
    expect(vide.NATIONALITE).toBe("Française");
    expect(vide.SITUATION_MATRIMONIALE).toBe("célibataire");
  });

  it("la liste ASSOCIES double les champs indexés, pour les gabarits qui bouclent", () => {
    const liste = donnees.ASSOCIES as Record<string, unknown>[];
    expect(liste).toHaveLength(1);
    expect(liste[0].CIVILITE_NOM_PRENOM).toBe("Madame Camille Durand");
    expect(liste[0].MONTANT_VERSE).toBe("1 000");
  });

  it("les totaux se cumulent sur les associés", () => {
    expect(donnees.TOTAL_VERSE).toBe("1 000");
    expect(donnees.TOTAL_RESTE).toBe("0");
  });

  it("au-delà de dix associés, seuls les dix premiers sont écrits", () => {
    const onze = Array.from({ length: 11 }, (_, i) => ({
      type: "physique" as const,
      personne: { nom: "N" + i },
      parts: 10,
    }));
    const beaucoup = donneesDeGabarit({ ...brouillon, associes: onze, partsTotales: 110 });
    expect(beaucoup.HAS_ASSOC_10).toBe(true);
    expect((beaucoup.ASSOCIES as unknown[]).length).toBe(10);
  });
});
