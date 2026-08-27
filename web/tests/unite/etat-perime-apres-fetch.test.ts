import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Une réponse du réseau n'écrit jamais depuis l'état du rendu.
 *
 * Chercher une société au registre remplit le formulaire en deux temps : la fiche de
 * l'annuaire arrive tout de suite, puis le capital et le greffe compétent après un
 * aller-retour chacun. Les écritures différées étaient bâties sur `etat.societe`, la
 * société telle qu'elle était au rendu - donc telle qu'elle était *avant* la recherche.
 * Chaque réponse rendait donc au formulaire son état d'avant, augmenté de son seul
 * champ à elle.
 *
 * Au dépôt des comptes, on voyait la dénomination, le SIREN, le siège et le capital
 * s'inscrire, et la ville rester vide - alors qu'elle venait du même appel que le siège.
 * La ville du RCS restait vide aussi : les deux réponses partant du même état périmé,
 * la seconde arrivée effaçait la première.
 *
 * Rien n'échouait : le formulaire s'ouvrait, se remplissait aux trois quarts, et se
 * laissait envoyer avec un greffe vide. C'est pourquoi la faute est gardée ici, à la
 * source, plutôt que par un test d'écran qui dépendrait de l'annuaire en ligne.
 */

const PARCOURS = path.join(__dirname, "..", "..", "src", "app", "(app)");

/** Les fichiers d'écran qui interrogent le registre. */
function parcoursDuRegistre(): { nom: string; source: string }[] {
  const trouves: { nom: string; source: string }[] = [];
  for (const dossier of readdirSync(PARCOURS, { withFileTypes: true })) {
    if (!dossier.isDirectory()) continue;
    const fichier = path.join(PARCOURS, dossier.name, "Parcours.tsx");
    let source: string;
    try {
      source = readFileSync(fichier, "utf8");
    } catch {
      continue;
    }
    if (source.includes("fetch(")) trouves.push({ nom: dossier.name, source });
  }
  return trouves;
}

/**
 * Le corps de chaque rappel de promesse, découpé aux parenthèses.
 *
 * On repart de `.then(` et on avance jusqu'à sa parenthèse fermante, en ignorant celles
 * des chaînes de caractères - une URL en contient.
 */
function corpsDesRappels(source: string): string[] {
  const corps: string[] = [];
  let depart = source.indexOf(".then(");

  while (depart !== -1) {
    let rang = depart + ".then(".length;
    let profondeur = 1;
    let guillemet: string | null = null;

    while (rang < source.length && profondeur > 0) {
      const c = source[rang];
      if (guillemet) {
        if (c === "\\") rang += 1;
        else if (c === guillemet) guillemet = null;
      } else if (c === '"' || c === "'" || c === "`") {
        guillemet = c;
      } else if (c === "(") {
        profondeur += 1;
      } else if (c === ")") {
        profondeur -= 1;
      }
      rang += 1;
    }

    corps.push(source.slice(depart, rang));
    depart = source.indexOf(".then(", rang);
  }

  return corps;
}

describe("les écritures différées", () => {
  const parcours = parcoursDuRegistre();

  it("porte sur des écrans qui existent", () => {
    /* Un renommage de dossier viderait le test sans que rien ne le dise. */
    expect(parcours.map((p) => p.nom).sort()).toContain("depot-des-comptes");
    expect(parcours.length).toBeGreaterThanOrEqual(3);
  });

  it.each(parcours)("ne repartent pas de l'état du rendu dans $nom", ({ source }) => {
    const fautifs = corpsDesRappels(source).filter((corps) => /\betat\./.test(corps));
    expect(fautifs).toEqual([]);
  });
});
