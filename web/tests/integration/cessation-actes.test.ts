import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { genererDocument } from "@/infrastructure/documents/generation";
import { donneesDeLaCessation, type ContexteCessation } from "@/domain/cessation/gabarit";
import { actesDeLaCessation, GABARITS_DE_CESSATION } from "@/domain/cessation/actes";
import { echeancesDe } from "@/domain/cessation/regles";

/**
 * La cessation d'une auto-entreprise.
 *
 * Ce qui compte ici n'est pas la formalité - elle est gratuite et tient en dix minutes -
 * mais les dates qui suivent. Une dernière déclaration de chiffre d'affaires manquée
 * laisse un compte URSSAF ouvert ; une TVA de cessation oubliée se rappelle par une mise
 * en demeure. Ces tests portent donc surtout sur le calendrier.
 */

function texteDu(docx: Buffer): string {
  const xml = new PizZip(docx).file("word/document.xml")?.asText() ?? "";
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/[  ]/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

const CONTEXTE: ContexteCessation = {
  nature: "definitive",
  entreprise: {
    denomination: "ATELIER CAMILLE",
    siren: "902345678",
    activite: "graphisme",
    adresse: "8 rue des Lilas",
    codePostal: "75011",
    ville: "Paris",
  },
  entrepreneur: {
    civilite: "Madame",
    prenom: "Camille",
    nom: "DURAND",
    adresse: "8 rue des Lilas, 75011 Paris",
  },
  valeurs: {
    dateCessation: "2026-05-14",
    motif: "Création d'une société",
    activiteCommerciale: "Non",
    periodicite: "Trimestrielle",
    assujettiTva: "Non",
    agentCommercial: "Non",
  },
};

describe("le calendrier des échéances", () => {
  it("compte la dernière déclaration trimestrielle depuis la fin du trimestre", () => {
    /*
     * Cessation le 14 mai : le trimestre s'achève le 30 juin, et la déclaration se fait
     * dans le mois qui suit - donc au 30 juillet. La compter depuis la date d'arrêt
     * donnerait le 13 juin, un mois et demi trop tôt.
     */
    const echeances = echeancesDe({
      nature: "definitive",
      dateCessation: "2026-05-14",
      periodicite: "trimestrielle",
      commerciale: false,
      assujettiTva: false,
      agentCommercial: false,
    });

    const ca = echeances.find((e) => e.cle === "chiffre-affaires");
    expect(ca?.limite).toBe("2026-07-30");
  });

  it("compte la déclaration mensuelle en trente jours", () => {
    const echeances = echeancesDe({
      nature: "definitive",
      dateCessation: "2026-05-14",
      periodicite: "mensuelle",
      commerciale: false,
      assujettiTva: false,
      agentCommercial: false,
    });

    expect(echeances.find((e) => e.cle === "chiffre-affaires")?.limite).toBe("2026-06-13");
  });

  it("n'ajoute la TVA et le registre des agents que lorsqu'ils s'appliquent", () => {
    const simple = echeancesDe({
      nature: "definitive",
      dateCessation: "2026-05-14",
      periodicite: "mensuelle",
      commerciale: false,
      assujettiTva: false,
      agentCommercial: false,
    }).map((e) => e.cle);
    expect(simple).not.toContain("tva");
    expect(simple).not.toContain("rsac");

    const complet = echeancesDe({
      nature: "definitive",
      dateCessation: "2026-05-14",
      periodicite: "mensuelle",
      commerciale: true,
      assujettiTva: true,
      agentCommercial: true,
    });
    // Soixante jours pour la 3517-S-SD, deux mois pour le registre des agents.
    expect(complet.find((e) => e.cle === "tva")?.limite).toBe("2026-07-13");
    expect(complet.find((e) => e.cle === "rsac")?.limite).toBe("2026-07-14");
  });

  it("garde la CFE et la déclaration de revenus, sans leur inventer de date", () => {
    /*
     * Ces deux-là ne se calculent pas : l'une dépend de la campagne de déclaration de
     * revenus, l'autre de la date d'envoi de l'avis. Leur donner une date fausse serait
     * pire que de dire quand, en toutes lettres.
     */
    const echeances = echeancesDe({
      nature: "definitive",
      dateCessation: "2026-05-14",
      periodicite: "mensuelle",
      commerciale: false,
      assujettiTva: false,
      agentCommercial: false,
    });

    for (const cle of ["revenus", "cfe"]) {
      const echeance = echeances.find((e) => e.cle === cle);
      expect(echeance?.limite, cle).toBeNull();
      expect(echeance?.quand, cle).toBeTruthy();
    }
  });

  it("déclare la formalité elle-même dans les trente jours", () => {
    const echeances = echeancesDe({
      nature: "definitive",
      dateCessation: "2026-05-14",
      periodicite: "mensuelle",
      commerciale: false,
      assujettiTva: false,
      agentCommercial: false,
    });
    expect(echeances[0].cle).toBe("declaration");
    expect(echeances[0].limite).toBe("2026-06-13");
  });
});

describe("la déclaration récapitulative", () => {
  it("porte l'entreprise, la date, le motif et les échéances", () => {
    const texte = texteDu(
      genererDocument("cessation-declaration.docx", donneesDeLaCessation(CONTEXTE))
    );

    expect(texte).toContain("ATELIER CAMILLE");
    expect(texte).toContain("Je soussignée Madame Camille DURAND");
    expect(texte).toContain("14 mai 2026");
    expect(texte).toContain("cesser définitivement");
    expect(texte).toContain("R. 123-51");
    // Le calendrier y figure, daté.
    expect(texte).toContain("Dernière déclaration de chiffre d'affaires");
    expect(texte).toContain("30 juillet 2026");
  });

  it("dit la suspension comme une suspension, sans fermer le SIRET", () => {
    const texte = texteDu(
      genererDocument(
        "cessation-declaration.docx",
        donneesDeLaCessation({ ...CONTEXTE, nature: "temporaire" })
      )
    );

    expect(texte).toContain("suspendre temporairement");
    expect(texte).toContain("ne ferme pas mon numéro SIRET");
    expect(texte).not.toContain("cesser définitivement");
  });

  it("s'accorde au masculin quand l'entrepreneur est un homme", () => {
    const texte = texteDu(
      genererDocument(
        "cessation-declaration.docx",
        donneesDeLaCessation({
          ...CONTEXTE,
          entrepreneur: { ...CONTEXTE.entrepreneur, civilite: "Monsieur", nom: "MARTIN" },
        })
      )
    );

    expect(texte).toContain("Je soussigné Monsieur");
    expect(texte).toContain("inscrit sous le numéro");
  });

  it("ne mentionne la TVA et le registre des agents que s'ils s'appliquent", () => {
    const sans = texteDu(
      genererDocument("cessation-declaration.docx", donneesDeLaCessation(CONTEXTE))
    );
    expect(sans).not.toContain("redevable de la taxe sur la valeur ajoutée");

    const avec = texteDu(
      genererDocument(
        "cessation-declaration.docx",
        donneesDeLaCessation({
          ...CONTEXTE,
          valeurs: { ...CONTEXTE.valeurs, assujettiTva: "Oui", agentCommercial: "Oui" },
        })
      )
    );
    expect(avec).toContain("redevable de la taxe sur la valeur ajoutée");
    expect(avec).toContain("agents commerciaux");
  });
});

describe("le pouvoir", () => {
  it("ne vaut que pour cette formalité", () => {
    const texte = texteDu(
      genererDocument("cessation-pouvoir.docx", donneesDeLaCessation(CONTEXTE))
    );

    expect(texte).toContain("Madame Camille DURAND");
    expect(texte).toContain("la cessation définitive");
    expect(texte).toContain("guichet des formalités des entreprises");
    expect(texte).toContain("prend fin à son accomplissement");
  });
});

describe("les actes et la couverture des gabarits", () => {
  it("deux pièces, quelle que soit la nature", () => {
    expect(actesDeLaCessation("definitive").map((a) => a.gabarit)).toEqual(
      GABARITS_DE_CESSATION
    );
    expect(actesDeLaCessation("temporaire")[0].titre).toContain("suspension");
  });

  const GABARITS = path.join(process.cwd(), "..", "templates");
  const fichiers = readdirSync(GABARITS).filter((f) => f.startsWith("cessation-"));
  const fournis = new Set(Object.keys(donneesDeLaCessation(CONTEXTE)));

  it("les deux gabarits sont là", () => {
    expect(fichiers.sort()).toEqual([...GABARITS_DE_CESSATION].sort());
  });

  for (const fichier of fichiers) {
    it(fichier + " ne demande rien que le domaine ne donne", () => {
      const xml = new PizZip(readFileSync(path.join(GABARITS, fichier)))
        .file("word/document.xml")!
        .asText();
      const texte = xml.replace(/<[^>]+>/g, "");

      // Les champs d'une boucle sont fournis par ses éléments, non par la racine.
      const DANS_UNE_BOUCLE = ["INTITULE", "QUAND", "EXPLICATION"];

      const inconnus = new Set<string>();
      for (const trouve of texte.matchAll(/\{\{([^{}]{1,60})\}\}/g)) {
        const cle = trouve[1];
        if (cle.startsWith("/")) continue;
        const nom = cle.replace(/^[#^]/, "");
        if (DANS_UNE_BOUCLE.includes(nom)) continue;
        if (!fournis.has(nom)) inconnus.add(nom);
      }

      expect([...inconnus].sort(), "champs absents du domaine").toEqual([]);
    });
  }
});
