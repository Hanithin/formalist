import { describe, it, expect } from "vitest";
import {
  filtreValide,
  retenu,
  comptesParFiltre,
  correspond,
  dateRelative,
  statistiques,
  paginer,
  pageDe,
  parModificationRecente,
  PAR_PAGE,
  type DossierListe,
} from "@/domain/formalite/liste";

const dossier = (p: Partial<DossierListe> = {}): DossierListe => ({
  id: 1,
  type: "creation",
  societe: "ATELIER MERIDIEN",
  forme: "SASU",
  status: "en_cours",
  phase: 3,
  offre: "business",
  banque: null,
  modifieLe: new Date("2026-08-10T10:00:00Z"),
  nonLus: 0,
  ...p,
});

describe("les filtres de la liste", () => {
  it("un filtre inventé retombe sur « tous »", () => {
    expect(filtreValide("inconnu")).toBe("tous");
    expect(filtreValide(null)).toBe("tous");
    expect(filtreValide("en_attente")).toBe("en_attente");
  });

  it("« en attente » n'est pas le complément de « en cours »", () => {
    // Un dossier qui attend le client n'avance pas : les deux états se distinguent,
    // sinon « En attente » ne servirait à rien.
    const attend = dossier({ status: "en_attente" });
    const avance = dossier({ status: "en_cours" });
    const fini = dossier({ status: "terminee" });

    expect(retenu(attend, "en_attente")).toBe(true);
    expect(retenu(attend, "en_cours")).toBe(false);
    expect(retenu(avance, "en_cours")).toBe(true);
    expect(retenu(avance, "en_attente")).toBe(false);
    expect(retenu(fini, "terminee")).toBe(true);
    expect(retenu(fini, "en_cours")).toBe(false);
  });

  it("chaque filtre annonce ce qu'il laisse", () => {
    const comptes = comptesParFiltre([
      dossier({ status: "en_cours" }),
      dossier({ status: "en_cours" }),
      dossier({ status: "en_attente" }),
      dossier({ status: "terminee" }),
    ]);

    expect(comptes).toEqual({ tous: 4, en_cours: 2, en_attente: 1, terminee: 1 });
  });
});

describe("la recherche", () => {
  it("trouve par nom, par forme et sans accent", () => {
    const d = dossier({ societe: "SOCIÉTÉ MÉRIDIEN", forme: "SASU" });
    expect(correspond(d, "societe")).toBe(true);
    expect(correspond(d, "MÉRIDIEN")).toBe(true);
    expect(correspond(d, "sasu")).toBe(true);
    expect(correspond(d, "introuvable")).toBe(false);
  });

  it("une recherche vide ne cache rien", () => {
    expect(correspond(dossier(), "   ")).toBe(true);
  });

  it("un dossier sans nom ne fait pas échouer la recherche", () => {
    expect(correspond(dossier({ societe: null, forme: null }), "abc")).toBe(false);
  });
});

describe("depuis quand un dossier n'a pas bougé", () => {
  const maintenant = new Date("2026-08-13T12:00:00Z");

  it("les seuils suivent ceux de la page d'origine", () => {
    expect(dateRelative(new Date("2026-08-13T11:59:40Z"), maintenant)).toBe("À l'instant");
    expect(dateRelative(new Date("2026-08-13T11:30:00Z"), maintenant)).toBe("Il y a 30 min");
    expect(dateRelative(new Date("2026-08-13T06:00:00Z"), maintenant)).toBe("Il y a 6h");
    expect(dateRelative(new Date("2026-08-10T12:00:00Z"), maintenant)).toBe("Il y a 3j");
  });

  it("au-delà d'une semaine, la date reprend sa place", () => {
    // Le relatif ne dit plus rien d'utile passé quelques jours.
    expect(dateRelative(new Date("2026-07-04T12:00:00Z"), maintenant)).toBe("4 juil. 2026");
  });

  it("un dossier jamais modifié ne porte pas de date", () => {
    expect(dateRelative(null, maintenant)).toBe("");
  });
});

describe("les trois compteurs de tête", () => {
  const tous = [
    dossier({ id: 1, status: "en_cours" }),
    dossier({ id: 2, status: "en_cours" }),
    dossier({ id: 3, status: "en_attente" }),
    dossier({ id: 4, status: "terminee" }),
  ];

  it("sans filtre, les sous-titres situent l'ensemble", () => {
    const s = statistiques(tous, tous, "tous", "");
    expect(s.enCours.valeur).toBe(2);
    expect(s.enCours.sousTitre).toBe("50 % de vos formalités");
    expect(s.termines.sousTitre).toBe("1 sur 4 finalisée");
    expect(s.total.sousTitre).toBe("4 formalités au total");
  });

  it("sous un filtre, c'est ce qu'on voit qui est décompté", () => {
    const visibles = tous.filter((d) => retenu(d, "terminee"));
    const s = statistiques(tous, visibles, "terminee", "");
    expect(s.termines.sousTitre).toBe("1 dossier terminé");
    expect(s.total.sousTitre).toBe("1 sur 4 formalités");
  });

  it("les libellés s'accordent au nombre", () => {
    const deuxFinis = [dossier({ status: "terminee" }), dossier({ status: "terminee" })];
    expect(statistiques(deuxFinis, deuxFinis, "tous", "").termines.libelle).toBe("Terminées");
    expect(statistiques([tous[3]], [tous[3]], "tous", "").termines.libelle).toBe("Terminée");
  });

  it("une carte sans rien à compter vaut null, pas zéro", () => {
    // Un zéro se lit comme une mesure ; ici il n'y a rien à mesurer, et la carte
    // se grise sur cette absence.
    const s = statistiques([], [], "tous", "");
    expect(s.enCours.valeur).toBeNull();
    expect(s.total.valeur).toBeNull();
  });

  it("une recherche compte comme un filtre", () => {
    const s = statistiques(tous, [tous[0]], "tous", "meridien");
    expect(s.total.sousTitre).toBe("1 sur 4 formalités");
  });
});

describe("la pagination", () => {
  it("six cartes par page", () => {
    expect(PAR_PAGE).toBe(6);
    expect(paginer(13, 1).pages).toBe(3);
    expect(pageDe(Array.from({ length: 13 }, (_, i) => i), 2)).toEqual([6, 7, 8, 9, 10, 11]);
  });

  it("annonce la tranche affichée", () => {
    const p = paginer(13, 2);
    expect(p.premier).toBe(7);
    expect(p.dernier).toBe(12);
    expect(p.total).toBe(13);
  });

  it("une page hors bornes ramène dans les bornes", () => {
    // Un lien partagé reste utilisable après que des dossiers ont été retirés.
    expect(paginer(13, 99).page).toBe(3);
    expect(paginer(13, 0).page).toBe(1);
    expect(paginer(13, -5).page).toBe(1);
  });

  it("une liste vide tient sur une page, sans tranche", () => {
    const p = paginer(0, 1);
    expect(p.pages).toBe(1);
    expect(p.premier).toBe(0);
    expect(p.dernier).toBe(0);
  });

  it("la fenêtre garde les extrémités et coupe le milieu", () => {
    expect(paginer(60, 5).fenetre).toEqual([1, null, 4, 5, 6, null, 10]);
    // Sans coupure quand tout tient.
    expect(paginer(18, 2).fenetre).toEqual([1, 2, 3]);
  });
});

describe("l'ordre de la liste", () => {
  it("le plus récemment modifié d'abord", () => {
    const range = parModificationRecente([
      dossier({ id: 1, modifieLe: new Date("2026-08-01T10:00:00Z") }),
      dossier({ id: 2, modifieLe: new Date("2026-08-12T10:00:00Z") }),
      dossier({ id: 3, modifieLe: new Date("2026-08-05T10:00:00Z") }),
    ]);
    expect(range.map((d) => d.id)).toEqual([2, 3, 1]);
  });

  it("un dossier qui n'a jamais bougé passe en dernier", () => {
    const range = parModificationRecente([
      dossier({ id: 1, modifieLe: null }),
      dossier({ id: 2, modifieLe: new Date("2026-08-01T10:00:00Z") }),
    ]);
    expect(range.map((d) => d.id)).toEqual([2, 1]);
  });
});
