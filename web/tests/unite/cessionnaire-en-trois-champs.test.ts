import { describe, expect, it } from "vitest";
import { identiteCollee } from "@/domain/formalite/noms";
import { identiteDuTiers, verifierCessions, type Cession } from "@/domain/modification/cession";
import { lireModification } from "@/infrastructure/db/depots/modifications";

/**
 * Le cessionnaire, en civilité, prénom et nom.
 *
 * Son identité tenait dans une case libre - « Civilité, prénom et nom » - où chacun
 * tapait ce qu'il voulait dans l'ordre qu'il voulait. L'acte de cession se présente à
 * l'enregistrement au service des impôts, qui attend le prénom et le nom séparément :
 * la découpe se faisait après coup, sur les capitales, et « monsieur jean dupont » lui
 * échappait.
 */

const ASSOCIES = [{ nature: "physique" as const, prenom: "Jean", nom: "DUPONT", parts: 2000 }];

function cession(complement: Partial<Cession>): Cession {
  return {
    cedant: 0,
    parts: 500,
    prix: 10000,
    date: "2026-09-04",
    vers: "tiers",
    cessionnaire: null,
    nature: "physique",
    ...complement,
  } as Cession;
}

function manques(complement: Partial<Cession>) {
  return verifierCessions(ASSOCIES, [cession(complement)], "SARL", "non").map((a) => a.champ);
}

describe("ce que le dossier exige du cessionnaire tiers", () => {
  it("réclame les trois morceaux de son identité", () => {
    expect(manques({})).toEqual([
      "cession-0-civilite",
      "cession-0-prenom",
      "cession-0-nom",
    ]);
  });

  it("ne se satisfait plus du seul prénom", () => {
    /* Une exigence unique - « nommez le cessionnaire » - passait dès qu'un morceau
       était là : l'acte partait avec une partie à demi nommée. */
    expect(manques({ civilite: "Monsieur", prenom: "Paul" })).toEqual(["cession-0-nom"]);
    expect(manques({ prenom: "Paul", nom: "DURAND" })).toEqual(["cession-0-civilite"]);
  });

  it("ne réclame rien quand les trois sont là", () => {
    expect(manques({ civilite: "Monsieur", prenom: "Paul", nom: "DURAND" })).toEqual([]);
  });

  it("n'attend d'une société que sa dénomination", () => {
    expect(manques({ nature: "morale" })).toEqual(["cession-0-nom"]);
    expect(manques({ nature: "morale", nom: "MERCIER PARTICIPATIONS" })).toEqual([]);
  });
});

describe("l'identité que l'acte en tire", () => {
  it("recompose la ligne d'une personne", () => {
    expect(identiteDuTiers(cession({ civilite: "Madame", prenom: "Claire", nom: "MARTIN" }))).toBe(
      "Madame Claire MARTIN"
    );
  });

  it("laisse une société à sa seule dénomination", () => {
    /* « Madame SUPERNOVA INT » n'existe pas : la civilité ne suit pas la personne
       morale, même si le champ en garde une d'une saisie antérieure. */
    expect(
      identiteDuTiers(cession({ nature: "morale", civilite: "Madame", nom: "SUPERNOVA INT" }))
    ).toBe("SUPERNOVA INT");
  });
});

describe("les dossiers saisis avant la découpe", () => {
  it("retrouvent leurs trois champs à la lecture", () => {
    const lu = lireModification(
      JSON.stringify({ cessions: [{ vers: "tiers", nature: "physique", nom: "Madame Claire MARTIN" }] })
    );

    expect(lu.cessions?.[0]).toMatchObject({
      civilite: "Madame",
      prenom: "Claire",
      nom: "MARTIN",
    });
  });

  it("ne touchent pas à la dénomination d'une société", () => {
    const lu = lireModification(
      JSON.stringify({ cessions: [{ vers: "tiers", nature: "morale", nom: "MERCIER PARTICIPATIONS" }] })
    );

    expect(lu.cessions?.[0].nom).toBe("MERCIER PARTICIPATIONS");
    expect(lu.cessions?.[0].prenom).toBeUndefined();
  });

  it("laissent tranquille un dossier déjà découpé", () => {
    /* La lecture passe à chaque ouverture : un second découpage d'un nom composé -
       « Anne-Marie » saisie dans le prénom - le réduirait un peu plus chaque fois. */
    const lu = lireModification(
      JSON.stringify({
        cessions: [{ vers: "tiers", civilite: "Madame", prenom: "Anne Marie", nom: "MARTIN" }],
      })
    );

    expect(lu.cessions?.[0]).toMatchObject({ prenom: "Anne Marie", nom: "MARTIN" });
  });
});

describe("l'identité entière tapée dans une seule case", () => {
  it("se répartit quand une civilité la précède", () => {
    expect(identiteCollee("Monsieur Paul DURAND")).toEqual({
      civilite: "Monsieur",
      prenom: "Paul",
      nom: "DURAND",
    });
    expect(identiteCollee("M. DURAND")).toEqual({
      civilite: "Monsieur",
      prenom: "",
      nom: "DURAND",
    });
  });

  it("ne coupe pas un prénom composé", () => {
    /* C'est tout l'intérêt de n'agir que sur la civilité : « Jean Pierre » est un
       prénom, et le découper donnerait un nom « Pierre » que personne n'a saisi. */
    expect(identiteCollee("Jean Pierre")).toBeNull();
    expect(identiteCollee("Anne-Marie")).toBeNull();
    expect(identiteCollee("DURAND")).toBeNull();
  });

  it("ne rend rien d'une civilité seule", () => {
    expect(identiteCollee("Monsieur")).toBeNull();
    expect(identiteCollee("  ")).toBeNull();
  });
});
