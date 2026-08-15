import { describe, it, expect } from "vitest";
import {
  peutLire,
  peutModifier,
  peutCreer,
  voitToutLEquipe,
  type Appartenance,
  type Dossier,
  type Utilisateur,
  estPropose,
  peutPrendre,
} from "@/domain/acces/regles";

const client: Utilisateur = { id: 10, roles: ["user"] };
const autreClient: Utilisateur = { id: 11, roles: ["user"] };
const avocat: Utilisateur = { id: 20, roles: ["avocat"] };
const administrateur: Utilisateur = { id: 1, roles: ["admin"] };

const dossier: Dossier = { id: 100, proprietaireId: 10, avocatAssigneId: 20, equipeId: 5 };

function appartenance(p: Partial<Appartenance> = {}): Appartenance {
  return {
    equipeId: 5,
    type: "client",
    role: "user",
    voitTousLesDossiers: false,
    peutModifier: false,
    peutCreer: false,
    ...p,
  };
}

describe("lecture d'un dossier", () => {
  it("le propriétaire lit son dossier", () => {
    expect(peutLire(client, dossier, null)).toBe(true);
  });

  it("l'avocat assigné lit le dossier", () => {
    expect(peutLire(avocat, dossier, null)).toBe(true);
  });

  it("l'administrateur de la plateforme lit tout", () => {
    expect(peutLire(administrateur, dossier, null)).toBe(true);
  });

  it("un client étranger au dossier ne le lit pas", () => {
    expect(peutLire(autreClient, dossier, null)).toBe(false);
  });

  it("un collaborateur sans le droit ne voit pas les dossiers de son équipe", () => {
    expect(peutLire(autreClient, dossier, appartenance())).toBe(false);
  });

  it("un collaborateur avec le droit voit les dossiers de son équipe", () => {
    expect(peutLire(autreClient, dossier, appartenance({ voitTousLesDossiers: true }))).toBe(true);
  });

  it("l'appartenance à une autre équipe ne donne aucun droit", () => {
    const ailleurs = appartenance({ equipeId: 99, voitTousLesDossiers: true });
    expect(peutLire(autreClient, dossier, ailleurs)).toBe(false);
  });

  it("un dossier absent n'est jamais lisible", () => {
    expect(peutLire(administrateur, null, null)).toBe(false);
  });
});

describe("modification d'un dossier", () => {
  it("voir tous les dossiers ne suffit pas pour modifier", () => {
    const lecteur = appartenance({ voitTousLesDossiers: true, peutModifier: false });
    expect(peutLire(autreClient, dossier, lecteur)).toBe(true);
    expect(peutModifier(autreClient, dossier, lecteur)).toBe(false);
  });

  it("les deux droits réunis autorisent la modification", () => {
    const redacteur = appartenance({ voitTousLesDossiers: true, peutModifier: true });
    expect(peutModifier(autreClient, dossier, redacteur)).toBe(true);
  });

  it("l'administrateur d'équipe modifie sans droit explicite", () => {
    expect(peutModifier(autreClient, dossier, appartenance({ role: "admin" }))).toBe(true);
  });

  it("dans un cabinet, un avocat modifie les dossiers du cabinet", () => {
    const confrere: Utilisateur = { id: 21, roles: ["avocat"] };
    expect(peutModifier(confrere, dossier, appartenance({ type: "cabinet", role: "avocat" }))).toBe(
      true
    );
  });
});

describe("création de dossier", () => {
  it("sans équipe, rien ne restreint", () => {
    expect(peutCreer(null)).toBe(true);
  });

  it("un collaborateur sans le droit ne crée pas", () => {
    expect(peutCreer(appartenance())).toBe(false);
  });

  it("l'administrateur d'équipe crée toujours", () => {
    expect(peutCreer(appartenance({ role: "admin" }))).toBe(true);
  });
});

describe("visibilité d'équipe", () => {
  it("sans appartenance, aucune visibilité élargie", () => {
    expect(voitToutLEquipe(null)).toBe(false);
  });

  it("un avocat hors cabinet ne voit pas tout pour autant", () => {
    expect(voitToutLEquipe(appartenance({ type: "client", role: "avocat" }))).toBe(false);
  });
});

describe("un dossier proposé aux avocats", () => {
  const avocat = { id: 7, roles: ["avocat" as const] };
  const propose = {
    id: 1,
    proprietaireId: 99,
    avocatAssigneId: null,
    equipeId: null,
    statut: "en_attente_validation",
  };

  it("se lit par tout avocat, pour qu'il décide de le prendre", () => {
    // Sans cela, un avocat prévenu ouvrirait un dossier qu'il n'a pas le droit de lire.
    expect(estPropose(propose)).toBe(true);
    expect(peutLire(avocat, propose, null)).toBe(true);
    expect(peutPrendre(avocat, propose)).toBe(true);
  });

  it("un brouillon que le client remplit encore n'est pas proposé", () => {
    // Le proposer donnerait à voir des brouillons à tout le cabinet.
    expect(estPropose({ ...propose, statut: "en_cours" })).toBe(false);
    expect(peutLire(avocat, { ...propose, statut: "en_cours" }, null)).toBe(false);
  });

  it("un dossier déjà pris cesse d'être proposé", () => {
    expect(estPropose({ ...propose, avocatAssigneId: 3 })).toBe(false);
    expect(peutPrendre(avocat, { ...propose, avocatAssigneId: 3 })).toBe(false);
  });

  it("un dossier clos n'attend plus personne", () => {
    for (const statut of ["terminee", "archive", "rejete"]) {
      expect(estPropose({ ...propose, statut })).toBe(false);
    }
  });

  it("un client ne prend pas un dossier proposé", () => {
    expect(peutPrendre({ id: 5, roles: ["user"] }, propose)).toBe(false);
  });
});
