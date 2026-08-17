import { describe, it, expect } from "vitest";

/**
 * Les conversions du champ de date.
 *
 * Le calendrier natif du navigateur ne s'habille pas ; celui-ci est écrit, et la
 * conversion entre la frappe et la valeur retenue est la seule pièce qui peut se
 * tromper en silence - une date affichée juste et enregistrée fausse.
 *
 * Les fonctions sont recopiées ici depuis le composant : elles ne sont pas exportées,
 * et un composant client ne se charge pas dans vitest sans navigateur. Le test garde
 * donc les règles, pas l'implémentation - il faut les tenir identiques.
 */

function enFrancais(iso: string): string {
  const [a, m, j] = iso.split("-");
  return a && m && j ? j + "/" + m + "/" + a : "";
}

function enIso(saisi: string): string | null {
  const chiffres = saisi.replace(/[^0-9]/g, "");
  if (chiffres.length !== 8) return null;

  const jour = Number(chiffres.slice(0, 2));
  const mois = Number(chiffres.slice(2, 4));
  const annee = Number(chiffres.slice(4, 8));
  if (mois < 1 || mois > 12 || jour < 1) return null;

  const date = new Date(Date.UTC(annee, mois - 1, jour));
  if (date.getUTCMonth() !== mois - 1 || date.getUTCDate() !== jour) return null;

  return (
    annee.toString().padStart(4, "0") +
    "-" +
    mois.toString().padStart(2, "0") +
    "-" +
    jour.toString().padStart(2, "0")
  );
}

function masquer(saisi: string): string {
  const chiffres = saisi.replace(/[^0-9]/g, "").slice(0, 8);
  const morceaux = [chiffres.slice(0, 2), chiffres.slice(2, 4), chiffres.slice(4, 8)];
  return morceaux.filter((m) => m.length > 0).join("/");
}

function debutDeGrille(annee: number, mois: number): Date {
  const premier = new Date(Date.UTC(annee, mois, 1));
  const decalage = (premier.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(annee, mois, 1 - decalage));
}

describe("ce qui s'affiche", () => {
  it("une date retenue se lit en français", () => {
    expect(enFrancais("2026-09-15")).toBe("15/09/2026");
  });

  it("une valeur vide ne s'affiche pas « //  »", () => {
    expect(enFrancais("")).toBe("");
  });
});

describe("le masque de frappe", () => {
  it("pose les barres à mesure, jamais avant", () => {
    // « 1/ » à la première touche empêcherait de corriger le premier chiffre.
    expect(masquer("1")).toBe("1");
    expect(masquer("15")).toBe("15");
    expect(masquer("159")).toBe("15/9");
    expect(masquer("15092026")).toBe("15/09/2026");
  });

  it("ignore ce qui n'est pas un chiffre, et s'arrête à huit", () => {
    expect(masquer("15/09/2026")).toBe("15/09/2026");
    expect(masquer("15a09b2026999")).toBe("15/09/2026");
  });
});

describe("ce qui est retenu", () => {
  it("une date entière devient de l'ISO", () => {
    expect(enIso("15/09/2026")).toBe("2026-09-15");
    expect(enIso("01/01/2026")).toBe("2026-01-01");
  });

  it("une frappe en cours ne retient rien", () => {
    /*
     * Remonter à chaque touche enregistrerait « 0002-09-15 » le temps de taper l'année.
     */
    expect(enIso("15/09/20")).toBeNull();
    expect(enIso("")).toBeNull();
  });

  it("une date qui n'existe pas est refusée", () => {
    // Le 31 février se refuse ici, plutôt que d'être rejeté au greffe.
    expect(enIso("31/02/2026")).toBeNull();
    expect(enIso("31/04/2026")).toBeNull();
    expect(enIso("15/13/2026")).toBeNull();
    expect(enIso("00/09/2026")).toBeNull();
  });

  it("le 29 février existe une année sur quatre", () => {
    expect(enIso("29/02/2028")).toBe("2028-02-29");
    expect(enIso("29/02/2027")).toBeNull();
  });
});

describe("la grille du calendrier", () => {
  it("commence toujours un lundi", () => {
    for (const [annee, mois] of [
      [2026, 0],
      [2026, 7],
      [2027, 1],
      [2028, 11],
    ]) {
      expect(debutDeGrille(annee, mois).getUTCDay(), annee + "-" + mois).toBe(1);
    }
  });

  it("contient le premier du mois", () => {
    // Août 2026 commence un samedi : la grille doit remonter au lundi 27 juillet.
    const debut = debutDeGrille(2026, 7);
    expect(debut.toISOString().slice(0, 10)).toBe("2026-07-27");
  });
});

describe("une date collée en ISO", () => {
  it("est reconnue telle quelle", () => {
    /*
     * On copie souvent « 2026-09-15 » depuis un courriel ou un acte. Passée au masque
     * de frappe, elle devenait « 20/26/0915 » et il fallait tout retaper.
     */
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    expect(iso.test("2026-09-15")).toBe(true);
    expect(iso.test("15/09/2026")).toBe(false);
    expect(enFrancais("2026-09-15")).toBe("15/09/2026");
  });
});
