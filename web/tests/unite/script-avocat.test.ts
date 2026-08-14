import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PLAGES_PAR_DEFAUT, refusDePlage } from "@/domain/consultation/disponibilites";

/**
 * Le script de création d'un avocat pose bien les plages du domaine.
 *
 * scripts/creer-avocat.js écrit directement en base : c'est un outil d'exploitation,
 * lancé contre la production sans passer par l'application. Il recopie donc les plages
 * par défaut, et une divergence ne se verrait pas - l'avocat serait créé, les créneaux
 * proposés seraient simplement les mauvais.
 */
const SCRIPT = readFileSync(path.join(process.cwd(), "..", "scripts", "creer-avocat.js"), "utf8");

/** Relit la liste écrite dans le script, sans l'exécuter. */
function plagesDuScript() {
  const bloc =
    /const PLAGES_PAR_DEFAUT = \[([^\]]*)\]\.flatMap\(\(jour\) => \[([\s\S]*?)\]\);/.exec(SCRIPT);
  if (!bloc) throw new Error("PLAGES_PAR_DEFAUT introuvable dans le script");

  const jours = bloc[1].split(",").map((j) => Number(j.trim()));
  const modeles = [
    ...bloc[2].matchAll(/debut: "(\d{2}:\d{2})", fin: "(\d{2}:\d{2})", duree: (\d+)/g),
  ];

  return jours.flatMap((jour) =>
    modeles.map((m) => ({
      jourSemaine: jour,
      debut: m[1],
      fin: m[2],
      dureeCreneauMinutes: Number(m[3]),
    }))
  );
}

describe("le script de création d'un avocat", () => {
  it("pose exactement les plages par défaut du domaine", () => {
    expect(plagesDuScript()).toEqual(PLAGES_PAR_DEFAUT);
  });

  it("les plages qu'il pose sont acceptables une à une", () => {
    // Le script écrit en SQL direct, sans passer par la vérification du domaine :
    // c'est ici qu'on s'assure qu'il ne pose pas de chevauchement.
    const posees: typeof PLAGES_PAR_DEFAUT = [];
    for (const p of plagesDuScript()) {
      expect(refusDePlage(p, posees)).toBeNull();
      posees.push(p);
    }
  });

  it("ne prend ni mot de passe ni adresse de base en argument", () => {
    /*
     * Un secret passé en argument est visible de tout processus de la machine, et
     * reste dans l'historique du shell. Le script les lit dans des fichiers.
     */
    expect(SCRIPT).toContain("--mot-de-passe-depuis");
    expect(SCRIPT).not.toMatch(/argument\("mot-de-passe"\)/);
    expect(SCRIPT).not.toMatch(/argument\("url"\)/);
  });
});
