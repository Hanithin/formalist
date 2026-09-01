import { describe, it, expect } from "vitest";
import { donneesDeGabarit } from "@/domain/formalite/gabarit";

/**
 * Un objet social long ne se perd nulle part.
 *
 * Il se perdait à trois endroits, tous silencieux. L'enregistrement le refusait au-delà
 * de deux mille caractères - un objet de holding en fait trois mille - et le formulaire
 * ignorait ce refus : l'étape ne passait pas, sans qu'un mot l'explique. Et les statuts
 * ne réservent qu'un nombre fixe d'emplacements - six en SAS, trois en SARL - au-delà
 * desquels les clauses disparaissaient de l'acte déposé au greffe.
 */
const HUIT_CLAUSES = [
  "– la prise de participations dans toutes sociétés, françaises ou étrangères ;",
  "– la constitution et l'animation d'un groupe de sociétés ;",
  "– la fourniture de prestations de services à ses filiales ;",
  "– la centralisation et la gestion de la trésorerie du groupe ;",
  "– la gestion de tous droits de propriété intellectuelle ;",
  "– l'acquisition et la gestion de tous biens mobiliers ou immobiliers ;",
  "– la réalisation de toutes opérations de financement et de placement ;",
  "– la prise à bail et l'exploitation de tous établissements ;",
];

function objetDesStatuts(forme: string, lignes: string[]): string[] {
  const donnees = donneesDeGabarit({
    forme,
    denomination: "HOLDING ESSAI",
    activite: lignes.join("\n"),
    adresse: "12 rue Vauban",
    codePostal: "69006",
    ville: "Lyon",
    associes: [{ type: "physique", parts: 100, personne: { prenom: "Jean", nom: "Dupont" } }],
    dirigeants: [{ associe: 0 }],
  } as never) as Record<string, string>;

  return [1, 2, 3, 4, 5, 6].map((n) => donnees["OBJET_SOCIAL_" + n] ?? "").filter(Boolean);
}

describe("l'objet social des statuts", () => {
  it("garde chaque clause quand elles tiennent dans les emplacements", () => {
    const rendu = objetDesStatuts("SAS", HUIT_CLAUSES.slice(0, 4));
    expect(rendu).toHaveLength(4);
    expect(rendu.join(" ")).toContain("prise de participations");
    expect(rendu.join(" ")).toContain("centralisation");
  });

  /* Six emplacements en SAS : les deux dernières clauses rejoignent la sixième. */
  it("ne perd aucune clause au-delà des emplacements, en SAS", () => {
    const rendu = objetDesStatuts("SAS", HUIT_CLAUSES);
    expect(rendu).toHaveLength(6);
    for (const clause of HUIT_CLAUSES) {
      expect(rendu.join("\n"), "clause perdue : " + clause).toContain(clause);
    }
  });

  /* Trois seulement en SARL : le repli doit suivre la forme, non un chiffre fixe. */
  it("ne perd aucune clause au-delà des emplacements, en SARL", () => {
    const rendu = objetDesStatuts("SARL", HUIT_CLAUSES);
    expect(rendu).toHaveLength(3);
    for (const clause of HUIT_CLAUSES) {
      expect(rendu.join("\n"), "clause perdue : " + clause).toContain(clause);
    }
  });
});
