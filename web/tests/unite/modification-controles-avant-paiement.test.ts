import { describe, it, expect } from "vitest";
import { verifierModification } from "@/domain/modification/verification";
import { anomaliesDuPvAge } from "@/domain/modification/pv-age";
import type { ContexteGabarit } from "@/domain/modification/gabarit";

/**
 * Les incohérences du procès-verbal se relèvent avant le règlement.
 *
 * Elles ne portaient que sur la production des actes, qui suit le paiement : un
 * dossier qui les heurtait passait la saisie, passait la carte bancaire, puis
 * échouait à la génération. Le client avait payé et n'avait rien ; l'avocat recevait
 * un dossier sans pièces, sans savoir pourquoi.
 */

const SOCIETE = {
  denomination: "ESSAI CONTRÔLES",
  forme: "SAS",
  siren: "552100554",
  adresse: "12 rue de la Paix",
  codePostal: "75002",
  ville: "Paris",
  capital: 50000,
};

const ASSEMBLEE = {
  date: "2026-09-15",
  associes: [
    { nature: "physique" as const, civilite: "Monsieur", prenom: "Jean", nom: "DUPONT", parts: 500 },
    { nature: "physique" as const, civilite: "Madame", prenom: "Claire", nom: "MARTIN", parts: 500 },
  ],
};

/** Une augmentation régulière : 5 000 titres à 10 euros, de 50 000 à 100 000. */
const AUGMENTATION = {
  modeAugmentation: "Apport en numéraire",
  capitalActuelAugm: "50000",
  nouveauCapitalAugm: "100000",
  nbPartsNouvelles: "5000",
  valeurNominaleAugm: "10",
  dateEffetAugm: "2026-10-01",
  banqueDepot: "Banque Essai",
  dateDepotFonds: "2026-09-10",
};

function anomalies(valeurs: Record<string, string>) {
  return verifierModification(["augmentation_capital"], valeurs, SOCIETE, ASSEMBLEE, []);
}

describe("la chaîne des capitaux, relevée dans le formulaire", () => {
  it("laisse passer une augmentation qui part du bon capital", () => {
    expect(anomalies(AUGMENTATION)).toEqual([]);
  });

  it("refuse un capital de départ qui n'est pas celui de la société", () => {
    /*
     * « Capital actuel » est un champ libre : rien n'empêche d'y taper le capital
     * d'avant la dernière opération. L'acte partait alors d'un chiffre que le Kbis
     * dément, et la contradiction se découvrait au greffe.
     */
    const manques = anomalies({ ...AUGMENTATION, capitalActuelAugm: "40000" });

    expect(manques.map((a) => a.champ)).toContain("capitalActuelAugm");
    expect(manques[0].message).toContain("40 000");
    expect(manques[0].message).toContain("50 000");
  });

  it("refuse un nouveau capital que le nombre de titres ne donne pas", () => {
    // 5 000 titres à 10 euros font 50 000 : le capital ne peut pas finir à 120 000.
    const manques = anomalies({ ...AUGMENTATION, nouveauCapitalAugm: "120000" });

    expect(manques.map((a) => a.champ)).toContain("nouveauCapitalAugm");
  });

  it("dit que la prime d'émission ne grossit pas le capital", () => {
    /*
     * L'erreur classique : on ajoute la prime au capital. Elle va en réserve, le
     * capital ne bouge que du nominal.
     */
    const manques = anomalies({
      ...AUGMENTATION,
      primeEmission: "20000",
      nouveauCapitalAugm: "120000",
    });

    expect(manques[0].message).toContain("prime d'émission");
  });

  it("désigne un champ que le formulaire sait montrer", () => {
    /*
     * Une anomalie qui nomme « r_augmentation_numeraire » - le bloc du modèle - ne
     * s'ancre sur aucune case : l'utilisateur voit un refus sans savoir où corriger.
     */
    for (const manque of anomalies({ ...AUGMENTATION, capitalActuelAugm: "40000" })) {
      expect(manque.champ).not.toMatch(/^r_/);
    }
  });
});

describe("l'assemblée, quand l'appelant ne la connaît pas", () => {
  it("ne reproche pas une absence d'associés qu'on ne lui a pas dite", () => {
    /*
     * Un objet vide et une assemblée réellement vide se ressemblent. Reprocher la
     * seconde à qui n'a transmis ni l'une ni l'autre ferait un refus sans réponse
     * possible.
     */
    const manques = verifierModification(["augmentation_capital"], AUGMENTATION, SOCIETE);
    expect(manques).toEqual([]);
  });

  it("la reproche quand elle est transmise et vide", () => {
    const manques = verifierModification(
      ["augmentation_capital"],
      AUGMENTATION,
      SOCIETE,
      { date: "2026-09-15", associes: [] },
      []
    );
    expect(manques.map((a) => a.champ)).toContain("assemblee-associes");
  });
});

describe("les avertissements ne bloquent pas", () => {
  it("laisse passer une réduction non motivée par des pertes", () => {
    /*
     * Elle ouvre un délai d'opposition aux créanciers - une conséquence, pas une
     * faute. L'inscrire au journal suffit ; l'ériger en anomalie empêcherait une
     * opération parfaitement régulière.
     */
    const contexte = {
      societe: SOCIETE,
      assemblee: ASSEMBLEE,
      codes: ["reduction_capital"],
      valeurs: {
        capitalActuelRed: "50000",
        nouveauCapitalRed: "30000",
        motifReduction: "Remboursement aux associés",
        nbPartsAnnulees: "2000",
        dateEffetRed: "2026-10-01",
      },
      cessions: [],
    } as unknown as ContexteGabarit;

    expect(anomaliesDuPvAge(contexte)).toEqual([]);
  });
});
