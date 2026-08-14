import { describe, it, expect } from "vitest";
import { lirePieces, ecrirePieces, PIECES_MAXIMUM } from "@/domain/consultation/pieces";

describe("relire les pièces d'une consultation", () => {
  it("rend la liste écrite", () => {
    const pieces = [{ fichier: "a1b2.pdf", nom: "Statuts.pdf" }];
    expect(lirePieces(ecrirePieces(pieces))).toEqual(pieces);
  });

  it("une colonne vide ne rend rien", () => {
    expect(lirePieces(null)).toEqual([]);
    expect(lirePieces("")).toEqual([]);
  });

  it("du texte qui n'est pas du JSON ne fait pas échouer la page", () => {
    /*
     * La consultation doit s'afficher même si cette colonne est illisible : une
     * pièce jointe perdue est ennuyeuse, une page qui ne s'ouvre plus l'est bien
     * davantage.
     */
    expect(lirePieces("{ceci n'est pas du json")).toEqual([]);
    expect(lirePieces('"une chaîne"')).toEqual([]);
    expect(lirePieces("42")).toEqual([]);
  });

  it("une entrée sans nom de fichier est écartée", () => {
    const json = JSON.stringify([
      { nom: "Sans fichier.pdf" },
      { fichier: "ok.pdf", nom: "Ok.pdf" },
    ]);
    expect(lirePieces(json)).toEqual([{ fichier: "ok.pdf", nom: "Ok.pdf" }]);
  });

  it("une pièce écrite à l'ancienne, en simple nom de fichier, reste lisible", () => {
    // La page d'origine ne stockait que le chemin : ces lignes doivent s'ouvrir.
    expect(lirePieces('["a1b2.pdf"]')).toEqual([{ fichier: "a1b2.pdf", nom: "a1b2.pdf" }]);
  });

  it("une pièce sans nom d'origine se lit sous son nom de stockage", () => {
    const json = JSON.stringify([{ fichier: "a1b2.pdf", nom: "   " }]);
    expect(lirePieces(json)).toEqual([{ fichier: "a1b2.pdf", nom: "a1b2.pdf" }]);
  });

  it("la liste est bornée à la lecture comme à l'écriture", () => {
    const trop = Array.from({ length: PIECES_MAXIMUM + 5 }, (_, i) => ({
      fichier: i + ".pdf",
      nom: i + ".pdf",
    }));
    expect(lirePieces(JSON.stringify(trop))).toHaveLength(PIECES_MAXIMUM);
    expect(lirePieces(ecrirePieces(trop))).toHaveLength(PIECES_MAXIMUM);
  });
});

describe("écrire les pièces", () => {
  it("rien à joindre n'écrit rien", () => {
    expect(ecrirePieces([])).toBeNull();
  });
});
