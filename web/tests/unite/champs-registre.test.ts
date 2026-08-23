import { describe, it, expect } from "vitest";
import { MODIFICATIONS, champsASaisir } from "@/domain/modification/types";
import { verifierModification } from "@/domain/modification/verification";

/**
 * Les champs qu'une recherche au registre remplit.
 *
 * La correspondance est une table d'identifiants écrits à la main : une faute de
 * frappe n'y produit aucune erreur, elle produit un champ qui ne se remplit jamais.
 * On cherche la société, les cases restent vides, et rien ne dit pourquoi.
 */
describe("la recherche au registre", () => {
  const avecRegistre = MODIFICATIONS.flatMap((definition) =>
    definition.champs
      .filter((champ) => champ.type === "societe")
      .map((champ) => ({ definition, champ }))
  );

  it("ne désigne que des champs qui existent dans le même changement", () => {
    expect(avecRegistre.length).toBeGreaterThan(0);

    for (const { definition, champ } of avecRegistre) {
      const identifiants = new Set(definition.champs.map((c) => c.identifiant));

      for (const cible of Object.values(champ.remplit ?? {})) {
        expect(identifiants, definition.code + " → " + cible).toContain(cible);
      }
    }
  });

  it("verse le capital dans un champ qui attend un nombre", () => {
    /*
     * Le registre rend un nombre. Le poser dans un champ de texte laisserait passer
     * « 1 000 » là où le gabarit attend 1000, et le calcul de la part du capital
     * tomberait à zéro sans que rien ne le signale.
     */
    for (const { definition, champ } of avecRegistre) {
      const cible = champ.remplit?.capital;
      if (!cible) continue;

      const recu = definition.champs.find((c) => c.identifiant === cible);
      expect(recu?.type, definition.code + " → " + cible).toBe("nombre");
    }
  });

  it("verse le siège dans un champ d'adresse", () => {
    for (const { definition, champ } of avecRegistre) {
      const cible = champ.remplit?.siege;
      if (!cible) continue;

      const recu = definition.champs.find((c) => c.identifiant === cible);
      expect(recu?.type, definition.code + " → " + cible).toBe("adresse");
    }
  });
});

/**
 * Un formulaire entièrement rempli doit pouvoir passer.
 *
 * Les contrôles nomment leurs champs par des chaînes écrites à la main. Une faute de
 * frappe y réclame un champ qui n'existe pas : le formulaire est complet à l'écran,
 * la production des actes refuse, et le message désigne une case introuvable. C'est
 * arrivé avec « apporteSiren » là où le champ s'appelle « apporteeSiren ».
 */
describe("chaque changement, une fois rempli, est complet", () => {
  const SOCIETE = {
    denomination: "ESSAI COMPLET",
    forme: "SAS",
    siren: "552100554",
    adresse: "1 rue de l'Essai",
    codePostal: "75002",
    ville: "Paris",
    capital: 50000,
  };

  /** Une valeur plausible pour chaque type, de quoi remplir sans réfléchir. */
  function valeurPour(champ: { type: string; options?: string[] }): string | number {
    if (champ.type === "nombre") return 10;
    if (champ.type === "date") return "2026-10-05";
    if (champ.type === "choix") return champ.options?.[0] ?? "";
    return "Valeur d'essai";
  }

  for (const definition of MODIFICATIONS) {
    // La cession se vérifie sur sa liste d'associés, non sur des champs plats.
    if (definition.code === "cession_parts") continue;

    it(definition.code + " ne réclame rien qui n'existe", () => {
      /*
       * On remplit en deux passes : les champs conditionnels n'apparaissent qu'une
       * fois leur condition satisfaite par la première.
       */
      const valeurs: Record<string, string | number> = {};
      for (let passe = 0; passe < 2; passe += 1) {
        for (const champ of champsASaisir([definition.code], valeurs)) {
          if (valeurs[champ.identifiant] === undefined) {
            valeurs[champ.identifiant] = valeurPour(champ);
          }
        }
      }

      /*
       * Ce qui reste signalé est de l'incohérence - deux dates identiques, un capital
       * qui ne monte pas - et c'est très bien : ces contrôles font leur travail sur
       * des valeurs de remplissage. Ce qui n'est pas admissible, c'est qu'un refus
       * désigne une case que l'écran n'affiche pas : elle est alors impossible à
       * corriger, et le dossier ne peut plus avancer.
       */
      const affiches = new Set(definition.champs.map((c) => c.identifiant));
      const introuvables = verifierModification([definition.code], valeurs, SOCIETE)
        .map((m) => m.champ)
        .filter((champ) => !affiches.has(champ));

      expect(introuvables).toEqual([]);
    });
  }
});
