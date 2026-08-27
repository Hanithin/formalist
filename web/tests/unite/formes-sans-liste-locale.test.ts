import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Le vocabulaire d'une forme se lit dans la table, jamais dans une liste locale.
 *
 * Il était décidé à onze endroits, chacun avec la sienne, aucune complète. Le gabarit
 * d'approbation des comptes en nommait trois, si bien qu'une SELAS approuvait ses
 * comptes en parlant de parts sociales. L'annonce légale en nommait cinq et publiait
 * « Représentant légal » pour toutes les autres. Le traité d'apport citait à une SELARL
 * l'article des sociétés par actions. Et l'avertissement du conjoint, que l'article
 * 1832-2 du code civil impose pour les parts non négociables, n'était offert qu'à
 * quatre formes : l'apport d'un bien commun à une SCP se faisait sans lui.
 *
 * Aucune de ces listes ne faisait échouer quoi que ce soit : chacune se contentait de
 * rendre la mauvaise réponse pour les formes qu'elle ignorait. C'est pourquoi elles
 * sont gardées ici, à la source.
 */

const RACINE = path.join(__dirname, "..", "..", "src");

/** Les tables légitimes : celles qui déclarent, et celles qui traduisent le registre. */
const DECLARATIONS = [
  path.join("domain", "formalite", "formes.ts"),
  path.join("domain", "formalite", "categories-juridiques.ts"),
  /*
   * Celui-ci ne décide d'aucun vocabulaire : il inventorie les cinq gabarits hérités,
   * un par forme, qui subsistent sur le disque. Une forme y figure parce qu'un fichier
   * porte son nom, non parce qu'on aurait choisi de la traiter autrement.
   */
  path.join("domain", "formalite", "modifications.ts"),
];

/**
 * Une comparaison de sigles employée pour trancher du vocabulaire.
 *
 * On cherche deux sigles ou plus rapprochés dans une même expression - `f === "SAS" ||
 * f === "SASU"`, `["SARL", "EURL"].includes(...)`, `new Set(["SAS", "SA"])`. Un sigle
 * seul ne suffit pas : il peut désigner un gabarit propre à une forme, ce qui est
 * légitime.
 */
const SIGLES = "SASU|SARL|EURL|SELAS|SELARL|SELAFA|SELCA|SCA|SCS|SCP|SCM|SCEA|EARL|GAEC";
const LISTE_LOCALE = new RegExp('"(?:' + SIGLES + ')"[^\\n]{0,80}"(?:' + SIGLES + ')"');

function fichiers(dossier: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const complet = path.join(dossier, entree);
    if (statSync(complet).isDirectory()) {
      trouves.push(...fichiers(complet));
    } else if (/\.(ts|tsx|cjs)$/.test(entree)) {
      trouves.push(complet);
    }
  }
  return trouves;
}

describe("les listes de formes", () => {
  it("ne sont écrites qu'à l'endroit qui les déclare", () => {
    const fautifs: string[] = [];

    for (const fichier of fichiers(RACINE)) {
      const relatif = path.relative(RACINE, fichier);
      if (DECLARATIONS.includes(relatif)) continue;

      const lignes = readFileSync(fichier, "utf8").split("\n");
      lignes.forEach((ligne, rang) => {
        /* Un commentaire peut citer des sigles : il ne décide de rien. */
        const nette = ligne.trim();
        if (nette.startsWith("*") || nette.startsWith("//")) return;
        if (LISTE_LOCALE.test(ligne)) fautifs.push(relatif + ":" + (rang + 1));
      });
    }

    expect(fautifs).toEqual([]);
  });
});
