import { describe, expect, it } from "vitest";
import {
  actesAProduire,
  MODELE_BULLETIN_SOUSCRIPTION,
  MODELE_FEUILLE_PRESENCE,
} from "@/domain/modification/gabarit";
import { piecesAFournir } from "@/domain/modification/formalites";
import { SOUSCRIPTEURS, VOIES_DU_DROIT_PREFERENTIEL } from "@/domain/modification/souscription";
import type { Valeurs } from "@/domain/modification/types";

const gabarits = (forme: string, valeurs: Valeurs, associes = 2) =>
  actesAProduire(["augmentation_capital"], forme, valeurs, associes, []).map((a) => a.gabarit);

/**
 * Le bulletin de souscription.
 *
 * L'article L. 225-143 le veut pour toute souscription à une augmentation en numéraire,
 * et L. 225-146 fait établir le certificat du dépositaire sur sa présentation : sans lui,
 * la banque n'atteste rien.
 */
describe("les bulletins de souscription", () => {
  it("sont produits pour un apport en numéraire", () => {
    expect(gabarits("SAS", { modeAugmentation: "Apport en numéraire", souscripteursAugm: SOUSCRIPTEURS[0] })).toContain(
      MODELE_BULLETIN_SOUSCRIPTION
    );
  });

  /* Une compensation de créances est une souscription, libérée autrement. */
  it("le sont aussi pour une compensation de créances", () => {
    expect(gabarits("SAS", { modeAugmentation: "Compensation de créances", souscripteursAugm: SOUSCRIPTEURS[0] })).toContain(
      MODELE_BULLETIN_SOUSCRIPTION
    );
  });

  /* Une incorporation de réserves ne se souscrit pas : rien n'y est versé. */
  it("ne le sont pas pour une incorporation de réserves", () => {
    expect(gabarits("SAS", { modeAugmentation: "Incorporation de réserves" })).not.toContain(
      MODELE_BULLETIN_SOUSCRIPTION
    );
  });

  it("ne le sont pas dans une société de personnes", () => {
    expect(gabarits("SARL", { modeAugmentation: "Apport en numéraire", souscripteursAugm: SOUSCRIPTEURS[0] })).not.toContain(
      MODELE_BULLETIN_SOUSCRIPTION
    );
  });
});

/**
 * La feuille de présence, celle que le procès-verbal cite depuis toujours.
 */
describe("la feuille de présence", () => {
  it("accompagne une assemblée", () => {
    expect(gabarits("SAS", { modeAugmentation: "Apport en numéraire" }, 2)).toContain(
      MODELE_FEUILLE_PRESENCE
    );
  });

  /* L'associé unique décide seul : sa décision ne dresse aucune liste de présents. */
  it("ne suit pas la décision d'un associé unique", () => {
    expect(gabarits("SASU", { modeAugmentation: "Apport en numéraire" }, 1)).not.toContain(
      MODELE_FEUILLE_PRESENCE
    );
  });
});

/**
 * Le rapport spécial du commissaire aux comptes.
 *
 * Le procès-verbal écrit que l'assemblée en a pris connaissance : le dossier doit le
 * contenir, faute de quoi l'acte affirme l'existence d'une pièce absente.
 */
describe("le rapport spécial du commissaire aux comptes", () => {
  const pieces = (valeurs: Valeurs) =>
    piecesAFournir(["augmentation_capital"], valeurs).map((p) => p.identifiant);

  it("est réclamé quand l'assemblée supprime le droit préférentiel", () => {
    expect(
      pieces({
        modeAugmentation: "Apport en numéraire",
        voieDuDroitPreferentiel: VOIES_DU_DROIT_PREFERENTIEL[1],
        commissaireDps: "Cabinet AUDIT",
      })
    ).toContain("commissaire-dps");
  });

  /* Une renonciation individuelle maintient le droit : aucun commissaire n'intervient. */
  it("ne l'est pas quand les associés renoncent individuellement", () => {
    expect(
      pieces({
        modeAugmentation: "Apport en numéraire",
        voieDuDroitPreferentiel: VOIES_DU_DROIT_PREFERENTIEL[0],
      })
    ).not.toContain("commissaire-dps");
  });
});
