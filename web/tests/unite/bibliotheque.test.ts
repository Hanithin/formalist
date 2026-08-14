import { describe, it, expect } from "vitest";
import {
  aRemplacer,
  retenu,
  comptesParFiltre,
  correspond,
  grouper,
  nombreDeSocietes,
  SEUIL_RECHERCHE,
  TITRE_SANS_SOCIETE,
  TITRE_SANS_NOM,
  ouvertParDefaut,
  tronquer,
  GROUPES_OUVERTS,
  DOCUMENTS_MONTRES,
  type DocumentRange,
} from "@/domain/document/bibliotheque";

const doc = (p: Partial<DocumentRange> = {}): DocumentRange => ({
  id: "d" + Math.random(),
  nom: "Statuts constitutifs",
  statut: "generated",
  motifRejet: null,
  origine: "entreprise",
  societe: "ATELIER MERIDIEN",
  societeId: 1,
  fichier: "abc.pdf",
  creeLe: new Date("2026-08-01T10:00:00Z"),
  contratId: null,
  ...p,
});

describe("ce qui attend une action", () => {
  it("c'est le motif de rejet qui le dit, pas le statut", () => {
    /*
     * La table n'accepte que generated, uploaded, signed et verified : une contrainte
     * le vérifie, et « rejeté » n'existe pas. Chercher un statut de rejet n'aurait
     * jamais rien trouvé, et les documents qui bloquent un dossier seraient restés
     * noyés dans la liste.
     */
    expect(aRemplacer(doc({ motifRejet: "Document périmé" }))).toBe(true);
    expect(aRemplacer(doc({ motifRejet: null }))).toBe(false);
    expect(aRemplacer(doc({ statut: "uploaded", motifRejet: null }))).toBe(false);
  });
});

describe("les filtres", () => {
  const documents = [
    doc({ origine: "entreprise" }),
    doc({ origine: "entreprise" }),
    doc({ origine: "contrat" }),
    doc({ origine: "upload" }),
  ];

  it("« tous » ne cache rien", () => {
    expect(documents.every((d) => retenu(d, "tous"))).toBe(true);
  });

  it("chaque filtre annonce son décompte", () => {
    expect(comptesParFiltre(documents)).toEqual({
      tous: 4,
      entreprise: 2,
      contrat: 1,
      upload: 1,
    });
  });

  it("un filtre ne retient que son origine", () => {
    expect(documents.filter((d) => retenu(d, "contrat"))).toHaveLength(1);
  });
});

describe("la recherche", () => {
  it("porte sur le nom du document", () => {
    expect(correspond(doc({ nom: "Statuts constitutifs" }), "statuts")).toBe(true);
    expect(correspond(doc({ nom: "Statuts constitutifs" }), "kbis")).toBe(false);
  });

  it("porte aussi sur le nom de la société", () => {
    /*
     * On cherche « meridien » pour retrouver tous les documents de cette société,
     * même ceux dont le nom ne contient pas le mot : c'est ainsi qu'on cherche quand
     * on ne se souvient plus du nom exact d'un acte.
     */
    const d = doc({ nom: "Attestation de domiciliation", societe: "ATELIER MERIDIEN" });
    expect(correspond(d, "meridien")).toBe(true);
  });

  it("ignore la casse et les accents", () => {
    const d = doc({ nom: "Déclaration de non-condamnation", societe: "SOCIÉTÉ TEST" });
    expect(correspond(d, "DECLARATION")).toBe(true);
    expect(correspond(d, "societe")).toBe(true);
    expect(correspond(d, "déclaration")).toBe(true);
  });

  it("une recherche vide ne filtre rien", () => {
    expect(correspond(doc(), "")).toBe(true);
    expect(correspond(doc(), "   ")).toBe(true);
  });

  it("un dépôt sans société se cherche par son seul nom", () => {
    const d = doc({ nom: "Pièce d'identité", societe: null, societeId: null });
    expect(correspond(d, "identite")).toBe(true);
    expect(correspond(d, "meridien")).toBe(false);
  });
});

describe("le rangement par société", () => {
  it("groupe les documents de chaque société", () => {
    const groupes = grouper([
      doc({ societe: "BETA", societeId: 2 }),
      doc({ societe: "ALPHA", societeId: 1 }),
      doc({ societe: "ALPHA", societeId: 1 }),
    ]);

    expect(groupes.map((g) => g.titre)).toEqual(["ALPHA", "BETA"]);
    expect(groupes[0].documents).toHaveLength(2);
  });

  it("les dépôts personnels ferment la liste", () => {
    // Ils n'appartiennent à aucun dossier : les placer en tête ferait chercher plus
    // loin ce qu'on vient voir.
    const groupes = grouper([
      doc({ societe: null, societeId: null }),
      doc({ societe: "ZETA", societeId: 9 }),
      doc({ societe: "ALPHA", societeId: 1 }),
    ]);

    expect(groupes.map((g) => g.titre)).toEqual(["ALPHA", "ZETA", TITRE_SANS_SOCIETE]);
  });

  it("deux sociétés au même nom restent séparées si ce sont deux dossiers", () => {
    // Le regroupement se fait sur l'identifiant, pas sur le nom affiché.
    const groupes = grouper([
      doc({ societe: "Sans nom", societeId: 1 }),
      doc({ societe: "Sans nom", societeId: 2 }),
    ]);
    expect(groupes).toHaveLength(2);
  });

  it("ce qui attend une action passe devant, le reste du plus récent au plus ancien", () => {
    const groupes = grouper([
      doc({ nom: "Ancien", creeLe: new Date("2026-01-01") }),
      doc({ nom: "Récent", creeLe: new Date("2026-08-01") }),
      doc({ nom: "Refusé", motifRejet: "Document périmé", creeLe: new Date("2025-01-01") }),
    ]);

    expect(groupes[0].documents.map((d) => d.nom)).toEqual(["Refusé", "Récent", "Ancien"]);
  });

  it("un document sans date ne casse pas l'ordre", () => {
    const groupes = grouper([
      doc({ nom: "Daté", creeLe: new Date("2026-08-01") }),
      doc({ nom: "Sans date", creeLe: null }),
    ]);
    expect(groupes[0].documents.map((d) => d.nom)).toEqual(["Daté", "Sans date"]);
  });

  it("un dossier pas encore nommé porte quand même une étiquette", () => {
    /*
     * Sans elle, le groupe s'affiche sous un espace blanc : on ne peut ni le nommer
     * ni le distinguer d'un autre dossier dans le même cas.
     */
    const groupes = grouper([
      doc({ societe: "", societeId: 7 }),
      doc({ societe: null, societeId: 8 }),
    ]);
    expect(groupes.map((g) => g.titre)).toEqual([TITRE_SANS_NOM, TITRE_SANS_NOM]);
  });

  it("aucun document ne rend aucun groupe", () => {
    expect(grouper([])).toEqual([]);
  });
});

describe("le seuil de la recherche", () => {
  it("compte les sociétés, pas les documents", () => {
    const documents = [
      doc({ societeId: 1 }),
      doc({ societeId: 1 }),
      doc({ societeId: 2 }),
      doc({ societe: null, societeId: null }),
    ];
    expect(nombreDeSocietes(documents)).toBe(2);
  });

  it("le seuil laisse quelques dossiers se parcourir à l'œil", () => {
    // Un champ de recherche vide au-dessus de deux blocs occupe la place pour rien.
    expect(SEUIL_RECHERCHE).toBeGreaterThan(1);
  });
});

describe("ce qui est montré d'emblée", () => {
  const groupe = (nom: string, documents: DocumentRange[]) => ({
    societeId: 1,
    titre: nom,
    documents,
  });

  it("peu de groupes : tout est ouvert", () => {
    expect(ouvertParDefaut(groupe("ALPHA", [doc()]), 2)).toBe(true);
    expect(ouvertParDefaut(groupe("ALPHA", [doc()]), GROUPES_OUVERTS)).toBe(true);
  });

  it("beaucoup de groupes : ils se replient", () => {
    // Sinon la page défile sans qu'on voie jamais la fin.
    expect(ouvertParDefaut(groupe("ALPHA", [doc()]), GROUPES_OUVERTS + 1)).toBe(false);
  });

  it("un groupe qui attend une action reste ouvert, quel qu'en soit le nombre", () => {
    // C'est ce qui bloque un dossier : le replier reviendrait à le cacher.
    const attente = groupe("ALPHA", [doc(), doc({ motifRejet: "Document périmé" })]);
    expect(ouvertParDefaut(attente, 12)).toBe(true);
  });

  it("une recherche en cours ouvre tout", () => {
    // On vient de demander ces documents : les cacher derrière un clic serait absurde.
    expect(ouvertParDefaut(groupe("ALPHA", [doc()]), 12, "statuts")).toBe(true);
    expect(ouvertParDefaut(groupe("ALPHA", [doc()]), 12, "   ")).toBe(false);
  });

  it("un groupe long est tronqué, et le reste est annoncé", () => {
    const documents = Array.from({ length: DOCUMENTS_MONTRES + 5 }, () => doc());

    const { montres, restants } = tronquer(documents, false);
    expect(montres).toHaveLength(DOCUMENTS_MONTRES);
    expect(restants).toBe(5);
  });

  it("un groupe court n'est pas tronqué", () => {
    const documents = [doc(), doc()];
    expect(tronquer(documents, false)).toEqual({ montres: documents, restants: 0 });
  });

  it("tout demandé, rien n'est retenu", () => {
    const documents = Array.from({ length: 20 }, () => doc());
    expect(tronquer(documents, true).montres).toHaveLength(20);
    expect(tronquer(documents, true).restants).toBe(0);
  });
});
