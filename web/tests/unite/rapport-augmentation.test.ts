import { describe, expect, it } from "vitest";
import { actesAProduire, MODELE_RAPPORT_AUGMENTATION } from "@/domain/modification/gabarit";
import { regimeDeLAugmentation } from "@/domain/modification/souscription";
import type { Valeurs } from "@/domain/modification/types";

/**
 * Le rapport du dirigeant sur l'augmentation de capital.
 *
 * L'assemblée d'une société par actions statue « sur le rapport » du dirigeant - article
 * L. 225-129 - quelle que soit la répartition des souscriptions, et l'article R. 225-113
 * en fixe le contenu : les motifs de l'opération et la marche des affaires sociales.
 */

const proportion: Valeurs = {
  modeAugmentation: "Apport en numéraire",
  souscripteursAugm: "Les associés actuels, à proportion de leurs droits",
};

const gabarits = (forme: string, valeurs: Valeurs) =>
  actesAProduire(["augmentation_capital"], forme, valeurs, 2, []).map((a) => a.gabarit);

describe("le rapport est dû pour toute augmentation d'une société par actions", () => {
  it("le produit quand chacun souscrit à proportion", () => {
    expect(gabarits("SAS", proportion)).toContain(MODELE_RAPPORT_AUGMENTATION);
  });

  it("le produit pour une incorporation de réserves", () => {
    expect(gabarits("SAS", { modeAugmentation: "Incorporation de réserves" })).toContain(
      MODELE_RAPPORT_AUGMENTATION
    );
  });

  it("le produit pour un apport en nature", () => {
    expect(gabarits("SAS", { modeAugmentation: "Apport en nature" })).toContain(
      MODELE_RAPPORT_AUGMENTATION
    );
  });

  /* Le droit préférentiel est propre aux sociétés par actions. */
  it("ne le produit pas dans une SARL", () => {
    expect(gabarits("SARL", proportion)).not.toContain(MODELE_RAPPORT_AUGMENTATION);
  });
});

describe("le régime du droit préférentiel", () => {
  /* Rien n'est souscrit : il n'y a rien à écarter. */
  it("est sans objet quand l'augmentation ne se souscrit pas", () => {
    expect(regimeDeLAugmentation("SAS", { modeAugmentation: "Incorporation de réserves" }).regime).toBe(
      "sans-objet"
    );
    expect(regimeDeLAugmentation("SAS", { modeAugmentation: "Apport en nature" }).regime).toBe(
      "sans-objet"
    );
  });

  /* Tant que la question n'a pas de réponse, on ne suppose pas la réponse. */
  it("est sans objet tant que l'on ne sait pas qui souscrit", () => {
    expect(regimeDeLAugmentation("SAS", { modeAugmentation: "Apport en numéraire" }).regime).toBe(
      "sans-objet"
    );
  });

  it("s'exerce quand chacun souscrit à proportion", () => {
    expect(regimeDeLAugmentation("SAS", proportion).regime).toBe("exerce");
  });
});
