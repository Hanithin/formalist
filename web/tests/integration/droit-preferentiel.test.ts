import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import {
  regimeDuDroitPreferentiel,
  augmentationSouscrite,
  SOUSCRIPTEURS,
  VOIES_DU_DROIT_PREFERENTIEL,
} from "@/domain/modification/souscription";
import { actesAProduire, donneesDuGabarit } from "@/domain/modification/gabarit";
import { donneesDuPvAge } from "@/domain/modification/pv-age";
import { verifierModification } from "@/domain/modification/verification";
import { rendreLePvAge } from "@/infrastructure/documents/modeles-cabinet";
import { genererDocument } from "@/infrastructure/documents/generation";
import type { ContexteGabarit } from "@/domain/modification/gabarit";

/**
 * Qui souscrit les titres nouveaux, et ce que le droit en tire.
 *
 * Le formulaire ne le demandait pas, et le procès-verbal sortait sans un mot du droit
 * préférentiel de souscription - alors que dès qu'un tiers entre au capital, ou qu'un
 * associé prend plus que sa part, ce droit doit être écarté.
 *
 * La façon de l'écarter décide de la suite. Une renonciation individuelle maintient le
 * droit et n'appelle aucun commissaire aux comptes ; une suppression par l'assemblée
 * l'écarte pour tous et en exige un, que la société doit désigner si elle n'en a pas.
 * Ignorer cette nuance envoie chercher un commissaire dont on n'a pas besoin.
 */

function texteDu(docx: Buffer): string {
  return new PizZip(docx)
    .file("word/document.xml")!
    .asText()
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[  ]/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const SOCIETE = (forme: string) => ({
  denomination: "ATELIER MERIDIEN",
  forme,
  siren: "552100554",
  adresse: "12 rue Vauban",
  codePostal: "69006",
  ville: "Lyon",
  capital: 20000,
  villeRcs: "Lyon",
});

const ASSEMBLEE = {
  date: "2026-10-10",
  totalParts: 2000,
  associes: [
    { nature: "physique", civilite: "Monsieur", prenom: "Jean", nom: "DUPONT", parts: 2000 },
  ],
};

const BASE: Record<string, string> = {
  capitalActuelAugm: "20000",
  nouveauCapitalAugm: "50000",
  modeAugmentation: "Apport en numéraire",
  banqueDepot: "Crédit Mutuel",
  dateDepotFonds: "2026-10-05",
  dateEffetAugm: "2026-10-10",
  nbPartsNouvelles: "3000",
  valeurNominaleAugm: "10",
  souscripteursNommes: "Monsieur Marc BERTIN, 3 000 actions de 10 euros",
  motifsAugmentation: "financer l'ouverture d'un second atelier",
};

function contexte(forme: string, sur: Record<string, string>): ContexteGabarit {
  return {
    societe: SOCIETE(forme),
    assemblee: ASSEMBLEE,
    codes: ["augmentation_capital"],
    valeurs: { ...BASE, ...sur },
    cessions: [],
  } as unknown as ContexteGabarit;
}

const A_PROPORTION = { souscripteursAugm: SOUSCRIPTEURS[0] };
const RENONCIATION = {
  souscripteursAugm: SOUSCRIPTEURS[2],
  voieDuDroitPreferentiel: VOIES_DU_DROIT_PREFERENTIEL[0],
};
const SUPPRESSION = {
  souscripteursAugm: SOUSCRIPTEURS[2],
  voieDuDroitPreferentiel: VOIES_DU_DROIT_PREFERENTIEL[1],
  commissaireDps: "Cabinet AUDIT RHONE",
};

describe("le régime du droit préférentiel", () => {
  it("n'existe pas dans une société de personnes", () => {
    /* Le code l'organise pour les actions de numéraire : une SARL n'en connaît pas. */
    const regime = regimeDuDroitPreferentiel({
      forme: "SARL",
      souscripteurs: SOUSCRIPTEURS[2],
      voie: "",
    });

    expect(regime.regime).toBe("sans-objet");
    expect(regime.commissaireRequis).toBe(false);
    expect(regime.rapportDuDirigeant).toBe(false);
    expect(regime.explication).toContain("agrément");
  });

  it("s'exerce quand chacun souscrit à proportion", () => {
    const regime = regimeDuDroitPreferentiel({
      forme: "SAS",
      souscripteurs: SOUSCRIPTEURS[0],
      voie: "",
    });

    expect(regime.regime).toBe("exerce");
    expect(regime.rapportDuDirigeant).toBe(false);
  });

  it("se renonce sans commissaire aux comptes", () => {
    /*
     * La nuance qui compte : le droit n'est pas supprimé mais maintenu, et chacun
     * décide pour lui-même. Aucun texte ne prévoit l'intervention d'un commissaire.
     */
    const regime = regimeDuDroitPreferentiel({
      forme: "SAS",
      souscripteurs: SOUSCRIPTEURS[2],
      voie: VOIES_DU_DROIT_PREFERENTIEL[0],
    });

    expect(regime.regime).toBe("renonciation");
    expect(regime.commissaireRequis).toBe(false);
    expect(regime.rapportDuDirigeant).toBe(true);
    expect(regime.article).toContain("L. 225-132");
  });

  it("ne se supprime qu'avec le rapport d'un commissaire", () => {
    const regime = regimeDuDroitPreferentiel({
      forme: "SAS",
      souscripteurs: SOUSCRIPTEURS[2],
      voie: VOIES_DU_DROIT_PREFERENTIEL[1],
    });

    expect(regime.regime).toBe("suppression");
    expect(regime.commissaireRequis).toBe(true);
    expect(regime.article).toContain("L. 225-135");
  });

  it("ne se pose que pour une souscription", () => {
    /* Une incorporation de réserves n'appelle aucun versement, un apport en nature
       se rémunère par des titres attribués à l'apporteur : le droit n'y joue pas. */
    expect(augmentationSouscrite("Apport en numéraire")).toBe(true);
    expect(augmentationSouscrite("Compensation de créances")).toBe(true);
    expect(augmentationSouscrite("Incorporation de réserves")).toBe(false);
    expect(augmentationSouscrite("Apport en nature")).toBe(false);
  });
});

describe("ce que le procès-verbal en dit", () => {
  it("se tait quand chacun souscrit à proportion", () => {
    const texte = texteDu(rendreLePvAge(donneesDuPvAge(contexte("SAS", A_PROPORTION))));
    expect(texte).not.toContain("droit préférentiel");
  });

  it("constate la renonciation, et la dit individuelle", () => {
    const texte = texteDu(rendreLePvAge(donneesDuPvAge(contexte("SAS", RENONCIATION))));

    expect(texte).toContain("déclarent renoncer, à titre individuel");
    expect(texte).toContain("L. 225-132 du code de commerce");
    expect(texte).toContain("Monsieur Marc BERTIN");
    /* Le droit est maintenu : l'acte ne doit pas dire qu'on le supprime. */
    expect(texte).not.toContain("décide de supprimer le droit");
  });

  it("prononce la suppression en citant les deux rapports", () => {
    const texte = texteDu(rendreLePvAge(donneesDuPvAge(contexte("SAS", SUPPRESSION))));

    expect(texte).toContain("du rapport du Président");
    expect(texte).toContain("rapport spécial de Cabinet AUDIT RHONE, commissaire aux comptes");
    expect(texte).toContain("décide de supprimer le droit préférentiel");
    expect(texte).toContain("L. 225-135 et L. 225-138");
  });

  it("constate l'agrément dans une société de personnes", () => {
    const texte = texteDu(
      rendreLePvAge(
        donneesDuPvAge(
          contexte("SARL", {
            souscripteursAugm: SOUSCRIPTEURS[2],
            agrementNouvelAssocie: "Oui, à l'unanimité",
          })
        )
      )
    );

    expect(texte).toContain("L'Assemblée agrée, à l'unanimité");
    /* Et surtout pas un droit préférentiel qu'une SARL n'a pas. */
    expect(texte).not.toContain("droit préférentiel");
  });
});

describe("le rapport du dirigeant", () => {
  const rapportDe = (forme: string, sur: Record<string, string>) => {
    const c = contexte(forme, sur);
    return actesAProduire(c.codes, forme, c.valeurs, 1, []).find((a) =>
      a.gabarit.includes("rapport-augmentation")
    );
  };

  it("n'est pas produit quand il n'y a rien à écarter", () => {
    expect(rapportDe("SAS", A_PROPORTION)).toBeUndefined();
    /* Ni dans une société de personnes, qui ne connaît pas ce droit. */
    expect(rapportDe("SARL", { souscripteursAugm: SOUSCRIPTEURS[2] })).toBeUndefined();
  });

  it("l'est dans les deux cas où le droit est écarté", () => {
    expect(rapportDe("SAS", RENONCIATION)?.titre).toBe(
      "Rapport du président sur l'augmentation de capital"
    );
    expect(rapportDe("SAS", SUPPRESSION)?.titre).toBe(
      "Rapport du président sur l'augmentation de capital"
    );
  });

  it("porte les mentions que le texte réclame", () => {
    const c = contexte("SAS", {
      ...RENONCIATION,
      marcheDesAffaires: "le carnet de commandes couvre le second semestre",
    });
    const texte = texteDu(
      genererDocument("modif-rapport-augmentation.docx", donneesDuGabarit(c))
    );

    expect(texte).toContain("RAPPORT DU PRÉSIDENT");
    expect(texte).toContain("d'un montant de 30 000 euros, pour le porter de 20 000 euros à 50 000 euros");
    expect(texte).toContain("Financer l'ouverture d'un second atelier");
    /* La première lettre se relève : c'est un paragraphe, non une insertion. */
    expect(texte).toContain("Le carnet de commandes couvre le second semestre");
    expect(texte).toContain("l'intervention d'un commissaire aux comptes n'est pas requise");
    expect(texte).toContain("552 100 554");
    expect(texte).toContain("Le Président");
  });

  it("dit la marche des affaires même quand on ne l'a pas décrite", () => {
    /* Une phrase vraie plutôt qu'une rubrique vide, ou un paragraphe inventé. */
    const c = contexte("SAS", RENONCIATION);
    const texte = texteDu(genererDocument("modif-rapport-augmentation.docx", donneesDuGabarit(c)));

    expect(texte).toContain("comptes du dernier exercice clos");
  });
});

describe("ce que la suppression impose", () => {
  it("bloque le dossier tant que le commissaire n'est pas nommé", () => {
    const c = contexte("SAS", { ...SUPPRESSION, commissaireDps: "" });
    const anomalies = verifierModification(
      c.codes,
      c.valeurs,
      c.societe as never,
      ASSEMBLEE as never,
      []
    );

    const manque = anomalies.find((a) => a.champ === "commissaireDps");
    expect(manque).toBeDefined();
    expect(manque!.message).toContain("désigner un");
  });

  it("ne réclame rien sur une renonciation", () => {
    const c = contexte("SAS", RENONCIATION);
    const anomalies = verifierModification(
      c.codes,
      c.valeurs,
      c.societe as never,
      ASSEMBLEE as never,
      []
    );

    expect(anomalies.filter((a) => a.champ === "commissaireDps")).toEqual([]);
  });
});
