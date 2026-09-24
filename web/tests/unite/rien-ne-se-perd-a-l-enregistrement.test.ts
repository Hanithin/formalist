import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ASSOCIE, CESSION } from "@/app/api/formalites/modification/route";

/**
 * Ce que l'écran écrit, la route doit l'accepter.
 *
 * Zod écarte en silence ce qu'un schéma ne déclare pas. Deux listes de personnes en ont
 * fait les frais : l'état civil des associés, demandé à l'étape des cessions parce que
 * l'acte identifie chaque partie, et dix champs de l'acquéreur - sa nature, son état
 * civil, sa forme, son capital, son SIREN, son greffe, son représentant, l'origine des
 * titres. Le client les remplissait, l'écran les affichait, l'enregistrement les
 * retirait, et l'écran du règlement les réclamait ensuite un à un.
 *
 * L'erreur ne se voit pas : ni refus, ni journal, seulement des champs qui redeviennent
 * vides au rechargement. Pire, la nature de l'acquéreur partait avec le reste, et c'est
 * elle qui décide de l'affichage : le bloc de la société disparaissait en emportant la
 * question autant que la réponse.
 *
 * L'essai lit les deux sources - l'interface du domaine et le schéma de la route - et les
 * compare. Ajouter un champ d'un seul côté le fait tomber, ce qui est tout ce qu'on lui
 * demande.
 */

const RACINE = path.join(process.cwd(), "src");

/**
 * Les champs qu'une interface déclare, lus dans son texte.
 *
 * Grossier mais suffisant : ces interfaces sont des sacs de champs plats, écrits à la
 * main, et c'est justement leur écart avec le schéma qu'on cherche. Une lecture par le
 * compilateur coûterait bien plus cher que ce qu'elle rapporterait ici.
 */
function champsDeLInterface(fichier: string, nom: string): string[] {
  const source = readFileSync(path.join(RACINE, fichier), "utf8");
  const debut = source.indexOf("export interface " + nom + " {");
  if (debut < 0) throw new Error("interface introuvable : " + nom);

  const corps = source.slice(debut, source.indexOf("\n}", debut));
  return [...corps.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
}

describe("l'enregistrement d'une modification ne perd aucun champ", () => {
  it("accepte tout ce qu'un associé porte", () => {
    const domaine = champsDeLInterface("domain/modification/gabarit.ts", "AssociePresent");
    const route = Object.keys(ASSOCIE.shape);

    expect(domaine.length).toBeGreaterThan(0);
    expect([...domaine].sort()).toEqual([...route].sort());
  });

  it("accepte tout ce qu'une cession porte", () => {
    const domaine = champsDeLInterface("domain/modification/cession.ts", "Cession");
    const route = Object.keys(CESSION.shape);

    expect(domaine.length).toBeGreaterThan(0);
    expect([...domaine].sort()).toEqual([...route].sort());
  });

  it("laisse passer un associé complet sans rien lui retirer", () => {
    /* Le contrôle par le comportement, en plus de celui par les noms. */
    const complet = {
      nature: "physique" as const,
      parts: 1000,
      civilite: "Monsieur",
      prenom: "Valentin",
      nom: "TULLIO",
      neLe: "1990-02-11",
      neA: "Lyon 3e (69003)",
      nationalite: "Française",
      adresse: "8 rue Bellecour, 69002 Lyon",
    };

    expect(ASSOCIE.parse(complet)).toEqual(complet);
  });

  it("laisse passer une cession complète sans rien lui retirer", () => {
    const complete = {
      cedant: 0,
      parts: 1000,
      prix: 35000,
      date: "2026-09-04",
      vers: "tiers" as const,
      cessionnaire: null,
      nature: "morale" as const,
      nom: "SUPERNOVA INT",
      adresse: "6 avenue du Docteur Roux, 92380 Garches",
      forme: "SCI",
      capital: 500,
      siren: "103909123",
      villeRcs: "Nanterre",
      representant: "son Président, Monsieur Paul DURAND",
      origine: "Souscription à la constitution",
    };

    expect(CESSION.parse(complete)).toEqual(complete);
  });
});
