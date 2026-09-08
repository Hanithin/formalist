import { describe, it, expect } from "vitest";
import { natureLisible } from "@/domain/modification/actes";

/**
 * Le nom d'un acte, tel qu'on peut le montrer.
 *
 * Le registre national publie souvent le nom du fichier tel qu'il était sur la machine
 * du déposant. L'écran l'affichait brut, et l'avocat devait lire un horodatage ISO pour
 * reconnaître ses propres actes.
 */
describe("la nature d'un acte du registre", () => {
  it("retire le numéro d'ordre, l'horodatage et la dénomination", () => {
    expect(
      natureLisible(
        "11PV_AG_modification_BLUE_SHARK_ADVISORY_2026-02-18T17-05-36-466Z",
        "BLUE SHARK ADVISORY"
      )
    ).toBe("PV AG modification");
  });

  it("se débrouille sans la dénomination", () => {
    expect(natureLisible("5Capital_Blue_Shark_Advisory_2026-01-27T18-42-39-706Z")).toBe(
      "Capital Blue Shark Advisory"
    );
  });

  it("laisse intacte une nature déjà lisible", () => {
    expect(natureLisible("Statuts constitutifs")).toBe("Statuts constitutifs");
  });

  /* Mieux vaut un nom illisible qu'une ligne vide : on ne sait plus quoi cliquer. */
  it("rend la nature d'origine quand il ne resterait rien", () => {
    expect(natureLisible("2026-01-27T18-42-39-706Z")).toBe("2026-01-27T18-42-39-706Z");
  });
});
