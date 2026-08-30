import { describe, it, expect } from "vitest";
import {
  colonneDeModification,
  type DonneesDeLaColonne,
} from "@/domain/modification/colonne";

/** Ce que la colonne dit d'une ligne, sans avoir à parcourir le tableau. */
function ligne(donnees: DonneesDeLaColonne, cle: string): string | null | undefined {
  return colonneDeModification(donnees).lignes.find((l) => l.cle === cle)?.valeur;
}

const SOCIETE = {
  denomination: "ATELIER MERIDIEN",
  forme: "SARL",
  siren: "842019336",
  ville: "Paris",
  capital: 30000,
};

describe("la colonne d'une modification neuve", () => {
  it("ne dit rien qu'elle ne sache", () => {
    const colonne = colonneDeModification({});

    expect(colonne.forme).toBeNull();
    expect(colonne.denomination).toBeNull();
    expect(colonne.changements).toEqual([]);
    expect(ligne({}, "siren")).toBeNull();
    expect(ligne({}, "capital")).toBeNull();
    expect(ligne({}, "assemblee")).toBeNull();
  });

  /*
   * Sept changements sur neuf ne touchent pas aux statuts - une nomination de gérant,
   * une cession de parts. La ligne aurait réclamé un document que personne ne demande.
   */
  it("la ligne des statuts n'existe que lorsqu'ils sont attendus", () => {
    expect(ligne({}, "statuts")).toBeUndefined();
    expect(ligne({ codes: ["dirigeant"] }, "statuts")).toBeUndefined();
    expect(ligne({ codes: ["transfert_siege"] }, "statuts")).toBeNull();
  });
});

describe("l'identité de la société", () => {
  it("le SIREN se lit par tranches de trois, le capital en euros", () => {
    expect(ligne({ societe: SOCIETE }, "siren")).toBe("842 019 336");
    expect(ligne({ societe: SOCIETE }, "capital")).toBe("30 000 €");
  });

  it("un capital à virgule garde ses centimes", () => {
    expect(ligne({ societe: { capital: 1500.5 } }, "capital")).toBe("1 500,50 €");
  });

  it("la date de l'assemblée s'écrit en toutes lettres", () => {
    expect(ligne({ assemblee: { date: "2026-05-15" } }, "assemblee")).toBe("15 mai 2026");
  });

  it("un capital nul est une réponse, une absence n'en est pas une", () => {
    // `0` est faux en JavaScript : le tester comme tel écrirait « à renseigner ».
    expect(ligne({ societe: { capital: 0 } }, "capital")).toBe("0 €");
    expect(ligne({ societe: { capital: null } }, "capital")).toBeNull();
  });
});

describe("ce que vous changez", () => {
  it("porte les intitulés courts, dans l'ordre choisi", () => {
    const colonne = colonneDeModification({
      codes: ["transfert_siege", "denomination", "cession_parts"],
    });
    expect(colonne.changements).toEqual(["Siège social", "Dénomination", "Cession"]);
  });

  it("un code inconnu ne laisse pas de trou", () => {
    /*
     * Le dossier porte ce qui y a été écrit un jour : un code retiré du catalogue depuis
     * ferait une puce vide au milieu de la liste.
     */
    const colonne = colonneDeModification({ codes: ["denomination", "n_importe_quoi"] });
    expect(colonne.changements).toEqual(["Dénomination"]);
  });
});

describe("l'origine des statuts", () => {
  it("se dit, quand ils sont là", () => {
    const avec = (source: string) =>
      ligne({ codes: ["transfert_siege"], statuts: { source } }, "statuts");

    expect(avec("depot")).toBe("déposés par vous");
    expect(avec("inpi")).toBe("repris du registre");
  });
});

describe("le total annoncé", () => {
  it("suit les changements cochés", () => {
    const seul = colonneDeModification({ codes: ["denomination"] }).total;
    const deux = colonneDeModification({ codes: ["denomination", "dirigeant"] }).total;

    expect(seul).not.toBe(deux);
    expect(seul).toMatch(/€/);
  });

  /*
   * Un transfert hors ressort impose deux annonces - une dans le département de départ,
   * une dans celui d'arrivée : le devis en dépend, et la colonne le lit tout de suite.
   */
  it("un transfert hors ressort coûte plus que dans le même", () => {
    const contexte = { codes: ["transfert_siege"], societe: SOCIETE };
    const meme = colonneDeModification({ ...contexte, valeurs: { nouvelleVille: "Paris" } });
    const ailleurs = colonneDeModification({ ...contexte, valeurs: { nouvelleVille: "Lyon" } });

    expect(meme.total).not.toBe(ailleurs.total);
  });
});
