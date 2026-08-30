import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Tout champ de saisie porte un nom.
 *
 * Un `<input>` sans étiquette s'annonce « zone de texte » à la synthèse vocale, et
 * « Choisir un fichier » quand c'est un dépôt : la personne entend le contrôle, jamais
 * ce qu'on lui demande. Trois l'étaient ici, dont deux masqués aux yeux mais non au
 * clavier - le champ de fichier que le style réduit à un pixel garde sa place dans
 * l'ordre de tabulation, et c'est bien ce qu'il faut pour qu'on l'atteigne.
 *
 * Le contrôle vaut mieux qu'une relecture : un champ s'ajoute vite, et son étiquette
 * s'oublie de même.
 */

const RACINES = ["src/app", "src/components"];

/**
 * Les composants de saisie du dossier : ils tiennent leur nom de qui les pose.
 *
 * `DepotFichier` n'y est pas : il se nomme lui-même, par l'invite qu'il affiche ou par
 * « Remplacer le fichier déposé ». C'est le seul qui rende autre chose qu'un champ nu.
 */
const COMPOSANTS = [
  "ChampChoix",
  "ChampDate",
  "ChampNombre",
  "AdresseUneLigne",
  "Adresse",
  "ChampIdentite",
];

/*
 * Ce qui échappe à la règle, et pourquoi.
 *
 * Un champ retiré de l'arbre d'accessibilité - `display: none`, ou l'attribut `hidden` -
 * n'est pas atteignable : c'est le bouton qui l'actionne qui porte le nom. Les listes
 * sont nominatives pour qu'un nouveau cas se présente au lieu de se fondre.
 */
const HORS_ARBRE: Record<string, string> = {
  "src/app/(app)/messagerie/Messagerie.tsx":
    "le champ de fichier est en display:none, ouvert par le bouton trombone",
  "src/app/(app)/avocat/[dossier]/Travail.tsx":
    "le champ de dépôt est posé à l'intérieur du <label> de la tâche",
};

function fichiers(racine: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(racine, { withFileTypes: true })) {
    const chemin = path.join(racine, entree.name);
    if (entree.isDirectory()) trouves.push(...fichiers(chemin));
    else if (entree.name.endsWith(".tsx")) trouves.push(chemin);
  }
  return trouves;
}

/**
 * Les commentaires parlent de `<select>` sans en poser.
 *
 * On les blanchit sur place plutôt que de les retirer : les numéros de ligne du
 * constat doivent être ceux du fichier, sans quoi il n'y a rien à ouvrir.
 */
function sansCommentaires(source: string): string {
  const blanc = (bloc: string) => bloc.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blanc)
    .replace(/^([ \t]*)\/\/.*$/gm, (ligne) => blanc(ligne));
}

/** Depuis « <input », la position du « > » qui ferme - accolades et guillemets comptés. */
function finDeBalise(source: string, depart: number): number {
  let profondeur = 0;
  let guillemet: string | null = null;
  for (let i = depart; i < source.length; i++) {
    const c = source[i];
    if (guillemet) {
      if (c === guillemet) guillemet = null;
    } else if (c === '"' || c === "'" || c === "`") guillemet = c;
    else if (c === "{") profondeur++;
    else if (c === "}") profondeur--;
    else if (c === ">" && profondeur === 0) return i;
  }
  return source.length;
}

function sansEspaces(texte: string): string {
  return texte.replace(/\s+/g, "");
}

/** Ce qu'un `<label htmlFor>` ou un `<Champ id>` désigne, tel qu'écrit. */
function identifiantsNommes(source: string): Set<string> {
  const nommes = new Set<string>();
  for (const m of source.matchAll(/htmlFor=\{/g)) {
    nommes.add(sansEspaces(source.slice(m.index! + m[0].length, source.indexOf("}", m.index!))));
  }
  for (const m of source.matchAll(/htmlFor="([^"]*)"/g)) nommes.add('"' + m[1] + '"');
  for (const m of source.matchAll(/<Champ\b/g)) {
    const attrs = source.slice(m.index!, finDeBalise(source, m.index!));
    const parExpression = /id=\{/.exec(attrs);
    if (parExpression) {
      nommes.add(
        sansEspaces(attrs.slice(parExpression.index + parExpression[0].length, attrs.indexOf("}", parExpression.index)))
      );
    }
    const parTexte = /id="([^"]*)"/.exec(attrs);
    if (parTexte) nommes.add('"' + parTexte[1] + '"');
  }
  return nommes;
}

function identifiantDe(attrs: string): string | null {
  const parExpression = /id=\{/.exec(attrs);
  if (parExpression) {
    return sansEspaces(
      attrs.slice(parExpression.index + parExpression[0].length, attrs.indexOf("}", parExpression.index))
    );
  }
  const parTexte = /id="([^"]*)"/.exec(attrs);
  return parTexte ? '"' + parTexte[1] + '"' : null;
}

describe("les champs de saisie", () => {
  const sources = RACINES.flatMap(fichiers).map((f) => ({ f, source: sansCommentaires(readFileSync(f, "utf-8")) }));

  it("portent tous un nom accessible", () => {
    const sans: string[] = [];

    for (const { f, source } of sources) {
      if (HORS_ARBRE[f]) continue;
      /* Un composant partagé tient son nom de qui le pose : c'est l'usage qu'on vérifie. */
      const partage = f.startsWith("src/components/formulaire/");
      const nommes = identifiantsNommes(source);
      const etiquettes = [...source.matchAll(/<label\b/g)].map((m) => [
        m.index!,
        source.indexOf("</label>", m.index!),
      ]);

      const balises = partage ? [] : [...source.matchAll(/<(input|select|textarea)\b/g)];
      for (const m of balises) {
        const attrs = source.slice(m.index! + m[0].length, finDeBalise(source, m.index!));
        if (/type=\s*"(hidden|checkbox|radio|submit|button)"/.test(attrs)) continue;
        if (/\bhidden\b/.test(attrs)) continue;
        if (attrs.includes("aria-label")) continue;
        if (/\{\s*\.\.\./.test(attrs)) continue;
        const cle = identifiantDe(attrs);
        if (cle && nommes.has(cle)) continue;
        if (etiquettes.some(([d, fin]) => d < m.index! && m.index! < (fin > 0 ? fin : Infinity))) continue;
        sans.push(`${f}:${source.slice(0, m.index).split("\n").length} <${m[1]}>`);
      }

      for (const nom of COMPOSANTS) {
        for (const m of source.matchAll(new RegExp("<" + nom + "\\b", "g"))) {
          const attrs = source.slice(m.index! + m[0].length, finDeBalise(source, m.index!));
          if (attrs.includes("aria-label")) continue;
          const cle = identifiantDe(attrs);
          if (cle && nommes.has(cle)) continue;
          if (etiquettes.some(([d, fin]) => d < m.index! && m.index! < (fin > 0 ? fin : Infinity))) continue;
          /* Un composant qui en enveloppe un autre lui passe l'identifiant reçu. */
          if (partage && cle === "id") continue;
          sans.push(`${f}:${source.slice(0, m.index).split("\n").length} <${nom}>`);
        }
      }
    }

    expect(sans).toEqual([]);
  });

  it("garde les exceptions nominatives", () => {
    /* Une exception qui perd son fichier est une exception qui a perdu sa raison. */
    for (const chemin of Object.keys(HORS_ARBRE)) {
      expect(sources.some((s) => s.f === chemin), chemin).toBe(true);
    }
  });
});
