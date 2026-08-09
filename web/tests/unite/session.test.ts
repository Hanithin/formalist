import { describe, it, expect } from "vitest";
import {
  etatDeLaSession,
  sessionValide,
  doitRafraichir,
  DUREE_ABSOLUE_MS,
  DUREE_INACTIVITE_MS,
  type Session,
} from "@/domain/acces/session";

const MAINTENANT = new Date("2026-08-10T12:00:00Z");

function session(p: Partial<Session> = {}): Session {
  return {
    jeton: "j",
    utilisateurId: 1,
    creeeLe: MAINTENANT,
    vueLe: MAINTENANT,
    revoqueeLe: null,
    ...p,
  };
}

function ilYa(ms: number): Date {
  return new Date(MAINTENANT.getTime() - ms);
}

describe("validité d'une session", () => {
  it("une session fraîche est valide", () => {
    expect(sessionValide(session(), MAINTENANT)).toBe(true);
  });

  it("une session révoquée ne vaut plus rien, même récente", () => {
    const s = session({ revoqueeLe: MAINTENANT });
    expect(etatDeLaSession(s, MAINTENANT)).toBe("revoquee");
  });

  it("l'activité ne prolonge pas la durée absolue", () => {
    const s = session({ creeeLe: ilYa(DUREE_ABSOLUE_MS), vueLe: MAINTENANT });
    expect(etatDeLaSession(s, MAINTENANT)).toBe("expiree");
  });

  it("juste avant la durée absolue, la session tient encore", () => {
    const s = session({ creeeLe: ilYa(DUREE_ABSOLUE_MS - 1000) });
    expect(sessionValide(s, MAINTENANT)).toBe(true);
  });

  it("une session oubliée se ferme sur inactivité", () => {
    const s = session({ creeeLe: ilYa(DUREE_INACTIVITE_MS + 1000), vueLe: ilYa(DUREE_INACTIVITE_MS) });
    expect(etatDeLaSession(s, MAINTENANT)).toBe("inactive");
  });

  it("la révocation l'emporte sur tout le reste", () => {
    const s = session({ creeeLe: ilYa(DUREE_ABSOLUE_MS * 2), revoqueeLe: MAINTENANT });
    expect(etatDeLaSession(s, MAINTENANT)).toBe("revoquee");
  });
});

describe("rafraîchissement de l'activité", () => {
  it("pas d'écriture à chaque requête", () => {
    expect(doitRafraichir(session({ vueLe: ilYa(5_000) }), MAINTENANT)).toBe(false);
  });

  it("une écriture passé la minute", () => {
    expect(doitRafraichir(session({ vueLe: ilYa(61_000) }), MAINTENANT)).toBe(true);
  });
});
