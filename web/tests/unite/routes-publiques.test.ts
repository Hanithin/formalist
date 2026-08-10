import { describe, it, expect } from "vitest";
import {
  estPublic,
  estPreGeneree,
  PAGES_PUBLIQUES,
  API_PUBLIQUES,
} from "@/domain/acces/routes-publiques";

/**
 * Ce fichier existe pour qu'ouvrir une adresse au public soit une décision visible.
 *
 * La liste attendue est écrite en dur ici : y ajouter une entrée oblige à modifier
 * ce test, donc à l'expliquer en revue. C'est exactement ce qui a manqué au serveur
 * d'origine, où /api/file s'est retrouvée ouverte sans que personne l'ait décidé.
 */
const OUVERTURES_ATTENDUES = [
  "/",
  "/connexion",
  "/inscription",
  "/mot-de-passe-oublie",
  "/contact",
  "/blog",
  "/api/auth/connexion",
  "/api/auth/inscription",
  "/api/auth/verifier-email",
  "/api/auth/renvoyer-verification",
  "/api/contact",
  "/api/signature/signer",
];

describe("liste des adresses publiques", () => {
  it("n'a pas changé sans que ce test le dise", () => {
    const declarees = [...PAGES_PUBLIQUES, ...API_PUBLIQUES].sort();
    expect(declarees).toEqual([...OUVERTURES_ATTENDUES].sort());
  });
});

describe("protection par défaut", () => {
  const protegees = [
    "/aide",
    "/tableau-de-bord",
    "/formalites",
    "/documents",
    "/equipe",
    "/avocat",
    "/administration",
    "/api/formalites",
    "/api/documents",
    "/api/fichier",
    "/api/equipe",
    "/api/auth/moi",
    "/une-page-qui-n-existe-pas-encore",
  ];

  for (const chemin of protegees) {
    it(chemin + " exige une session", () => {
      expect(estPublic(chemin)).toBe(false);
    });
  }

  it("une adresse inconnue est protégée, pas ouverte", () => {
    expect(estPublic("/api/quelque-chose-de-nouveau")).toBe(false);
  });
});

describe("cas particuliers de chemins", () => {
  it("les articles du blog sont publics comme le blog", () => {
    expect(estPublic("/blog/creer-une-sarl")).toBe(true);
  });

  it("la barre finale ne change pas le verdict", () => {
    expect(estPublic("/connexion/")).toBe(true);
    expect(estPublic("/formalites/")).toBe(false);
  });

  it("les ressources du cadre restent servies", () => {
    expect(estPublic("/_next/static/chunk.js")).toBe(true);
    expect(estPublic("/fonts/Matter-Regular.ttf")).toBe(true);
  });

  it("les fichiers destinés aux moteurs sont servis", () => {
    // Oubliés au départ : le flux revenait vide, renvoyé vers la page de connexion.
    expect(estPublic("/robots.txt")).toBe(true);
    expect(estPublic("/sitemap.xml")).toBe(true);
    expect(estPublic("/flux.xml")).toBe(true);
  });

  it("une adresse qui ressemble à une adresse publique ne l'est pas", () => {
    expect(estPublic("/connexion-secrete")).toBe(false);
    expect(estPublic("/api/auth/connexion-admin")).toBe(false);
  });

});

describe("pages pré-générées", () => {
  it("la vitrine et le blog sont produits à la compilation", () => {
    expect(estPreGeneree("/")).toBe(true);
    expect(estPreGeneree("/blog")).toBe(true);
    expect(estPreGeneree("/blog/capital-social-creation")).toBe(true);
  });

  it("les pages d'application ne le sont pas", () => {
    // Elles portent des données : leur politique de sécurité reste stricte.
    expect(estPreGeneree("/tableau-de-bord")).toBe(false);
    expect(estPreGeneree("/aide")).toBe(false);
    expect(estPreGeneree("/administration")).toBe(false);
  });

  it("« pré-générée » n'est pas « publique » : ce sont deux questions", () => {
    expect(estPublic("/connexion")).toBe(true);
    expect(estPreGeneree("/connexion")).toBe(true);
    expect(estPublic("/api/contact")).toBe(true);
    expect(estPreGeneree("/api/contact")).toBe(false);
  });
});
