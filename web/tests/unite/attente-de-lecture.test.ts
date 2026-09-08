import { describe, it, expect } from "vitest";
import {
  resteEstimeMs,
  dureeApprochee,
  phraseDAttente,
  type Progression,
} from "@/domain/modification/lecture";

const enCours = (p: Partial<Progression>): Progression => ({
  phase: "reconnaissance",
  pages: 17,
  faites: 0,
  ecouleMs: 0,
  ...p,
});

describe("ce qu'il reste à lire", () => {
  it("ne s'estime pas avant la première page", () => {
    expect(resteEstimeMs(enCours({ faites: 0, ecouleMs: 4000 }))).toBeNull();
  });

  it("ne s'estime pas tant que le nombre de pages est inconnu", () => {
    expect(resteEstimeMs(enCours({ pages: null, faites: 3, ecouleMs: 9000 }))).toBeNull();
  });

  /* Quatre pages en douze secondes : trois secondes la page, treize pages à faire. */
  it("se déduit du rythme déjà tenu", () => {
    expect(resteEstimeMs(enCours({ faites: 4, ecouleMs: 12_000 }))).toBe(39_000);
  });

  it("vaut zéro quand tout est lu", () => {
    expect(resteEstimeMs(enCours({ faites: 17, ecouleMs: 51_000 }))).toBe(0);
  });
});

describe("une durée approchée", () => {
  it("ne compte pas les secondes en dessous de dix", () => {
    expect(dureeApprochee(6_000)).toBe("quelques secondes");
  });

  it("arrondit à la dizaine de secondes", () => {
    expect(dureeApprochee(37_000)).toBe("environ 40 secondes");
  });

  it("passe aux minutes au-delà", () => {
    expect(dureeApprochee(65_000)).toBe("environ 1 minute");
    expect(dureeApprochee(160_000)).toBe("environ 3 minutes");
  });

  /* Une demi-minute arrondie ne doit pas rendre « environ 0 minute ». */
  it("ne descend jamais sous la minute une fois le seuil passé", () => {
    expect(dureeApprochee(60_000)).toBe("environ 1 minute");
  });
});

describe("la phrase d'attente", () => {
  it("annonce la préparation avant toute page", () => {
    expect(phraseDAttente(enCours({ phase: "preparation", pages: null }))).toBe(
      "Préparation des pages…"
    );
  });

  it("compte les pages sans estimation tant qu'aucune n'est finie", () => {
    expect(phraseDAttente(enCours({ faites: 0, ecouleMs: 3000 }))).toBe("Page 1 sur 17");
  });

  it("donne l'avancement et le reste", () => {
    expect(phraseDAttente(enCours({ faites: 4, ecouleMs: 12_000 }))).toBe(
      "Page 5 sur 17 - encore environ 40 secondes"
    );
  });

  /* La dernière page achevée ne doit pas annoncer une dix-huitième page. */
  it("ne dépasse pas le nombre de pages", () => {
    expect(phraseDAttente(enCours({ faites: 17, ecouleMs: 51_000 }))).toBe("Dernière page…");
  });
});
