import { describe, it, expect } from "vitest";
import {
  decrireLeChangement,
  inscrire,
  memeEtat,
  peutAvancer,
  peutRevenir,
  positionValide,
  ETAPES_GARDEES,
  type EtapeDHistorique,
  type EtatRetouche,
} from "@/domain/modification/historique";
import type { Retouche } from "@/domain/modification/edition";

/**
 * L'historique des retouches.
 *
 * Retoucher des statuts est un travail d'ajustements. Sans trace, une fausse
 * manœuvre - une page supprimée par mégarde, un cadre posé au mauvais endroit - se
 * rattrape en refaisant tout de mémoire.
 */

const cadre = (modifications: Partial<Retouche> = {}): Retouche => ({
  page: 1,
  x: 60,
  y: 100,
  largeur: 200,
  hauteur: 14,
  texte: "Texte",
  taille: 11,
  ...modifications,
});

const etat = (modifications: Partial<EtatRetouche> = {}): EtatRetouche => ({
  retouches: [cadre()],
  pagesRetirees: [],
  ...modifications,
});

describe("ce qui a changé, dit en une ligne", () => {
  it("nomme la page écartée, et sa remise", () => {
    /*
     * « Modifié » ne dit rien quand on cherche le geste qui a tout cassé : on doit
     * reconnaître l'étape sans avoir à l'essayer.
     */
    expect(decrireLeChangement(etat(), etat({ pagesRetirees: [3] }))).toBe("Page 3 écartée");
    expect(decrireLeChangement(etat({ pagesRetirees: [3] }), etat())).toBe("Page 3 remise");
  });

  it("nomme la page d'un cadre ajouté ou supprimé", () => {
    const avec = etat({ retouches: [cadre(), cadre({ page: 4 })] });
    expect(decrireLeChangement(etat(), avec)).toBe("Cadre ajouté page 4");
    expect(decrireLeChangement(avec, etat())).toBe("Cadre supprimé");
  });

  it("distingue le texte, le déplacement et la taille", () => {
    // Les trois ne se rattrapent pas de la même façon.
    expect(decrireLeChangement(etat(), etat({ retouches: [cadre({ texte: "Autre" })] }))).toBe(
      "Texte réécrit page 1"
    );
    expect(decrireLeChangement(etat(), etat({ retouches: [cadre({ x: 200 })] }))).toBe(
      "Cadre déplacé page 1"
    );
    expect(decrireLeChangement(etat(), etat({ retouches: [cadre({ largeur: 300 })] }))).toBe(
      "Cadre redimensionné page 1"
    );
    expect(decrireLeChangement(etat(), etat({ retouches: [cadre({ gras: true })] }))).toBe(
      "Mise en forme changée page 1"
    );
    expect(
      decrireLeChangement(
        etat(),
        etat({ retouches: [cadre({ fragments: [{ texte: "Tex" }, { texte: "te", gras: true }] })] })
      )
    ).toBe("Mise en forme changée page 1");
  });
});

describe("les gestes sans effet", () => {
  it("ne font pas une étape", () => {
    /*
     * L'enregistrement se déclenche plusieurs fois pendant une frappe : sans ce
     * contrôle, l'historique se remplirait d'étapes identiques.
     */
    expect(memeEtat(etat(), etat())).toBe(true);
    // Un demi-pixel de déplacement n'est pas un geste non plus.
    expect(memeEtat(etat(), etat({ retouches: [cadre({ x: 60.4 })] }))).toBe(true);
    expect(memeEtat(etat(), etat({ retouches: [cadre({ x: 90 })] }))).toBe(false);
  });

  it("un texte découpé en un seul morceau n'est pas une mise en forme changée", () => {
    /*
     * La saisie produit un découpage dès qu'on entre dans le cadre, même sans rien
     * mettre en gras. Le comparer à l'absence de découpage faisait inscrire « mise en
     * forme changée » pour un simple clic.
     */
    const decoupe = etat({ retouches: [cadre({ fragments: [{ texte: "Texte" }] })] });
    expect(memeEtat(etat(), decoupe)).toBe(true);

    const gras = etat({ retouches: [cadre({ fragments: [{ texte: "Texte", gras: true }] })] });
    expect(memeEtat(etat(), gras)).toBe(false);
  });
});

describe("l'inscription", () => {
  const etape = (libelle: string): EtapeDHistorique => ({
    ...etat(),
    quand: "2026-08-16T10:00:00.000Z",
    qui: "Maître Dupont",
    libelle,
  });

  it("un geste posé après un retour abandonne ce qui suivait", () => {
    /*
     * C'est la règle de tout historique : faire autrement laisserait un avenir qui ne
     * découle plus de l'état courant.
     */
    const trois = [etape("un"), etape("deux"), etape("trois")];
    const suite = inscrire(trois, 0, etape("autre"));

    expect(suite.historique.map((e) => e.libelle)).toEqual(["un", "autre"]);
    expect(suite.position).toBe(1);
  });

  it("l'historique reste borné", () => {
    // Un historique n'est pas une archive : le plus ancien s'oublie.
    let etat_ = { historique: [] as EtapeDHistorique[], position: -1 };
    for (let i = 0; i < ETAPES_GARDEES + 10; i++) {
      etat_ = inscrire(etat_.historique, etat_.position, etape("geste " + i));
    }

    expect(etat_.historique).toHaveLength(ETAPES_GARDEES);
    expect(etat_.historique[0].libelle).toBe("geste 10");
    expect(etat_.position).toBe(ETAPES_GARDEES - 1);
  });

  it("on revient en arrière et en avant tant qu'il y a de quoi", () => {
    const trois = [etape("un"), etape("deux"), etape("trois")];

    expect(peutRevenir(0)).toBe(false);
    expect(peutRevenir(2)).toBe(true);
    expect(peutAvancer(trois, 2)).toBe(false);
    expect(peutAvancer(trois, 0)).toBe(true);
  });

  it("une position venue du réseau est ramenée dans les bornes", () => {
    const trois = [etape("un"), etape("deux"), etape("trois")];
    expect(positionValide(trois, -5)).toBe(0);
    expect(positionValide(trois, 99)).toBe(2);
    expect(positionValide(trois, 1)).toBe(1);
  });
});
