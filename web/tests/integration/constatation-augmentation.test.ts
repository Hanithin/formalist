import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { actesAProduire, donneesDuGabarit } from "@/domain/modification/gabarit";
import { genererDocument } from "@/infrastructure/documents/generation";
import type { ContratAir } from "@/domain/modification/air";
import type { Valeurs } from "@/domain/modification/types";
import { verifierModification } from "@/domain/modification/verification";
import { avisAPublier } from "@/domain/modification/annonce";

/* Le dossier réel qui a servi de modèle : trois valorisations, vingt et un souscripteurs. */
const AIR: ContratAir[] = [
  { investisseur: "SFDI", montant: 100_000, valorisation: 2_000_000 },
  { investisseur: "SFDI - tranche complémentaire", montant: 50_000, valorisation: 2_500_000 },
  { investisseur: "NovaTerra Nouvelle SL", montant: 100_000, valorisation: 2_000_000 },
  { investisseur: "FIGTUS", montant: 17_500, valorisation: 3_500_000 },
  { investisseur: "Eliot BERDAH", montant: 626, valorisation: 3_500_000 },
];

const SOCIETE = {
  denomination: "LEND ONCHAIN",
  forme: "SAS",
  siren: "940577380",
  capital: 1000,
  adresse: "66 avenue des Champs-Élysées",
  codePostal: "75008",
  ville: "Paris",
  villeRcs: "Paris",
};

const VALEURS: Valeurs = {
  airActionsExistantes: 1000,
  airValeurNominale: 1,
  airDivision: "1 000",
  airEvenement: "Clôture du tour de financement, par accord des parties",
  airDateEvenement: "2026-09-30",
  airDroitPreferentiel: "Chaque associé y renonce individuellement, au profit des souscripteurs",
  airDecisionEmission: "N'a pas fait l'objet d'une décision collective : à ratifier",
  airPacte: "Un pacte existe et son adhésion conditionne la conversion",
  airLiberation: "Par imputation sur le prix des bons, déjà versé",
  signatairePrenom: "Lucas",
  signataireNom: "LARÉGINIE",
  signataireQualite: "président",
};

/* Les actes communs à toute modification : la feuille de présence et le pouvoir. */
const AUTRES = ["Feuille de présence", "Pouvoir"];

/** Les seuls actes propres à la constatation, dans leur ordre de production. */
function actesDeLaConstatation(valeurs: Valeurs): string[] {
  return actesAProduire(["constatation_augmentation"], "SAS", valeurs, 2)
    .filter((acte) => acte.gabarit.startsWith("modif-air-"))
    .map((acte) => acte.titre);
}

function contexte(valeurs: Valeurs = VALEURS, air = AIR) {
  return {
    societe: SOCIETE,
    assemblee: {
      date: "2026-09-30",
      associes: [
        { civilite: "Monsieur", prenom: "Nathan", nom: "ZEITOUN", parts: 500 },
        { civilite: "Monsieur", prenom: "Lucas", nom: "LARÉGINIE", parts: 500 },
      ],
    },
    codes: ["constatation_augmentation"],
    valeurs,
    air,
  };
}

describe("la constatation d'une augmentation de capital", () => {
  /*
   * Le point qui distingue ce changement de tous les autres.
   *
   * L'augmentation est réalisée du seul fait de l'exercice des bons : un procès-verbal
   * d'assemblée la ferait décider une seconde fois, et la daterait du jour de
   * l'assemblée plutôt que de celui de l'exercice.
   */
  it("ne produit aucun procès-verbal d'assemblée", () => {
    const actes = actesAProduire(["constatation_augmentation"], "SAS", VALEURS, 2);
    expect(actes.some((a) => a.titre.includes("Procès-verbal"))).toBe(false);
  });

  it("produit le procès-verbal dès qu'un autre changement se décide", () => {
    const actes = actesAProduire(["constatation_augmentation", "denomination"], "SAS", VALEURS, 2);
    expect(actes.some((a) => a.titre.includes("Procès-verbal"))).toBe(true);
  });

  it("produit les actes de la voie complète, jusqu'aux titres inscrits", () => {
    const titres = actesDeLaConstatation(VALEURS);
    /* Les quatre premiers décident et constatent ; les deux derniers font ce que la
       constatation présuppose - les titres portés au registre, et la pièce que chaque
       souscripteur détient en propre pour en justifier. */
    expect(titres).toEqual([
      "Décisions collectives des associés",
      "Renonciations individuelles au droit préférentiel de souscription",
      "Avenants de conversion anticipée",
      "Décision du président constatant l'augmentation de capital",
      "Attestations d'inscription en compte",
      "Inscriptions au registre des mouvements de titres",
    ]);
  });

  /*
   * Une émission régulièrement décidée n'a rien à ratifier, et le droit préférentiel y
   * a été réglé en son temps : ni décisions collectives, ni renonciations.
   */
  it("s'en tient à la constatation quand l'émission était régulière", () => {
    const titres = actesAProduire(
      ["constatation_augmentation"],
      "SAS",
      {
        ...VALEURS,
        airDivision: "Aucune division",
        airDecisionEmission: "A été décidée par les associés, procès-verbal à l'appui",
        airEvenement: "Levée de fonds ultérieure",
        airPacte: "Il n'y a pas de pacte",
      },
      2
    ).map((a) => a.titre);
    /* L'attestation d'inscription en compte accompagne toute conversion : c'est la
       seule pièce que le souscripteur détient en propre, et elle ne dépend d'aucune
       des conditions qui font naître les autres actes. */
    expect(titres.filter((t) => !AUTRES.some((a) => t.includes(a)))).toEqual([
      "Décision du président constatant l'augmentation de capital",
      "Attestations d'inscription en compte",
      "Inscriptions au registre des mouvements de titres",
    ]);
  });

  it("chiffre le capital d'après sur les actions, non sur le capital d'avant", () => {
    const donnees = donneesDuGabarit(contexte());
    /* 1 000 actions divisées par mille, plus ce que les accords créent. */
    expect(donnees.AIR_ACTIONS_AVANT).toBe("1 000 000");
    expect(donnees.AIR_NOMINALE).toBe("0,001");
    expect(donnees.AIR_CAPITAL_AVANT).toBe("1 000");
    expect(Number((donnees.AIR_ACTIONS_APRES as string).replace(/\D/g, ""))).toBeGreaterThan(1_000_000);
  });

  it("donne à chaque souscripteur le prix de sa propre valorisation", () => {
    const lignes = donneesDuGabarit(contexte()).AIR_LIGNES as { INVESTISSEUR: string; PRIX: string }[];
    const sfdi = lignes.find((l) => l.INVESTISSEUR === "SFDI")!;
    const figtus = lignes.find((l) => l.INVESTISSEUR === "FIGTUS")!;
    expect(sfdi.PRIX).not.toBe(figtus.PRIX);
  });

  it("rend chacun des actes sans laisser de balise", () => {
    const donnees = donneesDuGabarit(contexte());
    for (const acte of actesAProduire(["constatation_augmentation"], "SAS", VALEURS, 2).filter(
      (a) => a.gabarit.startsWith("modif-air-")
    )) {
      const docx = genererDocument(acte.gabarit, donnees);
      expect(docx.length).toBeGreaterThan(3_000);
      const texte = extraireLeTexte(docx);
      expect(texte).not.toContain("{{");
      expect(texte).not.toContain("undefined");
    }
  });

  /*
   * Le tableau annexé porte une ligne par souscripteur.
   *
   * C'est la seule pièce qui relie une action à l'argent qui l'a payée : une boucle qui
   * ne se déroule pas laisserait des actes affirmant un capital sans dire d'où il
   * vient.
   */
  it("déroule le tableau des souscripteurs dans les actes", () => {
    const donnees = donneesDuGabarit(contexte());
    const docx = genererDocument("modif-air-constatation.docx", donnees);
    const texte = extraireLeTexte(docx);
    for (const air of AIR) expect(texte).toContain(air.investisseur);
  });
});

/** Le texte d'un docx : le XML du document, balises retirées. */
function extraireLeTexte(docx: Buffer): string {
  const xml = new PizZip(docx).file("word/document.xml")!.asText();
  return xml.replace(/<[^>]+>/g, "");
}

describe("ce qui empêche de produire les actes", () => {
  const societe = { ...SOCIETE, capital: 1000 };

  it("réclame au moins un accord", () => {
    const manques = verifierModification(
      ["constatation_augmentation"],
      VALEURS,
      societe,
      { date: "2026-09-30", associes: [{ civilite: "Monsieur", prenom: "Lucas", nom: "L", parts: 1000 }] },
      [],
      []
    );
    expect(manques.some((m) => m.champ === "air")).toBe(true);
  });

  /*
   * L'arrondi qui spolie, arrêté avant la signature.
   *
   * À mille actions, un ticket de six cent vingt-six euros vaut un cinquième d'action.
   * L'acte sortirait avec zéro action en face d'un souscripteur qui a payé.
   */
  it("refuse un arrondi qui écarte un souscripteur de ses droits", () => {
    const manques = verifierModification(
      ["constatation_augmentation"],
      { ...VALEURS, airDivision: "Aucune division" },
      societe,
      { date: "2026-09-30", associes: [{ civilite: "Monsieur", prenom: "Lucas", nom: "L", parts: 1000 }] },
      [],
      AIR
    );
    expect(manques.some((m) => m.champ === "air")).toBe(true);
  });

  it("laisse passer le dossier une fois le nominal divisé", () => {
    const manques = verifierModification(
      ["constatation_augmentation"],
      VALEURS,
      societe,
      { date: "2026-09-30", associes: [{ civilite: "Monsieur", prenom: "Lucas", nom: "L", parts: 1000 }] },
      [],
      AIR
    );
    expect(manques.filter((m) => m.champ === "air")).toEqual([]);
  });

  /* Un appelant qui ignore les accords ne se voit pas reprocher leur absence. */
  it("ne reproche rien quand les accords ne lui sont pas transmis", () => {
    const manques = verifierModification(["constatation_augmentation"], VALEURS, societe);
    expect(manques.some((m) => m.champ === "air")).toBe(false);
  });
});

describe("l'avis à publier", () => {
  it("nomme l'exercice des bons, non un apport", () => {
    const avis = avisAPublier({
      societe: SOCIETE,
      codes: ["constatation_augmentation"],
      valeurs: VALEURS,
      air: AIR,
      dateAssemblee: "2026-09-30",
      ressortActuel: "Paris",
    });
    const texte = avis.map((a) => a.texte).join(" ");
    expect(texte).toContain("exercice de bons de souscription d'actions");
    expect(texte).toContain("divisée par 1 000");
    expect(texte).not.toContain("apport en numéraire");
  });
});
