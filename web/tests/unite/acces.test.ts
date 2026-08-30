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
  estClos,
  statutProposable,
  STATUTS_HORS_PROPOSITION,
  estConfrereInvite,
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
  });

  it("un brouillon que le client remplit encore n'est pas proposé", () => {
    // Le proposer donnerait à voir des brouillons à tout le cabinet.
    expect(estPropose({ ...propose, statut: "en_cours" })).toBe(false);
    expect(peutLire(avocat, { ...propose, statut: "en_cours" }, null)).toBe(false);
  });

  it("un dossier déjà pris cesse d'être proposé", () => {
    expect(estPropose({ ...propose, avocatAssigneId: 3 })).toBe(false);
  });

  it("un dossier clos n'attend plus personne", () => {
    for (const statut of ["terminee", "archive", "rejete"]) {
      expect(estPropose({ ...propose, statut })).toBe(false);
    }
  });

  /*
   * La même liste sert la lecture et l'écriture.
   *
   * Elle était recopiée dans trois requêtes et dans le contrôle de la prise, qui n'en
   * retenait qu'une moitié : la liste ne proposait pas un dossier clos, et l'appel
   * direct l'attribuait quand même.
   */
  it("les statuts hors proposition sont ceux que le domaine refuse", () => {
    for (const statut of STATUTS_HORS_PROPOSITION) {
      expect(statutProposable(statut)).toBe(false);
      expect(estPropose({ ...propose, statut })).toBe(false);
    }
    expect(statutProposable("en_attente_validation")).toBe(true);
    expect(statutProposable("corrections_demandees")).toBe(true);
  });

  it("un dossier clos se reconnaît sans recopier la liste", () => {
    expect(estClos("terminee")).toBe(true);
    expect(estClos("archive")).toBe(true);
    expect(estClos("rejete")).toBe(true);
    expect(estClos("en_attente_validation")).toBe(false);
    expect(estClos(null)).toBe(false);
  });
});

describe("le confrère appelé sur un dossier", () => {
  /*
   * L'assignation est unique - c'est elle qui dit qui répond du dossier - et un avocat
   * qui voulait l'avis d'un confrère n'avait qu'un choix : lui rendre le dossier en
   * entier, et le perdre de vue.
   */
  const dossier: Dossier = {
    id: 7,
    proprietaireId: 99,
    avocatAssigneId: 20,
    equipeId: null,
    statut: "en_attente_validation",
    confreresInvites: [21],
  };

  const confrere: Utilisateur = { id: 21, roles: ["avocat"] };
  const etranger: Utilisateur = { id: 22, roles: ["avocat"] };

  it("le lit et le travaille comme celui qui l'a pris", () => {
    expect(estConfrereInvite(confrere, dossier)).toBe(true);
    expect(peutLire(confrere, dossier, null)).toBe(true);
    // Inviter quelqu'un pour qu'il ne puisse rien faire n'aurait pas de sens.
    expect(peutModifier(confrere, dossier, null)).toBe(true);
  });

  it("un avocat qui n'a pas été appelé n'y a pas accès", () => {
    expect(estConfrereInvite(etranger, dossier)).toBe(false);
    expect(peutLire(etranger, dossier, null)).toBe(false);
    expect(peutModifier(etranger, dossier, null)).toBe(false);
  });

  it("une liste absente ne donne accès à personne", () => {
    const sansConfreres = { ...dossier, confreresInvites: undefined };
    expect(peutLire(confrere, sansConfreres, null)).toBe(false);
  });

  /* L'invitation ne fait pas du confrère l'avocat du dossier. */
  it("ne rend pas le dossier proposable pour autant", () => {
    expect(estPropose(dossier)).toBe(false);
  });
});
