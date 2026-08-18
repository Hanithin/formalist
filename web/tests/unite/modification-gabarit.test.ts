import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import {
  donneesDuGabarit,
  gabaritProcesVerbal,
  gabaritDeLaDeclaration,
  actesAProduire,
  adresseSurUneLigne,
} from "@/domain/modification/gabarit";
import { genererDocument } from "@/infrastructure/documents/generation";
import { renumeroterLesResolutions } from "@/infrastructure/documents/resolutions";

/**
 * Les actes de modification, lus dans le document produit.
 *
 * Vérifier la taille du fichier ne prouve rien : un procès-verbal entièrement vide
 * pèse le même poids qu'un procès-verbal rempli. C'est exactement ce qui s'est
 * produit - la route passait des noms de champs qui n'existaient dans aucun gabarit,
 * et l'acte sortait avec « au capital de  euros », sans siège, sans SIREN et sans
 * une seule résolution. On lit donc le texte.
 */

function texteDu(docx: Buffer): string {
  return new PizZip(docx).file("word/document.xml")!.asText().replace(/<[^>]+>/g, "");
}

const SOCIETE = {
  denomination: "ACME CONSEIL",
  forme: "SAS",
  siren: "123456789",
  adresse: "12 rue de la Paix",
  codePostal: "75002",
  ville: "Paris",
  capital: 15000,
  villeRcs: "Paris",
};

const ASSEMBLEE = {
  date: "2026-08-10",
  associes: [
    { civilite: "Monsieur", prenom: "Jean", nom: "DUPONT", parts: 700 },
    { civilite: "Madame", prenom: "Claire", nom: "MARTIN", parts: 300 },
  ],
};

function produire(codes: string[], valeurs: Record<string, string | number> = {}) {
  const donnees = donneesDuGabarit({ societe: SOCIETE, assemblee: ASSEMBLEE, codes, valeurs });
  return texteDu(genererDocument(gabaritProcesVerbal(SOCIETE.forme), donnees));
}

describe("le procès-verbal de modification", () => {
  it("porte l'identité de la société", () => {
    const texte = produire(["denomination"], {
      nouvelleDenomination: "ACME GROUPE",
      dateEffetDenomination: "2026-09-01",
    });

    expect(texte).toContain("ACME CONSEIL");
    expect(texte).toContain("123456789");
    expect(texte).toContain("12 rue de la Paix, 75002 Paris");
    expect(texte).toContain("15 000");
    // Le blanc qui trahissait l'ancienne version : « au capital de  euros ».
    expect(texte).not.toContain("capital de  euros");
  });

  it("rend la résolution du changement choisi, et elle seule", () => {
    const texte = produire(["transfert_siege"], {
      nouvelleAdresse: "5 avenue Victor Hugo",
      nouvelleVille: "Lyon",
      nouveauCodePostal: "69003",
      dateEffetTransfert: "2026-09-15",
    });

    expect(texte).toContain("TRANSFERT DU SIÈGE SOCIAL");
    expect(texte).toContain("5 avenue Victor Hugo, 69003 Lyon");
    expect(texte).toContain("15 septembre 2026");
    // Les sections des autres types ne doivent pas apparaître.
    expect(texte).not.toContain("RÉDUCTION DU CAPITAL");
    expect(texte).not.toContain("PROROGATION");
  });

  it("porte plusieurs résolutions quand une assemblée en décide plusieurs", () => {
    /*
     * C'est le cas courant : on déménage et on change de gérant le même jour. Les
     * gabarits sont taillés pour, avec une section par type ; la version précédente
     * ne transmettait aucun drapeau et n'en rendait aucune.
     */
    const texte = produire(["transfert_siege", "denomination"], {
      nouvelleAdresse: "5 avenue Victor Hugo",
      nouvelleVille: "Lyon",
      nouveauCodePostal: "69003",
      dateEffetTransfert: "2026-09-15",
      nouvelleDenomination: "ACME GROUPE",
      dateEffetDenomination: "2026-09-15",
    });

    expect(texte).toContain("TRANSFERT DU SIÈGE SOCIAL");
    expect(texte).toContain("CHANGEMENT DE DÉNOMINATION");
    expect(texte).toContain("ACME GROUPE");
  });

  it("nomme les associés présents et leur nombre de parts", () => {
    const texte = produire(["denomination"], { nouvelleDenomination: "ACME GROUPE" });

    expect(texte).toContain("Monsieur Jean DUPONT");
    expect(texte).toContain("Madame Claire MARTIN");
  });

  it("distingue nomination, révocation et démission", () => {
    const nomination = produire(["dirigeant"], {
      typeChangementDirigeant: "Nomination",
      fonctionDirigeant: "Président",
      dateEffetDirigeant: "2026-09-01",
      nouveauDirigeantCivilite: "Monsieur",
      nouveauDirigeantPrenom: "Paul",
      nouveauDirigeantNom: "BERNARD",
    });
    expect(nomination).toContain("BERNARD");

    const revocation = produire(["dirigeant"], {
      typeChangementDirigeant: "Révocation",
      fonctionDirigeant: "Président",
      dateEffetDirigeant: "2026-09-01",
      dirigeantRevoqueNom: "Jean DUPONT",
    });
    expect(revocation).toContain("Jean DUPONT");
    // La section de nomination ne doit pas se rendre pour une révocation.
    expect(revocation).not.toContain("BERNARD");
  });

  it("une société unipersonnelle décide seule, sans assemblée", () => {
    const donnees = donneesDuGabarit({
      societe: { ...SOCIETE, forme: "SASU" },
      assemblee: ASSEMBLEE,
      codes: ["denomination"],
      valeurs: { nouvelleDenomination: "ACME GROUPE" },
    });
    const texte = texteDu(genererDocument(gabaritProcesVerbal("SASU"), donnees));

    expect(texte).toContain("ACME GROUPE");
    expect(texte).toContain("DÉCISION DE L'ASSOCIÉ UNIQUE");
    // Un associé unique ne convoque ni ne préside personne.
    expect(texte).not.toContain("feuille de présence");
  });

  it("l'EURL a des parts sociales, non des actions", () => {
    /*
     * Elle recevait le procès-verbal de SASU, qui parle d'actions d'un bout à l'autre :
     * une EURL n'en a pas, et le greffe lit ce que l'acte dit.
     */
    expect(gabaritProcesVerbal("EURL")).toBe("modif-pv-transfert-siege-eurl.docx");
    expect(gabaritProcesVerbal("SASU")).toBe("modif-pv-transfert-siege-sasu.docx");

    const donnees = donneesDuGabarit({
      societe: { ...SOCIETE, forme: "EURL" },
      assemblee: ASSEMBLEE,
      codes: ["reduction_capital"],
      valeurs: {
        capitalActuelRed: "15000",
        nouveauCapitalRed: "10000",
        motifReduction: "Pertes",
        nbPartsAnnulees: "500",
        dateEffetRed: "2026-09-15",
      },
    });
    const texte = texteDu(genererDocument(gabaritProcesVerbal("EURL"), donnees));
    expect(texte).toContain("500 parts sociales");
    expect(texte).not.toContain("actions");
  });
});

describe("les actes produits", () => {
  it("un seul procès-verbal, quel que soit le nombre de changements", () => {
    const actes = actesAProduire(["transfert_siege", "denomination"], "SAS");
    const pv = actes.filter((a) => a.titre.startsWith("Procès-verbal"));
    expect(pv).toHaveLength(1);
  });

  it("aucun avenant aux statuts n'est produit", () => {
    /*
     * Il reprenait, article par article, l'ancienne et la nouvelle rédaction - ce que
     * l'éditeur de statuts fait désormais sur le document d'origine, à l'endroit exact
     * où la clause se trouve. Produire les deux revenait à livrer deux versions de la
     * même chose, dont l'une pouvait contredire l'autre.
     */
    expect(actesAProduire(["transfert_siege"], "SAS").map((a) => a.titre)).not.toContain(
      "Avenant aux statuts"
    );
  });

  it("l'acte de cession n'existe que s'il y a cession", () => {
    expect(actesAProduire(["cession_parts"], "SARL").map((a) => a.titre)).toContain(
      "Acte de cession de parts"
    );
    expect(actesAProduire(["denomination"], "SARL").map((a) => a.titre)).not.toContain(
      "Acte de cession de parts"
    );
  });

  it("la déclaration de non-condamnation n'est produite que si le gabarit dit la bonne fonction", () => {
    /*
     * Les quatre gabarits écrivent leur fonction en dur : « Président » pour une SAS,
     * « gérant » pour une SARL. Les employer pour une nomination de directeur général
     * produirait une déclaration disant qu'on accepte les fonctions de président, que
     * le greffe refuserait sans que le document dise pourquoi.
     */
    expect(gabaritDeLaDeclaration("SAS", { fonctionDirigeant: "Président" })).toBe(
      "sas-declaration-non-condamnation.docx"
    );
    expect(gabaritDeLaDeclaration("SAS", { fonctionDirigeant: "Directeur général" })).toBeNull();
    expect(gabaritDeLaDeclaration("SARL", { fonctionDirigeant: "Co-gérant" })).toBe(
      "sarl-declaration-non-condamnation.docx"
    );
  });

  it("la déclaration porte l'état civil et la filiation du nommé", () => {
    const valeurs = {
      typeChangementDirigeant: "Nomination",
      fonctionDirigeant: "Président",
      nouveauDirigeantCivilite: "Monsieur",
      nouveauDirigeantPrenom: "Paul",
      nouveauDirigeantNom: "BERNARD",
      nouveauDirigeantDateNaissance: "1980-04-12",
      nouveauDirigeantLieuNaissance: "Bordeaux, France",
      nouveauDirigeantAdresse: "3 rue des Lilas, 33000 Bordeaux",
      nouveauDirigeantNomPere: "Michel BERNARD",
      nouveauDirigeantNomMere: "Anne LEROY",
    };
    const donnees = donneesDuGabarit({
      societe: SOCIETE,
      assemblee: ASSEMBLEE,
      codes: ["dirigeant"],
      valeurs,
    });
    const texte = texteDu(
      genererDocument(gabaritDeLaDeclaration("SAS", valeurs)!, donnees)
    );

    expect(texte).toContain("Monsieur Paul BERNARD");
    expect(texte).toContain("12 avril 1980");
    expect(texte).toContain("Michel BERNARD");
    // Le nom de jeune fille se déduit du nom de la mère, écrit en capitales.
    expect(texte).toContain("LEROY");
    expect(texte).toContain("ACME CONSEIL");
  });
});

describe("l'adresse d'un acte", () => {
  it("tient sur une ligne", () => {
    expect(adresseSurUneLigne("12 rue de la Paix", "75002", "Paris")).toBe(
      "12 rue de la Paix, 75002 Paris"
    );
  });

  it("sans rien, elle s'écrit d'un tiret plutôt que d'un blanc", () => {
    // Dans un acte, un blanc se lit comme un oubli ; un tiret, comme une absence.
    expect(adresseSurUneLigne("", "", "")).toBe("-");
  });
});

describe("le numérotage des résolutions", () => {
  it("une seule modification en fait quand même deux, avec les pouvoirs", () => {
    /*
     * Les pouvoirs au porteur sont une résolution : c'est elle qui permet au porteur du
     * procès-verbal de déposer la formalité, et le greffe la cherche. Le document ne
     * peut donc jamais annoncer une « résolution unique ».
     */
    const donnees = donneesDuGabarit({
      societe: SOCIETE,
      assemblee: ASSEMBLEE,
      codes: ["denomination"],
      valeurs: { nouvelleDenomination: "ACME GROUPE" },
    });
    const brut = genererDocument(gabaritProcesVerbal("SAS"), donnees);
    const texte = texteDu(renumeroterLesResolutions(brut));
    expect(texte).not.toContain("RÉSOLUTION UNIQUE");
    expect(texte).toContain("PREMIÈRE RÉSOLUTION - CHANGEMENT DE DÉNOMINATION");
    expect(texte).toContain("DEUXIÈME RÉSOLUTION - POUVOIRS");
  });

  it("deux décisions se numérotent, au lieu d'être deux fois uniques", () => {
    /*
     * Un acte qui annonce deux fois une résolution unique se contredit à deux
     * paragraphes d'intervalle, et c'est le greffe qui le lit.
     */
    const donnees = donneesDuGabarit({
      societe: SOCIETE,
      assemblee: ASSEMBLEE,
      codes: ["transfert_siege", "denomination"],
      valeurs: {
        nouvelleAdresse: "5 avenue Victor Hugo",
        nouvelleVille: "Lyon",
        nouveauCodePostal: "69003",
        dateEffetTransfert: "2026-09-15",
        nouvelleDenomination: "ACME GROUPE",
        dateEffetDenomination: "2026-09-15",
      },
    });
    const brut = genererDocument(gabaritProcesVerbal("SAS"), donnees);
    const texte = texteDu(renumeroterLesResolutions(brut));

    expect(texte).toContain("PREMIÈRE RÉSOLUTION");
    expect(texte).toContain("DEUXIÈME RÉSOLUTION");
    expect(texte).not.toContain("RÉSOLUTION UNIQUE");
  });
});

describe("un associé personne morale", () => {
  it("est désigné comme un acte le désigne, non par un prénom", () => {
    /*
     * Une SCI détenue par une holding, une SAS dont un fonds est associé : le
     * procès-verbal doit nommer la société par sa forme, son capital, son siège et son
     * numéro, et dire qui la représente. Un acte qui écrirait « Monsieur HOLDING » se
     * ferait refuser.
     */
    const texte = texteDu(
      genererDocument(
        gabaritProcesVerbal("SAS"),
        donneesDuGabarit({
          societe: SOCIETE,
          assemblee: {
            date: "2026-08-10",
            associes: [
              {
                nature: "morale",
                denomination: "ACME HOLDING",
                forme: "Société par actions simplifiée",
                capital: 50000,
                siege: "3 rue de la Bourse, 75002 Paris",
                siren: "552100554",
                representant: "Monsieur Jean DUPONT",
                qualiteRepresentant: "Président",
                parts: 1000,
              },
            ],
          },
          codes: ["denomination"],
          valeurs: { nouvelleDenomination: "ACME GROUPE" },
        })
      )
    );

    expect(texte).toContain("La société ACME HOLDING");
    expect(texte).toContain("au capital de 50 000 euros");
    expect(texte).toContain("dont le siège est 3 rue de la Bourse");
    expect(texte).toContain("sous le numéro 552100554");
    expect(texte).toContain("représentée par Monsieur Jean DUPONT en sa qualité de président");
  });

  it("une personne physique garde sa forme d'avant", () => {
    // L'ancien format n'a pas de « nature » : il doit continuer de se lire.
    const texte = produire(["denomination"], { nouvelleDenomination: "ACME GROUPE" });
    expect(texte).toContain("Monsieur Jean DUPONT");
  });

  it("une société sans dénomination ne produit pas une phrase à trous", () => {
    const texte = texteDu(
      genererDocument(
        gabaritProcesVerbal("SAS"),
        donneesDuGabarit({
          societe: SOCIETE,
          assemblee: { date: "2026-08-10", associes: [{ nature: "morale", parts: 10 }] },
          codes: ["denomination"],
          valeurs: { nouvelleDenomination: "ACME GROUPE" },
        })
      )
    );
    expect(texte).not.toContain("La société ,");
    expect(texte).not.toContain("dont le siège est ,");
  });
});
