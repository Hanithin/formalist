import { describe, it, expect } from "vitest";
import {
  actionsAttendues,
  attendLeClient,
  etatTableauDeBord,
  salutation,
  type ContexteDossier,
} from "@/domain/formalite/actions";

const base: ContexteDossier = {
  dossierId: 7,
  status: "en_cours",
  phase: 1,
  banque: null,
  capital: 10_000,
  informationsCompletes: false,
  documentsRejetes: 0,
  signaturesEnAttente: 0,
  signaturesTotal: 0,
};

describe("actions attendues", () => {
  it("un dossier terminé n'attend plus rien", () => {
    expect(actionsAttendues({ ...base, status: "terminee" })).toEqual([]);
  });

  it("les informations manquantes viennent en premier", () => {
    expect(actionsAttendues(base)[0].titre).toBe("Compléter les informations");
  });

  it("un document refusé passe avant le reste", () => {
    // Il bloque la suite, et le client ne sait pas toujours qu'on l'attend.
    const actions = actionsAttendues({ ...base, documentsRejetes: 2 });
    expect(actions[0].titre).toBe("2 documents à remplacer");
    expect(actions[0].urgent).toBe(true);
  });

  it("le singulier ne prend pas de s", () => {
    expect(actionsAttendues({ ...base, documentsRejetes: 1 })[0].titre).toBe(
      "Un document à remplacer"
    );
    const signature = actionsAttendues({
      ...base,
      informationsCompletes: true,
      banque: "Qonto",
      phase: 4,
      signaturesEnAttente: 1,
      signaturesTotal: 3,
    });
    expect(signature[0].titre).toBe("Une signature manquante");
  });

  it("les étapes du parcours s'excluent : une seule est la prochaine", () => {
    const actions = actionsAttendues({ ...base, informationsCompletes: true });
    expect(actions).toHaveLength(1);
    expect(actions[0].titre).toBe("Choisir votre banque");
  });

  it("le montant à déposer est nommé, avec la banque", () => {
    const actions = actionsAttendues({
      ...base,
      informationsCompletes: true,
      banque: "Qonto",
      phase: 2,
      capital: 10_000,
    });
    expect(actions[0].titre).toMatch(/Déposer 10\s000 euros sur votre compte Qonto/);
  });

  it("sans capital chiffré, on reste compréhensible", () => {
    const actions = actionsAttendues({
      ...base,
      informationsCompletes: true,
      banque: "Qonto",
      phase: 2,
      capital: null,
    });
    expect(actions[0].titre).toContain("votre capital");
  });

  it("une signature manquante s'ajoute à l'étape en cours", () => {
    const actions = actionsAttendues({
      ...base,
      informationsCompletes: true,
      banque: "Qonto",
      phase: 3,
      signaturesEnAttente: 2,
      signaturesTotal: 3,
    });
    expect(actions).toHaveLength(2);
    expect(actions[1].urgent).toBe(true);
  });

  it("aucune signature attendue quand rien n'a été envoyé à signer", () => {
    const actions = actionsAttendues({
      ...base,
      informationsCompletes: true,
      banque: "Qonto",
      phase: 4,
      signaturesEnAttente: 0,
      signaturesTotal: 0,
    });
    expect(actions).toEqual([]);
  });

  it("un dossier sans action n'attend pas le client", () => {
    expect(attendLeClient({ ...base, status: "terminee" })).toBe(false);
    expect(attendLeClient(base)).toBe(true);
  });
});

describe("état du tableau de bord", () => {
  it("distingue les trois écrans", () => {
    expect(etatTableauDeBord([])).toBe("aucun");
    expect(etatTableauDeBord([{ status: "en_cours" }])).toBe("unique");
    expect(etatTableauDeBord([{ status: "en_cours" }, { status: "en_cours" }])).toBe("plusieurs");
  });

  it("tous terminés est un état à part", () => {
    expect(etatTableauDeBord([{ status: "terminee" }, { status: "terminee" }])).toBe(
      "tous_termines"
    );
  });

  it("un seul dossier terminé compte aussi comme terminé", () => {
    expect(etatTableauDeBord([{ status: "terminee" }])).toBe("tous_termines");
  });
});

describe("salutation", () => {
  it("suit l'heure de la journée", () => {
    expect(salutation(new Date("2026-08-10T10:00:00"))).toBe("Bonjour");
    expect(salutation(new Date("2026-08-10T21:00:00"))).toBe("Bonsoir");
    expect(salutation(new Date("2026-08-10T03:00:00"))).toBe("Bonsoir");
  });
});
