import { describe, it, expect } from "vitest";
import {
  normaliserRoles,
  rolePrincipal,
  verifierChangementDeRoles,
  verifierSuspension,
  libelleRole,
} from "@/domain/acces/administration";

describe("normalisation des rôles", () => {
  it("écarte ce qui n'est pas un rôle connu", () => {
    expect(normaliserRoles(["user", "super-admin", "avocat"])).toEqual(["user", "avocat"]);
  });

  it("supprime les doublons", () => {
    expect(normaliserRoles(["admin", "admin"])).toEqual(["admin"]);
  });

  it("accepte un rôle unique, comme les anciens écrans l'envoient", () => {
    expect(normaliserRoles("avocat")).toEqual(["avocat"]);
  });

  it("rend une liste vide plutôt que d'inventer", () => {
    expect(normaliserRoles([])).toEqual([]);
    expect(normaliserRoles(["inconnu"])).toEqual([]);
    expect(normaliserRoles(null)).toEqual([]);
  });
});

describe("rôle principal", () => {
  it("est le plus étendu de ceux accordés", () => {
    expect(rolePrincipal(["user", "admin"])).toBe("admin");
    expect(rolePrincipal(["user", "avocat"])).toBe("avocat");
    expect(rolePrincipal(["user"])).toBe("user");
  });

  it("sans rôle, on retombe sur client", () => {
    expect(rolePrincipal([])).toBe("user");
  });
});

describe("changement de rôles", () => {
  const ADMIN = 1;
  const AUTRE = 2;

  it("accorder le rôle avocat fonctionne", () => {
    const verdict = verifierChangementDeRoles(["user", "avocat"], AUTRE, ADMIN, 3);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.changement.principal).toBe("avocat");
  });

  it("une liste vide est refusée", () => {
    const verdict = verifierChangementDeRoles([], AUTRE, ADMIN, 3);
    expect(verdict.ok).toBe(false);
  });

  it("un administrateur ne peut pas se retirer ses propres droits", () => {
    // Il perdrait l'accès à cette page, et personne ne pourrait les lui rendre.
    const verdict = verifierChangementDeRoles(["user"], ADMIN, ADMIN, 3);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.anomalie.message).toContain("votre propre accès");
  });

  it("il peut en revanche changer ses autres rôles", () => {
    expect(verifierChangementDeRoles(["admin", "avocat"], ADMIN, ADMIN, 3).ok).toBe(true);
  });

  it("le dernier administrateur de la plateforme ne peut pas être rétrogradé", () => {
    const verdict = verifierChangementDeRoles(["user"], AUTRE, ADMIN, 1);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.anomalie.message).toContain("au moins un administrateur");
  });

  it("avec plusieurs administrateurs, en rétrograder un passe", () => {
    expect(verifierChangementDeRoles(["user"], AUTRE, ADMIN, 2).ok).toBe(true);
  });
});

describe("suspension", () => {
  it("suspendre un autre compte est possible", () => {
    expect(verifierSuspension(2, 1, true).ok).toBe(true);
  });

  it("se suspendre soi-même est refusé", () => {
    const verdict = verifierSuspension(1, 1, true);
    expect(verdict.ok).toBe(false);
  });

  it("lever sa propre suspension n'a pas de sens mais n'est pas dangereux", () => {
    expect(verifierSuspension(1, 1, false).ok).toBe(true);
  });
});

describe("libellés", () => {
  it("chaque rôle a son mot en français", () => {
    expect(libelleRole("admin")).toBe("Administrateur");
    expect(libelleRole("avocat")).toBe("Avocat");
    expect(libelleRole("user")).toBe("Client");
  });
});
