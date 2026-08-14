import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { verifier } from "@/lib/mots-de-passe";

/**
 * Le script de réinitialisation hache comme l'application vérifie.
 *
 * scripts/reinitialiser-mot-de-passe.js écrit directement en base, sans passer par le
 * code de l'application : c'est un outil d'exploitation, lancé en production contre un
 * conteneur qu'on ne veut pas modifier. Il doit donc recopier les paramètres de
 * hachage, et une divergence d'un seul chiffre produirait une empreinte que la
 * connexion refuse - avec le même message que pour un mot de passe faux, donc sans
 * moyen de comprendre ce qui se passe.
 *
 * Ce test vérifie les deux choses : que les constantes concordent, et qu'une empreinte
 * calculée comme le fait le script est bien acceptée par l'application.
 */
const SCRIPT = readFileSync(
  path.join(process.cwd(), "..", "scripts", "reinitialiser-mot-de-passe.js"),
  "utf8"
);
const SOURCE = readFileSync(path.join(process.cwd(), "src", "lib", "mots-de-passe.ts"), "utf8");

function constante(texte: string, nom: string): string {
  const m = new RegExp("const " + nom + " = ([^;]+);").exec(texte);
  if (!m) throw new Error(nom + " introuvable");
  return m[1].trim().replace(/_/g, "");
}

describe("le script de réinitialisation de mot de passe", () => {
  it("reprend les paramètres de hachage de l'application", () => {
    for (const nom of ["ITERATIONS", "LONGUEUR_CLE", "ALGORITHME"]) {
      expect(constante(SCRIPT, nom)).toBe(constante(SOURCE, nom));
    }
  });

  it("produit une empreinte que l'application accepte", () => {
    // Les paramètres tels que le script les emploie, recopiés ici volontairement :
    // si l'un des deux fichiers change, ce test doit le voir.
    const sel = crypto.randomBytes(16).toString("hex");
    const empreinte = {
      salt: sel,
      hash: crypto.pbkdf2Sync("brouette-lampadaire-42", sel, 100_000, 64, "sha512").toString("hex"),
    };

    expect(verifier("brouette-lampadaire-42", empreinte)).toBe(true);
    expect(verifier("un-autre-mot-de-passe", empreinte)).toBe(false);
  });
});
