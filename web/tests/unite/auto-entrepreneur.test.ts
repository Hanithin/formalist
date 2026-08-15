import { describe, it, expect } from "vitest";
import {
  ACTIVITES,
  regleActivite,
  regimeFiscalDe,
  ageA,
  verifierEtape,
  premiereEtapeIncomplete,
  coutVersementLiberatoire,
  depassePlafond,
  type Declaration,
  numeroSecuriteSocialeValide,
  piecesDeclaration,
} from "@/domain/auto-entrepreneur/declaration";

const MAINTENANT = new Date("2026-08-10T12:00:00Z");

const identite: Declaration = {
  civilite: "Madame",
  nomNaissance: "Durand",
  prenoms: "Camille",
  dateNaissance: "1990-04-12",
  villeNaissance: "Bordeaux",
  nationalite: "Française",
  numeroSecuriteSociale: "290043312345678",
};

const adresse: Declaration = {
  adresseVoie: "12 rue des Lilas",
  codePostal: "75011",
  ville: "Paris",
  situationMatrimoniale: "Célibataire",
};

const activite: Declaration = {
  natureActivite: "liberale",
  descriptionActivite: "Conseil en design",
  dateDebut: "2026-09-01",
  lieuExercice: "À mon domicile",
};

const complete: Declaration = {
  ...identite,
  ...adresse,
  ...activite,
  filiationMere: "Martin",
  filiationPere: "Durand",
  certifie: true,
};

describe("nature d'activité", () => {
  it("chaque nature a son régime, son plafond et son taux", () => {
    for (const regle of Object.values(ACTIVITES)) {
      expect(regle.plafond).toBeGreaterThan(0);
      expect(regle.tauxVersementLiberatoire).toBeGreaterThan(0);
    }
  });

  it("le régime fiscal découle de l'activité", () => {
    // Le formulaire d'origine le faisait choisir, ce qui permettait une activité
    // libérale au Micro-BIC - une combinaison qui n'existe pas.
    expect(regimeFiscalDe("liberale")).toBe("Micro-BNC");
    expect(regimeFiscalDe("commerciale")).toBe("Micro-BIC");
    expect(regimeFiscalDe("artisanale")).toBe("Micro-BIC");
  });

  it("une nature inconnue ne rend rien", () => {
    expect(regleActivite("agricole")).toBeNull();
    expect(regimeFiscalDe(null)).toBeNull();
  });
});

describe("âge", () => {
  it("se calcule à la date du jour", () => {
    expect(ageA("1990-04-12", MAINTENANT)).toBe(36);
  });

  it("un anniversaire à venir ne compte pas encore", () => {
    expect(ageA("1990-12-25", MAINTENANT)).toBe(35);
  });

  it("une date illisible ne rend rien", () => {
    expect(ageA("12/04/1990")).toBeNull();
    expect(ageA("")).toBeNull();
  });
});

describe("étape 1, identité", () => {
  it("accepte une identité complète", () => {
    expect(verifierEtape(1, identite, MAINTENANT)).toEqual([]);
  });

  it("refuse un mineur", () => {
    const anomalies = verifierEtape(1, { ...identite, dateNaissance: "2015-01-01" }, MAINTENANT);
    expect(anomalies[0].message).toContain("au moins 16 ans");
  });

  it("refuse une date de naissance absurde", () => {
    const anomalies = verifierEtape(1, { ...identite, dateNaissance: "1850-01-01" }, MAINTENANT);
    expect(anomalies[0].message).toContain("invalide");
  });
});

describe("étape 2, adresse", () => {
  it("n'exige l'adresse de l'entreprise que si elle diffère du domicile", () => {
    expect(verifierEtape(2, adresse, MAINTENANT)).toEqual([]);

    const distincte = { ...adresse, adresseEntrepriseDistincte: true };
    const champs = verifierEtape(2, distincte, MAINTENANT).map((a) => a.champ);
    expect(champs).toContain("entrepriseVoie");
  });

  it("le code postal suit la même règle qu'ailleurs", () => {
    const anomalies = verifierEtape(2, { ...adresse, codePostal: "750" }, MAINTENANT);
    expect(anomalies[0].message).toContain("cinq chiffres");
  });
});

describe("étape 6, déclaration", () => {
  it("exige la certification avant envoi", () => {
    const sansCertification = { ...complete, certifie: false };
    const anomalies = verifierEtape(6, sansCertification, MAINTENANT);
    expect(anomalies.some((a) => a.champ === "certifie")).toBe(true);
  });
});

describe("progression", () => {
  it("un formulaire vide bloque à la première étape", () => {
    expect(premiereEtapeIncomplete({}, MAINTENANT)).toBe(1);
  });

  it("l'identité renseignée fait avancer", () => {
    expect(premiereEtapeIncomplete(identite, MAINTENANT)).toBe(2);
  });

  it("une déclaration complète ne bloque plus", () => {
    expect(premiereEtapeIncomplete(complete, MAINTENANT)).toBeNull();
  });

  it("les options et les pièces ne bloquent jamais", () => {
    expect(verifierEtape(4, {}, MAINTENANT)).toEqual([]);
    expect(verifierEtape(5, {}, MAINTENANT)).toEqual([]);
  });
});

describe("versement libératoire", () => {
  it("se calcule au taux de l'activité", () => {
    // 2,2 % pour une activité libérale
    expect(coutVersementLiberatoire("liberale", 30_000)).toBe(660);
    expect(coutVersementLiberatoire("commerciale", 30_000)).toBe(300);
  });

  it("ne rend rien sans activité connue", () => {
    expect(coutVersementLiberatoire("agricole", 30_000)).toBeNull();
    expect(coutVersementLiberatoire("liberale", -100)).toBeNull();
  });
});

describe("plafond du régime", () => {
  it("signale un dépassement", () => {
    expect(depassePlafond("liberale", 80_000)).toBe(true);
    expect(depassePlafond("liberale", 70_000)).toBe(false);
  });

  it("le plafond du commerce est plus élevé", () => {
    expect(depassePlafond("commerciale", 100_000)).toBe(false);
    expect(depassePlafond("artisanale", 100_000)).toBe(true);
  });
});

describe("les champs que le guichet exige", () => {
  const complete = {
    civilite: "Madame",
    nomNaissance: "Durand",
    prenoms: "Camille",
    dateNaissance: "1985-04-12",
    villeNaissance: "Bordeaux",
    nationalite: "Française",
    numeroSecuriteSociale: "285043312345678",
  };

  it("le numéro de sécurité sociale est demandé, en quinze chiffres", () => {
    // C'est lui qui rattache l'auto-entreprise au régime social de la personne.
    expect(numeroSecuriteSocialeValide("2 85 04 33 123 456 78")).toBe(true);
    expect(numeroSecuriteSocialeValide("285043312345678")).toBe(true);
    expect(numeroSecuriteSocialeValide("28504331234")).toBe(false);
    expect(numeroSecuriteSocialeValide(undefined)).toBe(false);

    expect(verifierEtape(1, complete)).toHaveLength(0);
    expect(verifierEtape(1, { ...complete, numeroSecuriteSociale: "123" })).toHaveLength(1);
  });

  it("la ville de naissance est exigée", () => {
    // Elle figure sur l'acte de naissance et sur la déclaration.
    const manque = verifierEtape(1, { ...complete, villeNaissance: "" });
    expect(manque.map((a) => a.champ)).toContain("villeNaissance");
  });

  it("la situation matrimoniale est exigée", () => {
    /*
     * Sous un régime communautaire, les biens de l'entreprise engagent aussi le
     * conjoint : ce n'est pas une curiosité administrative.
     */
    const adresse = { adresseVoie: "12 rue des Lilas", codePostal: "33000", ville: "Bordeaux" };
    expect(verifierEtape(2, adresse).map((a) => a.champ)).toContain("situationMatrimoniale");
    expect(verifierEtape(2, { ...adresse, situationMatrimoniale: "Marié(e)" })).toHaveLength(0);
  });

  it("le lieu d'exercice est exigé", () => {
    const activite = {
      natureActivite: "liberale",
      descriptionActivite: "Conseil",
      dateDebut: "2026-09-01",
    };
    expect(verifierEtape(3, activite).map((a) => a.champ)).toContain("lieuExercice");
    expect(verifierEtape(3, { ...activite, lieuExercice: "À mon domicile" })).toHaveLength(0);
  });
});

describe("les pièces justificatives", () => {
  it("le recto et le verso sont deux pièces distinctes", () => {
    // On découvrait au dépôt qu'il fallait les deux, et le guichet refuse pour ça.
    const identifiants = piecesDeclaration({}).map((p) => p.identifiant);
    expect(identifiants).toEqual(["identite-recto", "identite-verso", "domicile"]);
  });

  it("une activité réglementée en demande une de plus", () => {
    const pieces = piecesDeclaration({ activiteReglementee: true });
    expect(pieces.map((p) => p.identifiant)).toContain("qualification");
    expect(pieces.find((p) => p.identifiant === "qualification")?.description).toContain("Diplôme");
  });

  it("chacune dit ce qu'on attend et sous quel format", () => {
    for (const piece of piecesDeclaration({ activiteReglementee: true })) {
      expect(piece.description.length).toBeGreaterThan(20);
      expect(piece.formats).toContain(".pdf");
    }
  });
});
