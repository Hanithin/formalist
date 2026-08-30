import { describe, it, expect } from "vitest";
import { genererDocument } from "@/infrastructure/documents/generation";
import { donneesDeGabarit } from "@/domain/formalite/gabarit";
import { unzipSync } from "node:zlib";

/** Le texte visible d'un .docx produit. */
function texteDe(docx: Buffer): string {
  const donnees = new Uint8Array(docx);
  // Lecture minimale du zip : on cherche l'entrée word/document.xml
  const vue = new DataView(donnees.buffer, donnees.byteOffset, donnees.byteLength);
  for (let i = 0; i < donnees.length - 4; i++) {
    if (vue.getUint32(i, true) !== 0x04034b50) continue;
    const nomLong = vue.getUint16(i + 26, true);
    const extraLong = vue.getUint16(i + 28, true);
    const nom = new TextDecoder().decode(donnees.subarray(i + 30, i + 30 + nomLong));
    if (nom !== "word/document.xml") continue;
    const debut = i + 30 + nomLong + extraLong;
    const compresse = vue.getUint32(i + 18, true);
    const methode = vue.getUint16(i + 8, true);
    const brut = donnees.subarray(debut, debut + compresse);
    const xml = methode === 0 ? Buffer.from(brut) : unzipSync(Buffer.from(brut), { finishFlush: 2 });
    return xml.toString("utf8").replace(/<[^>]+>/g, "");
  }
  throw new Error("document.xml introuvable");
}

const brouillon = (civilite: "Monsieur" | "Madame", capital: number, parts: number) => ({
  forme: "SASU",
  denomination: "ESSAI RENDU",
  capital,
  partsTotales: parts,
  associes: [
    {
      type: "physique" as const,
      personne: {
        civilite,
        prenom: "Camille",
        nom: "Durand",
        dateDeNaissance: "1985-04-12",
        villeDeNaissance: "Bordeaux",
        nomDuPere: "Jean Durand",
        nomDeLaMere: "Marie Petit",
      },
      parts,
    },
  ],
  dirigeants: [{ associe: 0 }],
});

/**
 * Ce que produisent réellement les gabarits.
 *
 * Les tests de couverture vérifient que chaque champ est alimenté ; ceux-ci lisent le
 * texte du document produit. C'est le seul moyen de voir une phrase mal accordée : le
 * champ était bien fourni, c'est la langue autour qui était fausse.
 */
describe("le rendu des gabarits", () => {
  it("la valeur nominale s'élide et s'accorde", () => {
    // 1000 euros sur 100 parts : dix euros la part.
    const dix = texteDe(genererDocument("sasu-statuts.docx", donneesDeGabarit(brouillon("Monsieur", 1000, 100))));
    expect(dix).toContain("actions de dix euros (");
    expect(dix).not.toContain("d’dix");
    expect(dix).not.toContain("euro (");

    // 100 euros sur 100 parts : un euro la part.
    const un = texteDe(genererDocument("sasu-statuts.docx", donneesDeGabarit(brouillon("Monsieur", 100, 100))));
    expect(un).toContain("actions d’un euro (");
  });

  it.each(["sasu", "sas", "sarl", "sci"])(
    "la déclaration de %s suit le genre du déclarant",
    (forme) => {
      const gabarit = forme + "-declaration-non-condamnation.docx";

      const homme = texteDe(genererDocument(gabarit, donneesDeGabarit(brouillon("Monsieur", 1000, 100))));
      expect(homme).toContain("Je soussigné,");
      expect(homme).toContain("né le");
      expect(homme).toContain("fils de");
      expect(homme).not.toContain("Je soussignée");
      expect(homme).not.toContain("fille de");

      const femme = texteDe(genererDocument(gabarit, donneesDeGabarit(brouillon("Madame", 1000, 100))));
      expect(femme).toContain("Je soussignée,");
      expect(femme).toContain("née le");
      expect(femme).toContain("fille de");
      expect(femme).not.toContain("Je soussigné,");
      expect(femme).not.toContain("fils de");

      /*
       * Le nom de la mère est son nom de jeune fille : il ne se répète plus.
       *
       * La phrase écrivait « et de Marie Petit née PETIT » - le nom de naissance était
       * tiré du même champ, et le doublait donc toujours. Le formulaire demande
       * maintenant le nom de jeune fille sous ce nom.
       */
      expect(femme).toContain("et de Marie Petit");
      expect(femme).not.toContain("née PETIT");
    }
  );

  it.each(["sasu", "sas", "sarl", "sci"])(
    "les actions de %s sont dites intégralement libérées, au pluriel",
    (forme) => {
      // L'accord se fait sur « actions » ou « parts ». La SAS et la SASU écrivaient
      // « libérée » au singulier, là où la SARL et la SCI avaient la bonne forme.
      const texte = texteDe(
        genererDocument(forme + "-statuts.docx", donneesDeGabarit(brouillon("Monsieur", 1000, 100)))
      );
      expect(texte).toContain("de valeur nominale, intégralement libérées.");
      expect(texte).not.toContain("de valeur nominale, intégralement libérée.");
    }
  );

  it("la prime d'émission de la SARL reste au singulier", () => {
    // « Toute prime éventuelle doit être intégralement libérée » : l'accord y est
    // juste, il ne fallait pas le corriger avec les autres.
    const texte = texteDe(
      genererDocument("sarl-statuts.docx", donneesDeGabarit(brouillon("Monsieur", 1000, 100)))
    );
    expect(texte).toContain("prime éventuelle doit être intégralement libérée");
  });

  it.each(["sci", "sarl"])(
    "une société à gérant unique ne produit pas de seconde déclaration vide",
    (forme) => {
      /*
       * Le gabarit porte une seconde déclaration, pour un co-gérant, sous
       * {{#HAS_DG_1}}. L'indicateur se déduisait de la présence d'une civilité, or le
       * domaine y écrit un tiret pour les rangs vides : chaque société à gérant unique
       * produisait une déclaration de plus, vide, à destination du greffe.
       */
      const texte = texteDe(
        genererDocument(forme + "-declaration-non-condamnation.docx", donneesDeGabarit(brouillon("Monsieur", 1000, 100)))
      );

      const declarations = texte.split("DÉCLARATION DE NON-CONDAMNATION").length - 1;
      expect(declarations).toBe(1);
      expect(texte).not.toContain("Je soussignée");
    }
  );

  it("l'attestation de domiciliation s'accorde aussi", () => {
    /*
     * L'attestation s'ouvre désormais sur « La soussignée : » plutôt que sur « Je
     * soussigné(e), » - c'est la forme du modèle du cabinet. L'accord, lui, reste ce
     * qui compte : un acte qui appelle une femme « le soussigné » se lit comme un
     * formulaire mal rempli, et c'est elle qui le signe.
     */
    const femme = texteDe(
      genererDocument(
        "sasu-attestation-domicile.docx",
        donneesDeGabarit(brouillon("Madame", 1000, 100))
      )
    );
    expect(femme).toContain("La soussignée");
    expect(femme).toContain("dont elle est");
    expect(femme).not.toContain("Le soussigné");
    expect(femme).not.toContain("dont il est");

    const homme = texteDe(
      genererDocument(
        "sasu-attestation-domicile.docx",
        donneesDeGabarit(brouillon("Monsieur", 1000, 100))
      )
    );
    expect(homme).toContain("Le soussigné");
    expect(homme).not.toContain("La soussignée");
  });
});

it.each(["sasu", "sas", "sarl", "sci"])(
  "la filiation de %s élide sa préposition devant une voyelle",
  (forme) => {
    /*
     * « fils de Paul MARCHAND et de Anne BERGER » : le second « de » se lisait devant
     * une voyelle, alors que le reste des actes élide partout.
     */
    const avecVoyelle = {
      ...brouillon("Madame", 1000, 100),
      associes: [
        {
          type: "physique" as const,
          personne: {
            civilite: "Madame" as const,
            prenom: "Camille",
            nom: "Durand",
            dateDeNaissance: "1985-04-12",
            nomDuPere: "Olivier Durand",
            nomDeLaMere: "Anne PETIT",
          },
          parts: 100,
        },
      ],
      dirigeants: [{ associe: 0 }],
    };

    const texte = texteDe(
      genererDocument(forme + "-declaration-non-condamnation.docx", donneesDeGabarit(avecVoyelle))
    );
    expect(texte).toContain("fille d’Olivier Durand et d’Anne PETIT");
  }
);

it.each(["sasu", "sas", "sarl", "sci"])(
  "le procès-verbal de %s nomme une société sans lui inventer d'état civil",
  (forme) => {
    /*
     * Un associé personne morale sortait à trous - « - -, né le - à - (-) (France), de
     * nationalité Française, célibataire, demeurant - » - et, sur les gabarits de SARL
     * et de SCI, il disparaissait même de la liste des présents : les deux branches de
     * genre l'écartaient toutes les deux.
     */
    const avecHolding = {
      forme: forme.toUpperCase(),
      denomination: "ESSAI MORALE",
      activite: "Conseil",
      adresse: "4 rue de la Fontaine",
      codePostal: "75010",
      ville: "Paris",
      capital: 20000,
      partsTotales: 2000,
      associes: [
        {
          type: "morale" as const,
          societe: {
            denomination: "HOLDING MERIDIEN",
            forme: "SARL",
            capital: 50000,
            adresse: "8 quai de la Gare",
            codePostal: "75013",
            ville: "Paris",
            numeroRcs: "842019336",
            villeImmatriculation: "Paris",
            representant: { civilite: "Monsieur" as const, prenom: "Marc", nom: "BERTIN" },
          },
          parts: 2000,
        },
      ],
      dirigeants: [{ associe: 0 }],
    };

    const texte = texteDe(
      genererDocument(forme + "-pv-nomination.docx", donneesDeGabarit(avecHolding))
    );

    expect(texte).toContain("HOLDING MERIDIEN");
    expect(texte).toContain("représentée par Monsieur Marc BERTIN");
    expect(texte).toContain("sous le numéro 842 019 336");
    // Ni naissance, ni situation matrimoniale, ni domicile inventés.
    expect(texte).not.toContain("né le -");
    expect(texte).not.toContain("née le -");
    expect(texte).not.toContain("célibataire");
  }
);
