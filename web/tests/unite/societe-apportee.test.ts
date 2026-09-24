import { describe, it, expect } from "vitest";
import {
  demarchesDeLApport,
  devientUnipersonnelle,
  ceQuiNEstPasDu,
  MOMENTS,
} from "@/domain/modification/societe-apportee";

/**
 * Ce que doit la société dont les titres sont apportés.
 *
 * Le parcours d'apport ne parlait que de la holding. L'opération se terminait sur une
 * holding au capital augmenté et une société dont les registres nommaient toujours
 * l'apporteur - l'apport n'était opposable à personne.
 */

const SARL = { apporteeForme: "SARL", apporteeDenomination: "LE GREMLIN" };
const SAS = { apporteeForme: "SAS", apporteeDenomination: "LE GREMLIN" };

function cles(contexte: Parameters<typeof demarchesDeLApport>[0]) {
  return demarchesDeLApport(contexte).map((d) => d.cle);
}

describe("les démarches de la société apportée", () => {
  it("ne devine rien tant que la forme n'est pas connue", () => {
    // Annoncer une démarche fausse fait cesser de croire les vraies.
    expect(demarchesDeLApport({})).toEqual([]);
    expect(demarchesDeLApport({ apporteeDenomination: "LE GREMLIN" })).toEqual([]);
  });

  it("exige l'agrément des associés dans une société à parts sociales", () => {
    const agrement = demarchesDeLApport(SARL).find((d) => d.cle === "agrement");

    expect(agrement).toBeTruthy();
    /* Il se donne avant : après la signature, il ne rattrape rien. */
    expect(agrement!.moment).toBe("avant");
    expect(agrement!.intitule).toContain("LE GREMLIN");
    expect(agrement!.fondement).toContain("L. 223-14");
  });

  it("n'invente pas d'agrément légal dans une société par actions", () => {
    const demarches = demarchesDeLApport(SAS);

    expect(demarches.map((d) => d.cle)).not.toContain("agrement");
    /* Mais les clauses statutaires sont fréquentes : on renvoie aux statuts. */
    const relecture = demarches.find((d) => d.cle === "agrement-statutaire");
    expect(relecture?.moment).toBe("avant");
    expect(relecture?.explication).toMatch(/statuts/i);
  });

  it("met les statuts à jour pour des parts, le registre des titres pour des actions", () => {
    expect(cles(SARL)).toContain("statuts-apportee");
    expect(cles(SARL)).not.toContain("registre-mouvements");

    expect(cles(SAS)).toContain("registre-mouvements");
    expect(cles(SAS)).not.toContain("statuts-apportee");
  });

  it("dit que l'inscription au registre est le transfert lui-même", () => {
    const registre = demarchesDeLApport(SAS).find((d) => d.cle === "registre-mouvements")!;

    expect(registre.moment).toBe("le-jour");
    expect(registre.fondement).toContain("L. 228-1");
    expect(registre.explication).toMatch(/transf[eè]re la propriété/i);
  });

  it("déclare les bénéficiaires effectifs des deux sociétés, quelle que soit la forme", () => {
    for (const contexte of [SARL, SAS]) {
      const rbe = demarchesDeLApport(contexte).filter((d) => d.cle.startsWith("rbe-"));
      expect(rbe).toHaveLength(2);
      expect(rbe.map((d) => d.societe).sort()).toEqual(["apportee", "holding"]);
      for (const d of rbe) expect(d.moment).toBe("trente-jours");
    }
  });

  it("ne dépose au guichet que ce qui s'y dépose", () => {
    // Les actionnaires ne figurent pas aux statuts : il n'y a rien à redéposer.
    expect(cles(SARL)).toContain("depot-statuts-apportee");
    expect(cles(SAS)).not.toContain("depot-statuts-apportee");
  });

  it("relève l'unipersonnalité quand la holding prend tout", () => {
    const tout = { ...SARL, apportNbTitres: 100, apporteeNbTitres: 100 };
    const partie = { ...SARL, apportNbTitres: 60, apporteeNbTitres: 100 };

    expect(devientUnipersonnelle(tout)).toBe(true);
    expect(devientUnipersonnelle(partie)).toBe(false);
    expect(cles(tout)).toContain("unipersonnelle");
    expect(cles(partie)).not.toContain("unipersonnelle");
  });

  it("ne devine pas l'unipersonnalité sur un champ vide", () => {
    // Zéro sur zéro n'est pas « la holding prend tout » : c'est un formulaire à moitié
    // rempli, et l'on y annoncerait une démarche qui n'existe pas.
    expect(devientUnipersonnelle(SARL)).toBe(false);
    expect(devientUnipersonnelle({ ...SARL, apportNbTitres: 100 })).toBe(false);
  });

  it("range les démarches dans l'ordre du temps", () => {
    const rangs = new Map(MOMENTS.map((m, rang) => [m.cle, rang]));
    const suite = demarchesDeLApport({ ...SARL, apportNbTitres: 100, apporteeNbTitres: 100 }).map(
      (d) => rangs.get(d.moment)!
    );

    expect(suite).toEqual([...suite].sort((a, b) => a - b));
  });

  it("dit aussi ce qui n'est pas dû", () => {
    // Les vendeurs d'annonces légales affirment le contraire, et un client les croit.
    expect(ceQuiNEstPasDu(SARL).join(" ")).toMatch(/aucune annonce légale/i);
    expect(ceQuiNEstPasDu(SAS).join(" ")).toMatch(/statuts.*ne changent pas/i);
    expect(ceQuiNEstPasDu({})).toEqual([]);
  });

  it("nomme la société quand elle est connue, et la désigne sinon", () => {
    expect(demarchesDeLApport(SARL)[0].intitule).toContain("LE GREMLIN");
    expect(demarchesDeLApport({ apporteeForme: "SARL" })[0].intitule).toContain(
      "la société dont les titres sont apportés"
    );
  });
});
