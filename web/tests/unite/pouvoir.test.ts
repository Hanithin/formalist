import { describe, it, expect } from "vitest";
import {
  MANDATAIRE,
  donneesDuPouvoir,
  etatCivil,
  etatCivilDuMandataire,
  nommer,
  OBJETS,
} from "@/domain/formalite/mandataire";

/**
 * Le pouvoir donné au cabinet.
 *
 * Le guichet unique laisse un tiers déposer pour le compte d'une société, à condition
 * qu'un pouvoir le nomme. Ce que ce document doit porter n'est pas décoratif : un
 * mandataire identifié comme le ferait un notaire, une formalité bornée, et le nom de
 * celui qui donne le pouvoir sous sa signature.
 */
describe("l'identité du mandataire", () => {
  it("nomme Monsieur MADFAI avec son état civil", () => {
    const phrase = etatCivilDuMandataire();
    expect(phrase).toContain("Monsieur Hani MADFAI");
    /* Le pouvoir nomme une personne, non un avocat exerçant son ministère. */
    expect(phrase).not.toContain("Maître");
    expect(phrase).toContain("né le 12 avril 1985 à Tournon (07300)");
    expect(phrase).toContain("de nationalité française");
    expect(phrase).toContain("demeurant 34 rue Laugier à Paris (75017)");
  });

  it("ne change pas selon le dossier", () => {
    expect(MANDATAIRE.nom).toBe("MADFAI");
    expect(etatCivilDuMandataire()).toBe(etatCivil(MANDATAIRE));
  });
});

describe("l'état civil d'un mandant", () => {
  it("accorde « né » à la civilité", () => {
    expect(etatCivil({ civilite: "Madame", prenom: "Claire", nom: "MARTIN" })).toContain("née le");
    expect(etatCivil({ civilite: "Monsieur", prenom: "Jean", nom: "DUPONT" })).toContain("né le");
  });

  /* Un champ vide laisse le tiret des actes : le trou doit se voir sur le document. */
  it("laisse voir ce qui manque", () => {
    expect(etatCivil({ civilite: "Monsieur", prenom: "Jean", nom: "DUPONT" })).toContain(
      "né le - à -"
    );
  });

  it("suppose la nationalité française, comme les autres actes", () => {
    expect(etatCivil({ civilite: "Monsieur", nom: "DUPONT" })).toContain(
      "de nationalité française"
    );
    expect(etatCivil({ civilite: "Monsieur", nom: "DUPONT", nationalite: "belge" })).toContain(
      "de nationalité belge"
    );
  });

  it("nomme sans état civil pour la ligne de signature", () => {
    expect(nommer({ civilite: "Monsieur", prenom: "Mike", nom: "YAMDJEU" })).toBe(
      "Monsieur Mike YAMDJEU"
    );
  });
});

describe("les balises du gabarit", () => {
  const contexte = {
    mandant: { identite: "Monsieur Mike YAMDJEU, né le 18 mai 1983", nom: "Monsieur Mike YAMDJEU" },
    qualite: "gérant",
    objet: "modification" as const,
    societe: {
      denomination: "YFC",
      formeEtCapital: "SCI au capital de 2 000 euros",
      siege: "16 bis rue d'Odessa, 75014 Paris",
    },
    ville: "Paris",
    date: "2026-04-01",
  };

  it("portent le mandant, sa qualité et sa société", () => {
    const d = donneesDuPouvoir(contexte);
    expect(d.POUVOIR_MANDANT).toContain("YAMDJEU");
    expect(d.POUVOIR_QUALITE).toBe("gérant");
    expect(d.POUVOIR_SOCIETE).toBe("YFC");
    expect(d.POUVOIR_SOCIETE_FORME).toBe("SCI au capital de 2 000 euros");
  });

  /*
   * Le libellé du siège est dans les données, non dans le gabarit : une création écrit
   * « Siège social envisagé », la société n'existant pas encore.
   */
  it("écrivent la ligne du siège", () => {
    expect(donneesDuPouvoir(contexte).POUVOIR_SOCIETE_SIEGE).toBe(
      "Siège social : 16 bis rue d'Odessa, 75014 Paris"
    );
    expect(
      donneesDuPouvoir({
        ...contexte,
        societe: { ...contexte.societe, siegeEnvisage: true },
      }).POUVOIR_SOCIETE_SIEGE
    ).toBe("Siège social envisagé : 16 bis rue d'Odessa, 75014 Paris");
  });

  /*
   * L'immatriculation ne paraît que si la société l'est : un en-tête de création ne
   * montre pas un registre avec un tiret à la place du numéro.
   */
  it("taisent l'immatriculation d'une société qui n'en a pas", () => {
    expect(donneesDuPouvoir(contexte).POUVOIR_SOCIETE_IMMATRICULEE).toBe(false);
    expect(donneesDuPouvoir(contexte).POUVOIR_SOCIETE_RCS).toBe("");

    const immatriculee = donneesDuPouvoir({
      ...contexte,
      societe: { ...contexte.societe, greffe: "Paris", siren: "908 221 138" },
    });
    expect(immatriculee.POUVOIR_SOCIETE_IMMATRICULEE).toBe(true);
    /* Abrégée : en toutes lettres, la ligne ne tient pas dans un en-tête centré. */
    expect(immatriculee.POUVOIR_SOCIETE_RCS).toBe(
      "Immatriculée au RCS de Paris sous le numéro 908 221 138"
    );
  });

  it("bornent le pouvoir à une formalité", () => {
    expect(donneesDuPouvoir({ ...contexte, objet: "creation" }).POUVOIR_OBJET).toBe("la création");
    expect(donneesDuPouvoir({ ...contexte, objet: "modification" }).POUVOIR_OBJET).toBe(
      "la modification"
    );
    expect(donneesDuPouvoir({ ...contexte, objet: "fermeture" }).POUVOIR_OBJET).toBe(
      OBJETS.fermeture
    );
  });

  it("datent en toutes lettres", () => {
    expect(donneesDuPouvoir(contexte).POUVOIR_DATE).toBe("1er avril 2026");
  });
});
