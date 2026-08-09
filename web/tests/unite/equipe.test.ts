import { describe, it, expect } from "vitest";
import {
  peutGererLEquipe,
  roleAccorde,
  rolesProposables,
  etatInvitation,
  peutRetirer,
  type Equipe,
  type Membre,
} from "@/domain/equipe/invitations";

const equipeCliente: Equipe = { id: 1, type: "client" };
const cabinet: Equipe = { id: 2, type: "cabinet" };

const membre = (role: Membre["role"], id = 1): Membre => ({ utilisateurId: id, role });

describe("qui peut gérer l'équipe", () => {
  it("dans une équipe cliente, son administrateur", () => {
    expect(peutGererLEquipe(equipeCliente, membre("admin"), ["user"])).toBe(true);
    expect(peutGererLEquipe(equipeCliente, membre("collaborateur"), ["user"])).toBe(false);
  });

  it("dans un cabinet, seuls les avocats", () => {
    expect(peutGererLEquipe(cabinet, membre("avocat"), ["avocat"])).toBe(true);
    expect(peutGererLEquipe(cabinet, membre("collaborateur"), ["user"])).toBe(false);
  });

  it("dans un cabinet, un administrateur d'équipe qui n'est pas avocat ne gère pas", () => {
    // La responsabilité professionnelle est engagée : elle ne se délègue pas.
    expect(peutGererLEquipe(cabinet, membre("admin"), ["user"])).toBe(false);
  });

  it("l'administrateur de la plateforme gère partout", () => {
    expect(peutGererLEquipe(cabinet, null, ["admin"])).toBe(true);
    expect(peutGererLEquipe(equipeCliente, null, ["admin"])).toBe(true);
  });

  it("quelqu'un qui n'est pas membre ne gère rien", () => {
    expect(peutGererLEquipe(equipeCliente, null, ["user"])).toBe(false);
  });
});

describe("rôle accordé", () => {
  it("le rôle d'avocat n'existe que dans un cabinet", () => {
    expect(roleAccorde(cabinet, "avocat")).toBe("avocat");
    expect(roleAccorde(equipeCliente, "avocat")).toBe("collaborateur");
  });

  it("un rôle inconnu devient collaborateur, jamais davantage", () => {
    expect(roleAccorde(cabinet, "directeur")).toBe("collaborateur");
    expect(roleAccorde(equipeCliente, "")).toBe("collaborateur");
  });

  it("les choix proposés dépendent du type d'équipe", () => {
    expect(rolesProposables(equipeCliente)).not.toContain("avocat");
    expect(rolesProposables(cabinet)).toContain("avocat");
  });
});

describe("état d'une invitation", () => {
  const maintenant = new Date("2026-08-10T12:00:00Z");
  const dansUneSemaine = new Date("2026-08-17T12:00:00Z");
  const hier = new Date("2026-08-09T12:00:00Z");

  it("en attente tant qu'elle n'est ni acceptée ni périmée", () => {
    expect(
      etatInvitation({ accepteeLe: null, revoqueeLe: null, expireLe: dansUneSemaine }, maintenant)
    ).toBe("en_attente");
  });

  it("expirée passé le délai", () => {
    expect(etatInvitation({ accepteeLe: null, revoqueeLe: null, expireLe: hier }, maintenant)).toBe(
      "expiree"
    );
  });

  it("l'acceptation l'emporte sur l'expiration", () => {
    expect(
      etatInvitation({ accepteeLe: hier, revoqueeLe: null, expireLe: hier }, maintenant)
    ).toBe("acceptee");
  });

  it("révoquée reste révoquée", () => {
    expect(
      etatInvitation({ accepteeLe: null, revoqueeLe: hier, expireLe: dansUneSemaine }, maintenant)
    ).toBe("revoquee");
  });
});

describe("retrait d'un membre", () => {
  it("un collaborateur se retire sans difficulté", () => {
    const membres = [membre("admin", 1), membre("collaborateur", 2)];
    expect(peutRetirer(equipeCliente, membres, membre("collaborateur", 2)).autorise).toBe(true);
  });

  it("le dernier administrateur ne peut pas partir", () => {
    const membres = [membre("admin", 1), membre("collaborateur", 2)];
    const verdict = peutRetirer(equipeCliente, membres, membre("admin", 1));
    expect(verdict.autorise).toBe(false);
    expect(verdict.raison).toContain("au moins un administrateur");
  });

  it("un administrateur parmi d'autres peut partir", () => {
    const membres = [membre("admin", 1), membre("admin", 2)];
    expect(peutRetirer(equipeCliente, membres, membre("admin", 1)).autorise).toBe(true);
  });

  it("dans un cabinet, c'est le dernier avocat qui est retenu", () => {
    const membres = [membre("avocat", 1), membre("admin", 2)];
    const verdict = peutRetirer(cabinet, membres, membre("avocat", 1));
    expect(verdict.autorise).toBe(false);
    expect(verdict.raison).toContain("au moins un avocat");
  });
});
