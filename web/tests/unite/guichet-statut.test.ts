import { describe, it, expect } from "vitest";
import {
  appelleUnGeste,
  estTermine,
  estUnStatutConnu,
  lireLeStatut,
  STATUTS,
} from "@/domain/guichet/statut";

/**
 * Les onze états du guichet unique, et ce qu'ils appellent.
 *
 * La règle décide de ce que l'avocat voit et de ce qu'on redemande à la
 * synchronisation suivante. Elle se teste sans compte ni jeton : c'est tout l'intérêt
 * de la tenir dans le domaine.
 */
describe("la lecture d'un statut", () => {
  it("range chaque état connu dans une des quatre attentes", () => {
    for (const statut of STATUTS) {
      expect(["en-cours", "a-nous", "acquis", "manque"]).toContain(
        lireLeStatut(statut).attente
      );
    }
  });

  it("distingue ce qui attend le cabinet de ce qui attend l'INPI", () => {
    expect(appelleUnGeste("SIGNATURE_PENDING")).toBe(true);
    expect(appelleUnGeste("PAYMENT_PENDING")).toBe(true);
    expect(appelleUnGeste("AMENDMENT_PENDING")).toBe(true);

    expect(appelleUnGeste("RECEIVED")).toBe(false);
    expect(appelleUnGeste("VALIDATION_PENDING")).toBe(false);
    /* Régularisation transmise : la balle est repassée au valideur. */
    expect(appelleUnGeste("AMENDED")).toBe(false);
  });

  it("sait ce qui ne bougera plus", () => {
    expect(estTermine("VALIDATED")).toBe(true);
    expect(estTermine("REJECTED")).toBe(true);
    expect(estTermine("EXPIRED")).toBe(true);
    expect(estTermine("ERROR")).toBe(true);

    expect(estTermine("PAID")).toBe(false);
    expect(estTermine("SIGNED")).toBe(false);
  });

  /*
   * L'INPI peut ajouter un état sans nous prévenir. Le traiter comme une panne
   * masquerait un dépôt qui avance ; le traiter comme acquis ferait croire à une
   * immatriculation qui n'existe pas.
   */
  it("ne conclut rien d'un état qu'elle ne connaît pas", () => {
    const inconnu = lireLeStatut("QUELQUE_CHOSE_DE_NEUF");
    expect(inconnu.attente).toBe("en-cours");
    expect(inconnu.explication).toContain("QUELQUE_CHOSE_DE_NEUF");
    expect(estTermine("QUELQUE_CHOSE_DE_NEUF")).toBe(false);
  });

  it("lit un état quelle que soit sa casse et ses espaces", () => {
    expect(lireLeStatut(" validated ").attente).toBe("acquis");
    expect(estUnStatutConnu("VALIDATED")).toBe(true);
    expect(estUnStatutConnu("validated")).toBe(false);
  });

  /* Un état vide n'est pas un état : il ne doit surtout pas passer pour acquis. */
  it("ne prend pas l'absence d'état pour un succès", () => {
    expect(lireLeStatut("").attente).toBe("en-cours");
    expect(estTermine("")).toBe(false);
  });
});

/**
 * Les états que le contrat ne publie pas.
 *
 * Le service en rend d'autres que ses treize : un dépôt de démonstration est revenu en
 * `ERROR_DECLARATION_INSEE`. Le repli disait « en cours » pour tous, et un dossier en
 * échec passait pour un dossier qui avance.
 */
describe("un état que le contrat ne publie pas", () => {
  it("appelle un regard quand son nom annonce un échec", () => {
    expect(lireLeStatut("ERROR_DECLARATION_INSEE").attente).toBe("a-nous");
    expect(lireLeStatut("REJECTED_BY_PARTNER").attente).toBe("a-nous");
    expect(appelleUnGeste("ERROR_DECLARATION_INSEE")).toBe(true);
  });

  /*
   * Et jamais pour terminé.
   *
   * Ce même `ERROR_DECLARATION_INSEE` est passé de lui-même à `VALIDATION_PENDING`
   * quelques heures plus tard, numéro national à l'appui. Le tenir pour manqué aurait
   * figé le dossier sur un échec révolu et arrêté toute synchronisation ultérieure.
   */
  it("ne se tient jamais pour terminé", () => {
    expect(estTermine("ERROR_DECLARATION_INSEE")).toBe(false);
    expect(estTermine("SOMETHING_NEW")).toBe(false);
  });

  /* Prudence dans l'autre sens : ce qui ne s'annonce pas comme un échec n'en est pas un. */
  it("reste « en cours » quand rien ne dit le contraire", () => {
    expect(lireLeStatut("SOMETHING_NEW").attente).toBe("en-cours");
  });

  /*
   * Le nom de leur machine n'est pas celui d'un écran d'avocat : il vit dans
   * l'explication, où il reste citable au support de l'INPI.
   */
  it("se dit en français, et garde le nom brut dans l'explication", () => {
    const inconnu = lireLeStatut("ERROR_DECLARATION_INSEE");
    expect(inconnu.libelle).toBe("À vérifier");
    expect(inconnu.explication).toContain("ERROR_DECLARATION_INSEE");
    expect(lireLeStatut("VALIDATION_PENDING").libelle).toBe("En validation");
  });
});
