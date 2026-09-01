import { describe, it, expect } from "vitest";
import { adresseFrancaise, contenuDeLaCreation } from "@/domain/guichet/creation";
import { codeSituationMatrimoniale, FORME_JURIDIQUE } from "@/domain/guichet/nomenclatures";
import type { Brouillon } from "@/domain/formalite/parcours";

/**
 * La traduction du brouillon vers le contenu attendu par le guichet unique.
 *
 * Deux modèles qui ne se ressemblent pas : quarante champs d'un côté, plusieurs
 * centaines de l'autre. La traduction est donc incomplète par nature, et c'est la
 * liste des manques qui compte autant que le contenu - elle dit ce qu'il reste à
 * demander, et elle vient du code qui traduit plutôt que d'un document qui dériverait.
 */
const BROUILLON: Brouillon = {
  forme: "SAS",
  denomination: "ATELIER MERIDIEN",
  activite: "la conception et la vente de mobilier contemporain",
  adresse: "12 rue Vauban",
  codePostal: "69006",
  ville: "Lyon",
  capital: 20000,
  partsTotales: 2000,
  dureeDeVie: 99,
  dateDebutActivite: "2026-09-15",
  dateCloturePremierExercice: "2027-12-31",
  banque: "Qonto",
  associes: [
    {
      type: "physique",
      parts: 1400,
      personne: {
        civilite: "Monsieur",
        prenom: "Jean",
        nom: "Dupont",
        dateDeNaissance: "1980-04-12",
        villeDeNaissance: "Lyon",
        situationMatrimoniale: "Marié(e)",
        adresse: "5 rue de la Paix",
        codePostal: "69001",
        ville: "Lyon",
      },
    },
    {
      type: "physique",
      parts: 600,
      personne: { civilite: "Madame", prenom: "Claire", nom: "Martin" },
    },
  ],
  dirigeants: [{ associe: 0 }],
};

describe("les nomenclatures", () => {
  /* Une SASU est une SAS à associé unique : le registre ne les distingue pas. */
  it("donnent le même code à une forme et à sa version unipersonnelle", () => {
    expect(FORME_JURIDIQUE.SAS).toBe("5710");
    expect(FORME_JURIDIQUE.SASU).toBe("5710");
    expect(FORME_JURIDIQUE.SARL).toBe("5499");
    expect(FORME_JURIDIQUE.EURL).toBe("5499");
    expect(FORME_JURIDIQUE.SCI).toBe("6540");
  });

  it("codent la situation matrimoniale telle que le formulaire l'écrit", () => {
    expect(codeSituationMatrimoniale("Célibataire")).toBe("1");
    expect(codeSituationMatrimoniale("Marié(e)")).toBe("4");
    expect(codeSituationMatrimoniale("Pacsé(e)")).toBe("5");
  });

  /*
   * Rien plutôt qu'un repli : « célibataire » par défaut ferait déclarer célibataire
   * une personne mariée, et un champ faux ne se voit pas là où un champ absent se
   * signale.
   */
  it("ne devinent pas une situation qu'on ne leur a pas dite", () => {
    expect(codeSituationMatrimoniale("")).toBeNull();
    expect(codeSituationMatrimoniale(undefined)).toBeNull();
    expect(codeSituationMatrimoniale("en concubinage")).toBeNull();
  });
});

describe("l'adresse", () => {
  it("sépare le numéro de la voie quand il est certain", () => {
    expect(adresseFrancaise("12 rue Vauban", "69006", "Lyon")).toEqual({
      codePays: "FRA",
      codePostal: "69006",
      commune: "Lyon",
      numVoie: "12",
      voie: "rue Vauban",
    });
  });

  /* Le type de voie se code contre deux cent trente entrées : on ne le devine pas. */
  it("laisse la ligne entière quand elle ne commence pas par un numéro", () => {
    expect(adresseFrancaise("Lieu-dit Le Colombier", "69006", "Lyon")).toMatchObject({
      voie: "Lieu-dit Le Colombier",
    });
  });

  it("rend les deux champs que le contrat exige, même sans voie", () => {
    const a = adresseFrancaise("", "69006", "Lyon");
    expect(a).toEqual({ codePays: "FRA", codePostal: "69006", commune: "Lyon" });
  });
});

describe("le contenu d'une création", () => {
  it("pose la forme juridique aux deux endroits qui la portent", () => {
    const { contenu } = contenuDeLaCreation(BROUILLON);
    const nature = contenu.natureCreation as Record<string, unknown>;
    const pm = contenu.personneMorale as Record<string, Record<string, Record<string, unknown>>>;

    expect(nature.formeJuridique).toBe("5710");
    expect(pm.identite.entreprise.formeJuridique).toBe("5710");
  });

  it("porte le capital, sa devise et la durée", () => {
    const { contenu } = contenuDeLaCreation(BROUILLON);
    const pm = contenu.personneMorale as Record<string, Record<string, Record<string, unknown>>>;

    expect(pm.identite.description).toMatchObject({
      montantCapital: 20000,
      montantCapitalCentime: 0,
      deviseCapital: "EUR",
      duree: 99,
      dateClotureExerciceSocial: "2027-12-31",
    });
  });

  /* Le siège qui exerce vaut 2 : siège et établissement principal. */
  it("déclare le siège comme établissement principal", () => {
    const { contenu } = contenuDeLaCreation(BROUILLON);
    const pm = contenu.personneMorale as Record<string, Record<string, Record<string, unknown>>>;
    expect(pm.etablissementPrincipal.descriptionEtablissement.rolePourEntreprise).toBe("2");
  });

  it("traduit le dirigeant en pouvoir, avec son état civil", () => {
    const { contenu } = contenuDeLaCreation(BROUILLON);
    const pm = contenu.personneMorale as Record<string, { pouvoirs: Record<string, never>[] }>;
    const pouvoir = pm.composition.pouvoirs[0] as unknown as {
      individu: { descriptionPersonne: Record<string, unknown> };
    };

    expect(pouvoir.individu.descriptionPersonne).toMatchObject({
      nom: "Dupont",
      prenoms: ["Jean"],
      dateDeNaissance: "1980-04-12",
      situationMatrimoniale: "4",
    });
  });

  /*
   * Sans forme juridique il n'y a rien à traduire. Rendre un contenu à moitié rempli
   * ferait passer pour incomplet ce qui est en réalité ininterprétable.
   */
  it("ne traduit rien sans forme juridique", () => {
    const { contenu, manques } = contenuDeLaCreation({ denomination: "SANS FORME" });
    expect(contenu).toEqual({});
    expect(manques).toHaveLength(1);
    expect(manques[0].chemin).toBe("natureCreation.formeJuridique");
  });
});

describe("ce qui manque encore", () => {
  it("nomme le déclarant, la catégorie d'activité et le rôle du dirigeant", () => {
    const chemins = contenuDeLaCreation(BROUILLON).manques.map((m) => m.chemin);

    expect(chemins).toContain("declarant");
    expect(chemins).toContain(
      "personneMorale.etablissementPrincipal.activites.0.categorisationActivite1"
    );
    expect(chemins).toContain("personneMorale.composition.pouvoirs.0.roleEntreprise");
  });

  /* Au-delà du quart du capital, un associé est bénéficiaire effectif. */
  it("signale les modalités de contrôle des bénéficiaires effectifs", () => {
    const manque = contenuDeLaCreation(BROUILLON).manques.find((m) =>
      m.chemin.startsWith("personneMorale.beneficiairesEffectifs")
    );
    expect(manque?.quoi).toContain("2 bénéficiaires effectifs");
  });

  it("n'en signale aucun quand personne ne dépasse le quart", () => {
    const disperse: Brouillon = {
      ...BROUILLON,
      partsTotales: 2000,
      associes: [
        { type: "physique", parts: 500, personne: { prenom: "A", nom: "Un" } },
        { type: "physique", parts: 500, personne: { prenom: "B", nom: "Deux" } },
        { type: "physique", parts: 500, personne: { prenom: "C", nom: "Trois" } },
        { type: "physique", parts: 500, personne: { prenom: "D", nom: "Quatre" } },
      ],
    };
    const chemins = contenuDeLaCreation(disperse).manques.map((m) => m.chemin);
    expect(chemins).not.toContain("personneMorale.beneficiairesEffectifs");
  });

  it("range chaque manque selon d'où viendra la réponse", () => {
    for (const manque of contenuDeLaCreation(BROUILLON).manques) {
      expect(["formulaire", "configuration", "nomenclature"]).toContain(manque.origine);
    }
  });
});
