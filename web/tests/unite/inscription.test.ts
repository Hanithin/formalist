import { describe, it, expect } from "vitest";
import {
  verifierInscription,
  verifierMotDePasse,
  etatJeton,
  messageJeton,
} from "@/domain/acces/inscription";

describe("mot de passe", () => {
  it("exige une longueur minimale", () => {
    expect(verifierMotDePasse("court")[0].message).toContain("au moins 8");
  });

  it("refuse les mots de passe les plus courants", () => {
    expect(verifierMotDePasse("motdepasse")[0].message).toContain("trop courant");
    expect(verifierMotDePasse("12345678")[0].message).toContain("trop courant");
  });

  it("refuse un mot de passe qui contient son propre nom", () => {
    // « Durand2026 » se devine dès qu'on connaît la personne.
    expect(verifierMotDePasse("durand2026", ["Durand"])[0].message).toContain("votre nom");
  });

  it("ignore les fragments trop courts du contexte", () => {
    // Un prénom de trois lettres se retrouverait partout par hasard.
    expect(verifierMotDePasse("banaliteordinaire", ["Ana"])).toEqual([]);
  });

  it("accepte un mot de passe long et quelconque", () => {
    expect(verifierMotDePasse("brouette-lampadaire-42", ["Durand"])).toEqual([]);
  });

  it("n'exige ni majuscule ni caractère spécial", () => {
    // Ces règles produisent « Motdepasse1! » sans rien gagner.
    expect(verifierMotDePasse("cheval correct agrafe")).toEqual([]);
  });
});

describe("inscription", () => {
  const valide = {
    prenom: "Camille",
    nom: "Durand",
    email: "camille@exemple.test",
    motDePasse: "brouette-lampadaire-42",
  };

  it("accepte une demande complète", () => {
    expect(verifierInscription(valide)).toEqual([]);
  });

  it("signale chaque champ manquant", () => {
    const champs = verifierInscription({}).map((a) => a.champ);
    expect(champs).toContain("prenom");
    expect(champs).toContain("nom");
    expect(champs).toContain("email");
    expect(champs).toContain("motDePasse");
  });

  it("refuse un mot de passe fait de l'adresse email", () => {
    const anomalies = verifierInscription({ ...valide, motDePasse: "camille-camille" });
    expect(anomalies.some((a) => a.champ === "motDePasse")).toBe(true);
  });
});

describe("jeton de confirmation", () => {
  const maintenant = new Date("2026-08-10T12:00:00Z");
  const demain = new Date("2026-08-11T12:00:00Z");
  const hier = new Date("2026-08-09T12:00:00Z");

  it("distingue les quatre situations", () => {
    expect(etatJeton(null, maintenant)).toBe("inconnu");
    expect(etatJeton({ utiliseLe: null, expireLe: demain }, maintenant)).toBe("valide");
    expect(etatJeton({ utiliseLe: hier, expireLe: demain }, maintenant)).toBe("utilise");
    expect(etatJeton({ utiliseLe: null, expireLe: hier }, maintenant)).toBe("expire");
  });

  it("un jeton déjà utilisé le reste, même expiré", () => {
    expect(etatJeton({ utiliseLe: hier, expireLe: hier }, maintenant)).toBe("utilise");
  });

  it("chaque situation a un message qui dit quoi faire", () => {
    expect(messageJeton("valide")).toContain("connecter");
    expect(messageJeton("utilise")).toContain("déjà confirmée");
    expect(messageJeton("expire")).toContain("nouveau");
    expect(messageJeton("inconnu")).toContain("pas valable");
  });
});
