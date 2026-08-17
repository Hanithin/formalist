import { describe, it, expect } from "vitest";
import { champsASaisir } from "@/domain/modification/types";
import { piecesAFournir, obligationsParticulieres } from "@/domain/modification/formalites";
import { verifierChamps } from "@/domain/modification/verification";

/**
 * L'augmentation de capital, selon son mode.
 *
 * Trois modes étaient proposés et aucun champ n'en dépendait : le texte d'aide parlait
 * du commissaire aux apports et de l'attestation de dépôt, mais rien ne recueillait ni
 * le nom du commissaire ni la banque. Les actes sortaient à trous, et la compensation
 * de créances - l'incorporation du compte courant d'un associé, le cas le plus fréquent
 * dans une petite société - n'existait pas.
 */

const identifiants = (mode: string, autres: Record<string, string> = {}) =>
  champsASaisir(["augmentation_capital"], { modeAugmentation: mode, ...autres }).map(
    (c) => c.identifiant
  );

describe("les modes d'augmentation", () => {
  it("la compensation de créances est proposée", () => {
    const champs = champsASaisir(["augmentation_capital"], {});
    const mode = champs.find((c) => c.identifiant === "modeAugmentation")!;
    expect(mode.options).toEqual([
      "Apport en numéraire",
      "Compensation de créances",
      "Incorporation de réserves",
      "Apport en nature",
    ]);
  });

  it("chaque mode demande ce qu'il implique, et rien d'autre", () => {
    expect(identifiants("Apport en numéraire")).toContain("banqueDepot");
    expect(identifiants("Apport en numéraire")).not.toContain("commissaireApports");

    expect(identifiants("Compensation de créances")).toContain("titulaireCreance");
    expect(identifiants("Compensation de créances")).toContain("dateArreteCompte");
    expect(identifiants("Compensation de créances")).not.toContain("banqueDepot");

    expect(identifiants("Incorporation de réserves")).toContain("posteIncorpore");
    expect(identifiants("Incorporation de réserves")).not.toContain("descriptionApport");

    expect(identifiants("Apport en nature")).toContain("descriptionApport");
    expect(identifiants("Apport en nature")).toContain("dispenseCommissaire");
  });

  it("le commissaire ne se nomme que s'il n'y a pas dispense", () => {
    /*
     * La dispense suppose l'unanimité, aucun apport au-dessus de 30 000 € et un total
     * sous la moitié du capital (art. L. 223-33 renvoyant à L. 223-9, art. D. 223-6-1).
     */
    const avec = identifiants("Apport en nature", {
      dispenseCommissaire: "Non, un commissaire est désigné",
    });
    expect(avec).toContain("commissaireApports");

    const sans = identifiants("Apport en nature", { dispenseCommissaire: "Oui, à l'unanimité" });
    expect(sans).not.toContain("commissaireApports");
  });

  it("un champ hors du mode choisi n'est jamais réclamé", () => {
    // Sinon l'étape ne se passe plus : elle exige ce qu'elle n'affiche pas.
    const manques = verifierChamps(["augmentation_capital"], {
      modeAugmentation: "Incorporation de réserves",
      capitalActuelAugm: 10000,
      nouveauCapitalAugm: 20000,
      posteIncorpore: "Réserves",
      montantIncorpore: 10000,
      dateEffetAugm: "2026-09-15",
    });
    expect(manques).toEqual([]);
  });
});

describe("les pièces suivent le mode", () => {
  it("la compensation de créances appelle l'arrêté de compte", () => {
    const pieces = piecesAFournir(["augmentation_capital"], {
      modeAugmentation: "Compensation de créances",
    });
    expect(pieces.map((p) => p.identifiant)).toContain("arrete-compte");
  });

  it("un apport en nature dispensé ne réclame pas le rapport", () => {
    /*
     * Le réclamer bloquerait un dossier sur une pièce que la loi n'exige pas dès lors
     * que les associés ont décidé la dispense à l'unanimité.
     */
    const avec = piecesAFournir(["augmentation_capital"], {
      modeAugmentation: "Apport en nature",
      dispenseCommissaire: "Non, un commissaire est désigné",
    });
    expect(avec.map((p) => p.identifiant)).toContain("commissaire-apports");

    const sans = piecesAFournir(["augmentation_capital"], {
      modeAugmentation: "Apport en nature",
      dispenseCommissaire: "Oui, à l'unanimité",
    });
    expect(sans.map((p) => p.identifiant)).not.toContain("commissaire-apports");
  });

  it("la dispense s'accompagne de ce qu'elle coûte", () => {
    // Cinq ans de responsabilité solidaire sur la valeur retenue : on le dit avant.
    const dits = obligationsParticulieres(["augmentation_capital"], {
      modeAugmentation: "Apport en nature",
      dispenseCommissaire: "Oui, à l'unanimité",
    });
    expect(dits.join(" ")).toContain("solidairement");
    expect(dits.join(" ")).toContain("cinq ans");
    expect(dits.join(" ")).toContain("L. 223-9");
  });
});
