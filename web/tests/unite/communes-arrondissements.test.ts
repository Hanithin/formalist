import { describe, it, expect } from "vitest";
import { communesProposees, lieuAvecCode } from "@/domain/formalite/communes";

describe("les communes proposées à la saisie", () => {
  it("déplie Lyon en ses neuf arrondissements", () => {
    const codes = ["69001", "69002", "69003", "69004", "69005", "69006", "69007", "69008", "69009"];
    const proposees = communesProposees("Lyon", codes);

    expect(proposees).toHaveLength(9);
    expect(proposees[0]).toEqual({ nom: "Lyon 1er", codePostal: "69001" });
    expect(proposees[2]).toEqual({ nom: "Lyon 3e", codePostal: "69003" });
    expect(proposees[8]).toEqual({ nom: "Lyon 9e", codePostal: "69009" });
  });

  it("ne propose qu'une fois le seizième arrondissement de Paris", () => {
    const codes = ["75016", "75116", "75001", "75002"];
    const proposees = communesProposees("Paris", codes);

    const seizieme = proposees.filter((c) => c.nom === "Paris 16e");
    expect(seizieme).toEqual([{ nom: "Paris 16e", codePostal: "75016" }]);
  });

  it("rend les arrondissements dans l'ordre, quel que soit celui de l'API", () => {
    const proposees = communesProposees("Marseille", ["13008", "13001", "13015"]);
    expect(proposees.map((c) => c.nom)).toEqual([
      "Marseille 1er",
      "Marseille 8e",
      "Marseille 15e",
    ]);
  });

  it("écarte les codes qui ne désignent aucun arrondissement", () => {
    // 69999 n'existe pas ; 75116 appartient au seizième, déjà compté.
    const proposees = communesProposees("Lyon", ["69003", "69999", "69000"]);
    expect(proposees).toEqual([{ nom: "Lyon 3e", codePostal: "69003" }]);
  });

  it("laisse intacte une commune ordinaire à plusieurs codes postaux", () => {
    expect(communesProposees("Villeurbanne", ["69100"])).toEqual([
      { nom: "Villeurbanne", codePostal: "69100" },
    ]);
    expect(communesProposees("Metz", ["57000", "57070"])).toEqual([
      { nom: "Metz", codePostal: "57000" },
    ]);
  });

  it("reconnaît la ville sans se soucier de la casse ni des accents", () => {
    expect(communesProposees("LYON", ["69001", "69002"])).toHaveLength(2);
    expect(communesProposees("lyon", ["69001", "69002"])).toHaveLength(2);
  });

  it("survit à une commune sans code postal", () => {
    expect(communesProposees("Lyon", undefined)).toEqual([{ nom: "Lyon", codePostal: "" }]);
    expect(communesProposees("Trifouillis", [])).toEqual([{ nom: "Trifouillis", codePostal: "" }]);
  });

  it("écrit le lieu comme les actes le portent", () => {
    expect(lieuAvecCode("Lyon 3e", "69003")).toBe("Lyon 3e (69003)");
    expect(lieuAvecCode("Villeurbanne", "")).toBe("Villeurbanne");
  });
});
