import { describe, it, expect } from "vitest";
import {
  typeValide,
  presentation,
  nonLus,
  grouperParJour,
  libelleJour,
  type Message,
} from "@/domain/messagerie/messages";

const message = (p: Partial<Message> = {}): Message => ({
  id: 1,
  expediteurId: 10,
  contenu: "bonjour",
  type: "text",
  lu: false,
  envoyeLe: new Date("2026-08-10T10:00:00Z"),
  ...p,
});

describe("type de message", () => {
  it("garde les types connus", () => {
    expect(typeValide("rejection")).toBe("rejection");
  });

  it("un type venu d'ailleurs s'affiche comme un message ordinaire", () => {
    expect(typeValide("type_futur")).toBe("text");
    expect(typeValide(null)).toBe("text");
  });

  it("distingue ce qui appelle une action du client", () => {
    expect(presentation("rejection").demandeAction).toBe(true);
    expect(presentation("document_request").demandeAction).toBe(true);
    expect(presentation("validation").demandeAction).toBe(false);
    expect(presentation("text").demandeAction).toBe(false);
  });

  it("un rejet ne ressemble pas à un bavardage", () => {
    expect(presentation("rejection").libelle).toBe("Document refusé");
    expect(presentation("rejection").ton).toBe("attente");
  });
});

describe("messages non lus", () => {
  it("compte ceux qu'on a reçus sans les lire", () => {
    const fil = [
      message({ id: 1, expediteurId: 20, lu: false }),
      message({ id: 2, expediteurId: 20, lu: true }),
      message({ id: 3, expediteurId: 20, lu: false }),
    ];
    expect(nonLus(fil, 10)).toBe(2);
  });

  it("ses propres messages ne comptent jamais", () => {
    const fil = [message({ expediteurId: 10, lu: false }), message({ expediteurId: 10, lu: false })];
    expect(nonLus(fil, 10)).toBe(0);
  });

  it("un fil vide ne compte rien", () => {
    expect(nonLus([], 10)).toBe(0);
  });
});

describe("regroupement par jour", () => {
  it("réunit les messages d'une même journée", () => {
    const groupes = grouperParJour([
      message({ envoyeLe: new Date("2026-08-10T08:00:00Z") }),
      message({ envoyeLe: new Date("2026-08-10T22:00:00Z") }),
      message({ envoyeLe: new Date("2026-08-09T12:00:00Z") }),
    ]);
    expect(groupes).toHaveLength(2);
    expect(groupes[0][1]).toHaveLength(2);
  });

  it("conserve l'ordre d'arrivée", () => {
    const groupes = grouperParJour([
      message({ id: 1, envoyeLe: new Date("2026-08-09T12:00:00Z") }),
      message({ id: 2, envoyeLe: new Date("2026-08-10T12:00:00Z") }),
    ]);
    expect(groupes.map(([jour]) => jour)).toEqual(["2026-08-09", "2026-08-10"]);
  });
});

describe("libellé de journée", () => {
  const maintenant = new Date("2026-08-10T15:00:00Z");

  it("aujourd'hui et hier se lisent mieux qu'une date", () => {
    expect(libelleJour("2026-08-10", maintenant)).toBe("Aujourd'hui");
    expect(libelleJour("2026-08-09", maintenant)).toBe("Hier");
  });

  it("au-delà, la date complète", () => {
    expect(libelleJour("2026-07-04", maintenant)).toBe("4 juillet 2026");
  });
});
