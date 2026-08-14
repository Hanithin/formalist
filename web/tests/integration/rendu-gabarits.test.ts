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
      // Le « née » du nom de jeune fille de la mère ne dépend pas du déclarant.
      expect(femme).toContain("née PETIT");
    }
  );

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
    // Le même bloc de code réécrit sa phrase d'ouverture.
    const femme = texteDe(genererDocument("sasu-attestation-domicile.docx", donneesDeGabarit(brouillon("Madame", 1000, 100))));
    expect(femme).toContain("Je soussignée,");
    expect(femme).not.toContain("Je soussigné,");
  });
});
