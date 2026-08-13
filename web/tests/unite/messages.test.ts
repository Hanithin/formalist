import { describe, it, expect } from "vitest";
import {
  typeValide,
  presentation,
  nonLus,
  grouperParJour,
  libelleJour,
  initiales,
  citation,
  correspond,
  heureCourte,
  dateCourte,
  apercuDeConversation,
  LONGUEUR_APERCU,
  LONGUEUR_CITATION,
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
    // Les libellés sont ceux de kindMeta dans messagerie.html.
    expect(presentation("rejection").libelle).toBe("Dossier rejeté");
    expect(presentation("rejection").ton).toBe("attente");
  });

  it("chaque type porte la couleur de sa pastille", () => {
    expect(presentation("correction_request").fond).toBe("#fef3c7");
    expect(presentation("correction_request").encre).toBe("#92400e");
    expect(presentation("validation").fond).toBe("#dcfce7");
  });

  it("le geste attendu suit l'intention du message", () => {
    // Une demande de pièce se répond en joignant un fichier, pas en ouvrant le
    // dossier : c'est ce que distingue « piece » de « dossier ».
    expect(presentation("document_request").action).toBe("piece");
    expect(presentation("document_request").libelleAction).toBe("Joindre le document");
    expect(presentation("rejection").action).toBe("dossier");
    expect(presentation("rejection").libelleAction).toBe("Consulter le dossier");
    expect(presentation("text").action).toBe("aucune");
    expect(presentation("text").libelleAction).toBeNull();
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

describe("l'allure de la liste", () => {
  it("les initiales tiennent en deux lettres", () => {
    expect(initiales("ATELIER MERIDIEN")).toBe("AM");
    expect(initiales("Support Formalist")).toBe("SF");
    expect(initiales("Sans")).toBe("S");
    // Un nom composé se lit sur ses deux premiers mots.
    expect(initiales("Jean-Pierre Durand")).toBe("JP");
  });

  it("un nom absent ne rend pas un rond muet", () => {
    expect(initiales(null)).toBe("?");
    expect(initiales("   ")).toBe("?");
  });

  it("l'aperçu dit qui a parlé en dernier", () => {
    expect(apercuDeConversation({ contenu: "Merci", deMoi: false })).toBe("Merci");
    expect(apercuDeConversation({ contenu: "Merci", deMoi: true })).toBe("Vous : Merci");
  });

  it("un fil sans message le dit plutôt que de rester vide", () => {
    expect(apercuDeConversation({ contenu: null })).toBe("Aucun message");
    expect(apercuDeConversation({ contenu: "  " })).toBe("Aucun message");
  });

  it("l'aperçu est coupé à quarante-quatre caractères", () => {
    const long = "a".repeat(80);
    const apercu = apercuDeConversation({ contenu: long });
    expect(apercu).toHaveLength(LONGUEUR_APERCU + 1); // les points de suspension
    expect(apercu.endsWith("…")).toBe(true);
  });

  it("la recherche ignore la casse et les accents", () => {
    const fil = { titre: "SOCIÉTÉ MÉRIDIEN", dernierMessage: "À bientôt" };
    expect(correspond(fil, "societe")).toBe(true);
    expect(correspond(fil, "MÉRIDIEN")).toBe(true);
    expect(correspond(fil, "bientot")).toBe(true);
    expect(correspond(fil, "inconnue")).toBe(false);
  });

  it("une recherche vide ne cache rien", () => {
    expect(correspond({ titre: "Peu importe" }, "   ")).toBe(true);
  });
});

describe("les horodatages", () => {
  it("l'heure d'un message se lit sur deux chiffres", () => {
    expect(heureCourte(new Date(2026, 7, 10, 9, 5))).toBe("09:05");
    expect(heureCourte(new Date(2026, 7, 10, 14, 32))).toBe("14:32");
  });

  it("la liste montre l'heure aujourd'hui, « Hier » la veille, la date avant", () => {
    const maintenant = new Date(2026, 7, 10, 18, 0);
    expect(dateCourte(new Date(2026, 7, 10, 9, 5), maintenant)).toBe("09:05");
    expect(dateCourte(new Date(2026, 7, 9, 23, 0), maintenant)).toBe("Hier");
    expect(dateCourte(new Date(2026, 6, 4, 9, 0), maintenant)).toBe("04/07");
  });

  it("« Hier » se calcule sur le jour, pas sur vingt-quatre heures", () => {
    // Un message de 23 h vu à 1 h du matin est d'hier, même s'il a deux heures.
    const maintenant = new Date(2026, 7, 10, 1, 0);
    expect(dateCourte(new Date(2026, 7, 9, 23, 0), maintenant)).toBe("Hier");
  });
});

describe("les citations", () => {
  it("une citation courte reste entière", () => {
    expect(citation("Merci, je la dépose aujourd'hui.")).toBe("Merci, je la dépose aujourd'hui.");
  });

  it("une longue est coupée à quatre-vingt-dix caractères", () => {
    const cite = citation("b".repeat(200));
    expect(cite).toHaveLength(LONGUEUR_CITATION + 1);
    expect(cite.endsWith("…")).toBe(true);
  });

  it("un contenu absent ne casse pas la bulle", () => {
    expect(citation(null)).toBe("");
  });
});
