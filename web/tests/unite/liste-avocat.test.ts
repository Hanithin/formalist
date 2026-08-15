import { describe, it, expect } from "vitest";
import {
  correspond,
  trier,
  estTri,
  dansLaPeriode,
  periodeIncoherente,
  jourDe,
  paginer,
  DOSSIERS_PAR_PAGE,
  type DossierCherchable,
} from "@/domain/formalite/avocat";

const dossier = (modifications: Partial<DossierCherchable> = {}): DossierCherchable => ({
  status: "en_attente_validation",
  phase: 5,
  sousPhase: "5a",
  creePar: "client",
  reference: "#3686",
  societe: "ATELIER MERIDIEN",
  forme: "SASU",
  client: "Camille Parcours",
  clientEmail: "camille@exemple.test",
  creeLe: new Date("2026-08-10T10:00:00"),
  majLe: new Date("2026-08-14T10:00:00"),
  ...modifications,
});

describe("la recherche", () => {
  it("porte sur ce qui identifie un dossier", () => {
    /*
     * L'avocat cherche « #3686 » qu'il a sous les yeux, ou le nom de la personne qui
     * vient de l'appeler - pas seulement la société.
     */
    const d = dossier();
    expect(correspond(d, "atelier")).toBe(true);
    expect(correspond(d, "3686")).toBe(true);
    expect(correspond(d, "camille")).toBe(true);
    expect(correspond(d, "camille@exemple")).toBe(true);
    expect(correspond(d, "SASU")).toBe(true);
  });

  it("ignore les accents et la casse", () => {
    const d = dossier({ societe: "SOCIÉTÉ CRÉÉE" });
    expect(correspond(d, "societe creee")).toBe(true);
    expect(correspond(d, "SOCIETE")).toBe(true);
  });

  it("un terme vide ne cache rien", () => {
    expect(correspond(dossier(), "")).toBe(true);
    expect(correspond(dossier(), "   ")).toBe(true);
  });

  it("un dossier sans nom ne fait pas tomber la recherche", () => {
    const d = dossier({ societe: null, client: null, clientEmail: null, reference: null, forme: null });
    expect(correspond(d, "atelier")).toBe(false);
    expect(correspond(d, "")).toBe(true);
  });
});

describe("le tri", () => {
  const recent = dossier({ societe: "ZEBRE", majLe: new Date("2026-08-14T10:00:00") });
  const vieux = dossier({ societe: "ALPHA", majLe: new Date("2026-01-02T10:00:00") });
  const moyen = dossier({ societe: "MILIEU", majLe: new Date("2026-05-05T10:00:00") });

  it("par défaut, le plus récemment modifié d'abord", () => {
    expect(trier([vieux, recent, moyen], "recent").map((d) => d.societe)).toEqual([
      "ZEBRE",
      "MILIEU",
      "ALPHA",
    ]);
  });

  it("« sans mouvement depuis longtemps » remonte ce qui dort", () => {
    /*
     * C'est la question qu'un cabinet se pose, et l'ordre par défaut cache toujours
     * la réponse en bas de liste.
     */
    expect(trier([recent, vieux, moyen], "ancien").map((d) => d.societe)).toEqual([
      "ALPHA",
      "MILIEU",
      "ZEBRE",
    ]);
  });

  it("par société, l'ordre alphabétique français", () => {
    const a = dossier({ societe: "ÉCLAIR" });
    const b = dossier({ societe: "EDEN" });
    expect(trier([b, a], "societe").map((d) => d.societe)).toEqual(["ÉCLAIR", "EDEN"]);
  });

  it("un tri inconnu retombe sur le plus récent", () => {
    expect(estTri("n-importe-quoi")).toBe("recent");
    expect(estTri(undefined)).toBe("recent");
  });

  it("le tri ne modifie pas la liste qu'on lui donne", () => {
    const liste = [recent, vieux];
    trier(liste, "ancien");
    expect(liste[0]).toBe(recent);
  });
});

describe("la période", () => {
  const creeLe15 = dossier({ creeLe: new Date("2026-08-15T09:30:00") });

  it("la borne haute inclut sa journée entière", () => {
    // « au 15 août » sans cela exclurait tout ce qui a été créé ce jour-là.
    expect(dansLaPeriode(creeLe15, { au: "2026-08-15" })).toBe(true);
    expect(dansLaPeriode(creeLe15, { au: "2026-08-14" })).toBe(false);
  });

  it("la borne basse inclut aussi sa journée", () => {
    expect(dansLaPeriode(creeLe15, { du: "2026-08-15" })).toBe(true);
    expect(dansLaPeriode(creeLe15, { du: "2026-08-16" })).toBe(false);
  });

  it("une période vide ne retient rien de moins", () => {
    expect(dansLaPeriode(creeLe15, {})).toBe(true);
  });

  it("le jour se lit sur l'horloge locale", () => {
    // toISOString sur un minuit local rendrait la veille.
    expect(jourDe(new Date("2026-08-15T00:30:00"))).toBe("2026-08-15");
  });

  it("une fin avant le début se signale", () => {
    expect(periodeIncoherente({ du: "2026-08-15", au: "2026-08-01" })).toBe(true);
    expect(periodeIncoherente({ du: "2026-08-01", au: "2026-08-15" })).toBe(false);
    expect(periodeIncoherente({ du: "2026-08-01" })).toBe(false);
  });
});

describe("la pagination", () => {
  const beaucoup = Array.from({ length: DOSSIERS_PAR_PAGE * 2 + 3 }, (_, i) =>
    dossier({ reference: "#" + i })
  );

  it("découpe et annonce le rang", () => {
    const premiere = paginer(beaucoup, 1);
    expect(premiere.visibles).toHaveLength(DOSSIERS_PAR_PAGE);
    expect(premiere.premier).toBe(1);
    expect(premiere.dernier).toBe(DOSSIERS_PAR_PAGE);
    expect(premiere.pages).toBe(3);
    expect(premiere.total).toBe(beaucoup.length);
  });

  it("la dernière page ne déborde pas", () => {
    const derniere = paginer(beaucoup, 3);
    expect(derniere.visibles).toHaveLength(3);
    expect(derniere.dernier).toBe(beaucoup.length);
  });

  it("une page hors bornes revient dans la liste", () => {
    // Un filtre qui se resserre ne doit pas donner l'impression d'avoir tout perdu.
    expect(paginer(beaucoup, 99).page).toBe(3);
    expect(paginer(beaucoup, 0).page).toBe(1);
    expect(paginer(beaucoup, -5).page).toBe(1);
  });

  it("une liste vide reste lisible", () => {
    const vide = paginer([], 1);
    expect(vide.pages).toBe(1);
    expect(vide.premier).toBe(0);
    expect(vide.dernier).toBe(0);
  });
});
