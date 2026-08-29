import { describe, it, expect } from "vitest";
import {
  ordonnerLeRegistre,
  resumeDuPortefeuille,
  type LignePourTri,
} from "@/domain/societe/registre";

/**
 * L'ordre du registre des sociétés.
 *
 * Huit sociétés, sept lignes identiques, et la seule qui parlait - un retard de
 * soixante jours sur des comptes - en troisième position. L'ordre venait de la base :
 * `created_at desc` sur les dossiers, ni alphabétique ni par urgence.
 */

const ligne = (
  denomination: string,
  etat: string,
  echeance: { limite: string; enRetard: boolean } | null = null
): LignePourTri => ({ denomination, etat: { cle: etat }, echeance });

describe("l'ordre du registre", () => {
  it("met en tête ce sur quoi on peut agir aujourd'hui", () => {
    const registre = [
      ligne("STUDIO KERN", "en-creation"),
      ligne("ANCIENNE", "radiee"),
      ligne("CABINET ROUSSEAU", "active", { limite: "2026-06-30", enRetard: true }),
      ligne("NOVA", "active"),
      ligne("PARC", "active", { limite: "2027-06-30", enRetard: false }),
      ligne("EN FERMETURE", "en-fermeture"),
    ];

    expect(ordonnerLeRegistre(registre).map((l) => l.denomination)).toEqual([
      "CABINET ROUSSEAU",
      "PARC",
      "NOVA",
      "STUDIO KERN",
      "EN FERMETURE",
      "ANCIENNE",
    ]);
  });

  it("classe les retards du plus ancien au plus récent", () => {
    // Soixante jours de retard passent devant deux : c'est le plus vieux qui coûte.
    const registre = [
      ligne("RECENTE", "active", { limite: "2026-08-28", enRetard: true }),
      ligne("ANCIENNE", "active", { limite: "2026-06-30", enRetard: true }),
    ];

    expect(ordonnerLeRegistre(registre).map((l) => l.denomination)).toEqual([
      "ANCIENNE",
      "RECENTE",
    ]);
  });

  it("range par ordre alphabétique à égalité", () => {
    // C'est l'ordre où l'on cherche un nom qu'on connaît déjà.
    const registre = [
      ligne("ZEBRE", "en-creation"),
      ligne("ATELIER", "en-creation"),
      ligne("ÉOLE", "en-creation"),
    ];

    expect(ordonnerLeRegistre(registre).map((l) => l.denomination)).toEqual([
      "ATELIER",
      "ÉOLE",
      "ZEBRE",
    ]);
  });

  it("ne modifie pas le tableau qu'on lui donne", () => {
    const registre = [ligne("B", "active"), ligne("A", "active")];
    ordonnerLeRegistre(registre);

    expect(registre.map((l) => l.denomination)).toEqual(["B", "A"]);
  });
});

describe("ce que le portefeuille annonce", () => {
  it("compte ce sur quoi on peut agir", () => {
    const phrase = resumeDuPortefeuille([
      ligne("A", "active", { limite: "2026-06-30", enRetard: true }),
      ligne("B", "active", { limite: "2027-06-30", enRetard: false }),
      ligne("C", "en-creation"),
      ligne("D", "en-creation"),
    ]);

    expect(phrase).toBe("1 société en retard · 1 échéance à venir · 2 créations en cours.");
  });

  it("ne nomme que ce qui existe", () => {
    // Un compte sans retard ne lit pas « 0 société en retard ».
    expect(resumeDuPortefeuille([ligne("A", "en-creation")])).toBe("1 création en cours.");
  });

  it("dit qu'il n'y a rien à signaler plutôt que de se taire", () => {
    expect(resumeDuPortefeuille([ligne("A", "active"), ligne("B", "active")])).toMatch(
      /2 sociétés sont à jour/
    );
    expect(resumeDuPortefeuille([ligne("A", "active")])).toMatch(/Votre société est à jour/);
  });

  it("garde sa phrase d'attente sur un portefeuille vide", () => {
    expect(resumeDuPortefeuille([])).toMatch(/dès votre première formalité/);
  });
});
