import { describe, it, expect } from "vitest";
import { donneesDuPouvoir, qualiteAuPluriel } from "@/domain/formalite/mandataire";
import { verifierLesCosignataires } from "@/domain/modification/verification";

/**
 * Le pouvoir signé à plusieurs.
 *
 * À l'égard des tiers, chaque gérant engage seul la société : un pouvoir signé par un
 * seul est valable, et c'est le cas de presque tous les dossiers. Mais les statuts
 * peuvent répartir les pouvoirs entre gérants, et une banque ou un greffe réclame alors
 * deux signatures - on ne pouvait pas les leur donner.
 *
 * Ce que ces essais gardent avant tout : le document d'un seul mandant ne bouge pas d'un
 * signe. Trois parcours le produisent, et deux d'entre eux n'enverront jamais de liste.
 */

const SOCIETE = {
  denomination: "TULLIO & ASSOCIES",
  formeEtCapital: "SARL au capital de 3 000 euros",
  siege: "12 rue de la Paix, 75002 Paris",
  greffe: "Paris",
  siren: "552 100 554",
};

const SEUL = {
  mandant: { identite: "Monsieur Valentin TULLIO, né le 28 mai 1995", nom: "Monsieur Valentin TULLIO" },
  qualite: "cogérant",
  objet: "modification" as const,
  societe: SOCIETE,
};

describe("le pouvoir donné à plusieurs", () => {
  it("ne change rien quand il n'y a qu'un mandant", () => {
    const sans = donneesDuPouvoir(SEUL);
    const avecListeVide = donneesDuPouvoir({ ...SEUL, cosignataires: [] });

    expect(sans).toEqual(avecListeVide);
    expect(sans.POUVOIR_LE_MANDANT).toBe("le « Mandant »");
    expect(sans.POUVOIR_TITRE_SIGNATURE).toBe("Le Mandant");
    expect(sans.POUVOIR_EN_SON_NOM).toBe("en son nom et pour son compte");
    expect(sans.POUVOIR_DU_MANDANT).toBe("du Mandant");
    /* La qualité reste au singulier : il signe seul. */
    expect(sans.POUVOIR_QUALITE).toBe("cogérant");
    expect(sans.POUVOIR_SIGNATAIRES).toEqual([{ NOM: "Monsieur Valentin TULLIO" }]);
  });

  it("accorde tout au pluriel dès qu'ils sont deux", () => {
    const donnees = donneesDuPouvoir({
      ...SEUL,
      cosignataires: [{ identite: "Monsieur Valentin MARIE, né le 11 février 1990", nom: "Monsieur Valentin MARIE" }],
    });

    expect(donnees.POUVOIR_LE_MANDANT).toBe("les « Mandants »");
    expect(donnees.POUVOIR_TITRE_SIGNATURE).toBe("Les Mandants");
    expect(donnees.POUVOIR_EN_SON_NOM).toBe("en leur nom et pour leur compte");
    expect(donnees.POUVOIR_DU_MANDANT).toBe("des Mandants");
    expect(donnees.POUVOIR_QUALITE).toBe("cogérants");
    /* Un bloc de signature par personne, dans l'ordre. */
    expect(donnees.POUVOIR_SIGNATAIRES).toEqual([
      { NOM: "Monsieur Valentin TULLIO" },
      { NOM: "Monsieur Valentin MARIE" },
    ]);
  });

  it("énumère les mandants comme un acte les nomme", () => {
    const deux = donneesDuPouvoir({
      ...SEUL,
      cosignataires: [{ identite: "B", nom: "B" }],
    });
    const trois = donneesDuPouvoir({
      ...SEUL,
      cosignataires: [
        { identite: "B", nom: "B" },
        { identite: "C", nom: "C" },
      ],
    });

    // « X et Y » à deux ; « X, Y et Z » au-delà. Une virgule avant le dernier ferait
    // une énumération de liste, là où l'acte nomme des parties.
    expect(deux.POUVOIR_MANDANT).toBe(SEUL.mandant.identite + " et B");
    expect(trois.POUVOIR_MANDANT).toBe(SEUL.mandant.identite + ", B et C");
  });
});

describe("la qualité au pluriel", () => {
  it("suit le français, non la règle du « s »", () => {
    // « représentant légals » serait le résultat d'une règle naïve, dans un acte signé.
    expect(qualiteAuPluriel("représentant légal")).toBe("représentants légaux");
    expect(qualiteAuPluriel("directrice générale")).toBe("directrices générales");
    expect(qualiteAuPluriel("cogérant")).toBe("cogérants");
    expect(qualiteAuPluriel("liquidateur")).toBe("liquidateurs");
  });

  it("laisse au singulier ce qu'elle ne connaît pas", () => {
    // Mieux vaut une qualité juste au singulier qu'un pluriel inventé dans un acte.
    expect(qualiteAuPluriel("directeur technique")).toBe("directeur technique");
  });
});

describe("ce qu'un cosignataire doit porter", () => {
  const complet = {
    civilite: "Monsieur",
    prenom: "Valentin",
    nom: "MARIE",
    neLe: "1990-02-11",
    neA: "Lyon 3e (69003)",
    adresse: "8 rue Bellecour, 69002 Lyon",
  };

  it("n'a rien à reprocher à une liste vide", () => {
    expect(verifierLesCosignataires()).toEqual([]);
    expect(verifierLesCosignataires([])).toEqual([]);
  });

  it("laisse passer une ligne qu'on vient d'ajouter sans rien y mettre", () => {
    // Elle se retire par sa croix, non par six reproches.
    expect(verifierLesCosignataires([{}])).toEqual([]);
  });

  it("exige l'état civil entier dès qu'on commence à le saisir", () => {
    const manques = verifierLesCosignataires([{ prenom: "Valentin" }]);
    const champs = manques.map((m) => m.champ);

    expect(champs).toContain("cosignataire-0-nom");
    expect(champs).toContain("cosignataire-0-neLe");
    expect(champs).toContain("cosignataire-0-neA");
    expect(champs).toContain("cosignataire-0-adresse");
    /* La civilité aussi : c'est elle qui accorde « né » ou « née » dans l'acte. */
    expect(champs).toContain("cosignataire-0-civilite");
  });

  it("ne reproche rien à un cosignataire complet", () => {
    expect(verifierLesCosignataires([complet])).toEqual([]);
  });

  it("nomme le rang, pour qu'on sache lequel reprendre", () => {
    const manques = verifierLesCosignataires([complet, { nom: "HORMAT" }]);
    expect(manques.every((m) => m.champ.startsWith("cosignataire-1-"))).toBe(true);
    expect(manques[0].message).toContain("cosignataire 2");
  });
});
