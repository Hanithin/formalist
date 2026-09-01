import { describe, it, expect } from "vitest";
import {
  champsDeLaCreation,
  valeursDuBrouillon,
  brouillonAvecValeurs,
} from "@/domain/formalite/champs-creation";

/**
 * Les personnes du dossier, corrigées depuis l'espace avocat.
 *
 * La fenêtre de correction ne portait que ce que le brouillon range à plat. L'avocat
 * qui voyait « DUPOND » au lieu de « DUPONT » dans les statuts ne pouvait corriger ni
 * le nom, ni la date de naissance, ni le domicile - c'est-à-dire précisément ce qui
 * remplit les actes. Il lui restait à reprendre le Word à la main, ce que cette
 * fenêtre existe pour éviter.
 */
const DOSSIER = {
  forme: "SAS",
  denomination: "ATELIER MERIDIEN",
  associes: [
    {
      type: "physique",
      parts: 700,
      personne: { civilite: "Monsieur", prenom: "Marc", nom: "BERTIN", nationalite: "Française" },
    },
    {
      type: "morale",
      parts: 300,
      societe: { denomination: "HOLDING KERN", forme: "SARL", capital: 5000 },
    },
  ],
  dirigeants: [{ associe: 0 }],
};

describe("les champs d'une création", () => {
  it("déplie chaque associé sous son rang", () => {
    const groupes = new Set(champsDeLaCreation(DOSSIER).map((c) => c.groupe));
    expect(groupes).toContain("Associé 1");
    expect(groupes).toContain("Associé 2");

    const enSarl = new Set(champsDeLaCreation({ ...DOSSIER, forme: "SARL" }).map((c) => c.groupe));
    expect(enSarl).toContain("Associé 1");
  });

  it("donne à une personne son état civil, à une société sa désignation", () => {
    const identifiants = champsDeLaCreation(DOSSIER).map((c) => c.identifiant);

    expect(identifiants).toContain("associes.0.personne.nom");
    expect(identifiants).toContain("associes.0.personne.dateDeNaissance");
    expect(identifiants).toContain("associes.0.personne.codePostal");
    expect(identifiants).toContain("associes.1.societe.denomination");
    expect(identifiants).toContain("associes.1.societe.representant.nom");

    /* Une société n'a ni date de naissance ni situation matrimoniale. */
    expect(identifiants).not.toContain("associes.1.personne.dateDeNaissance");
  });

  it("porte l'apport de chaque associé, quel que soit son type", () => {
    const identifiants = champsDeLaCreation(DOSSIER).map((c) => c.identifiant);
    expect(identifiants).toContain("associes.0.parts");
    expect(identifiants).toContain("associes.1.versement");
  });

  /*
   * Le dirigeant qui reprend un associé est cette personne : lui donner ses propres
   * champs ouvrirait deux vérités pour un seul état civil, et l'acte en choisirait une.
   */
  it("ne redonne pas d'état civil au dirigeant qui reprend un associé", () => {
    const identifiants = champsDeLaCreation(DOSSIER).map((c) => c.identifiant);
    expect(identifiants).not.toContain("dirigeants.0.personne.nom");
    expect(identifiants).toContain("dirigeants.0.remuneration");
  });

  it("donne son état civil au dirigeant qui n'est pas associé", () => {
    const autre = { ...DOSSIER, dirigeants: [{ personne: { nom: "LOMBARD" } }] };
    const identifiants = champsDeLaCreation(autre).map((c) => c.identifiant);
    expect(identifiants).toContain("dirigeants.0.personne.nom");
  });

  it("garde les champs de la société quand le dossier n'a personne", () => {
    const identifiants = champsDeLaCreation({ forme: "SASU" }).map((c) => c.identifiant);
    expect(identifiants).toContain("denomination");
    expect(identifiants.some((i) => i.startsWith("associes."))).toBe(false);
  });
});

describe("la lecture du brouillon", () => {
  it("relit les valeurs au bout de leur chemin", () => {
    const valeurs = valeursDuBrouillon(DOSSIER);
    expect(valeurs["associes.0.personne.nom"]).toBe("BERTIN");
    expect(valeurs["associes.0.parts"]).toBe(700);
    expect(valeurs["associes.1.societe.capital"]).toBe(5000);
  });

  /* Un dossier écrit avant qu'une clé existe ne doit pas faire échouer la relecture. */
  it("ne rend rien pour un chemin qui ne mène nulle part", () => {
    const valeurs = valeursDuBrouillon(DOSSIER);
    expect(valeurs["associes.0.personne.nomDuPere"]).toBeUndefined();
    expect(valeurs["associes.1.societe.representant.nom"]).toBeUndefined();
  });
});

describe("l'écriture des corrections", () => {
  it("corrige une valeur sans toucher au reste de la personne", () => {
    const ecrit = brouillonAvecValeurs(DOSSIER, { "associes.0.personne.nom": "BERTHIN" }) as {
      associes: { personne: Record<string, unknown> }[];
    };

    expect(ecrit.associes[0].personne.nom).toBe("BERTHIN");
    expect(ecrit.associes[0].personne.prenom).toBe("Marc");
    expect(ecrit.associes[0].personne.nationalite).toBe("Française");
  });

  /*
   * Chaque écriture recopie les niveaux qu'elle traverse. Sans repartir du résultat de
   * la précédente, deux corrections sur la même personne s'annuleraient.
   */
  it("cumule deux corrections sur la même personne", () => {
    const ecrit = brouillonAvecValeurs(DOSSIER, {
      "associes.0.personne.nom": "BERTHIN",
      "associes.0.personne.prenom": "Marco",
    }) as { associes: { personne: Record<string, unknown> }[] };

    expect(ecrit.associes[0].personne).toMatchObject({ nom: "BERTHIN", prenom: "Marco" });
  });

  it("laisse les autres associés intacts", () => {
    const ecrit = brouillonAvecValeurs(DOSSIER, { "associes.0.personne.nom": "BERTHIN" }) as {
      associes: { societe: Record<string, unknown> }[];
    };
    expect(ecrit.associes[1].societe.denomination).toBe("HOLDING KERN");
  });

  /* Un représentant peut n'avoir jamais existé avant qu'on le renseigne. */
  it("crée le maillon manquant d'un chemin", () => {
    const ecrit = brouillonAvecValeurs(DOSSIER, {
      "associes.1.societe.representant.nom": "KERN",
    }) as { associes: { societe: { representant: Record<string, unknown> } }[] };

    expect(ecrit.associes[1].societe.representant.nom).toBe("KERN");
  });

  it("ne modifie pas le brouillon d'origine", () => {
    brouillonAvecValeurs(DOSSIER, { "associes.0.personne.nom": "BERTHIN" });
    expect(DOSSIER.associes[0].personne?.nom).toBe("BERTIN");
  });

  it("continue d'écrire les champs à plat et le domiciliataire", () => {
    const ecrit = brouillonAvecValeurs(DOSSIER, {
      denomination: "ATELIER LOMBARD",
      domiciliataireSiren: "123456789",
    }) as { denomination: string; domiciliataire: Record<string, unknown> };

    expect(ecrit.denomination).toBe("ATELIER LOMBARD");
    expect(ecrit.domiciliataire.siren).toBe("123456789");
  });
});
