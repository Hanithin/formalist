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
  distinguer,
  rangDeLActe,
  affichable,
  titreDeSociete,
  resoudreRejets,
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
  forme: "SASU",
  type: null,
  remplacable: false,
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

    expect(groupes.map((g) => g.titre)).toEqual(["SASU ALPHA", "SASU BETA"]);
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

    expect(groupes.map((g) => g.titre)).toEqual(["SASU ALPHA", "SASU ZETA", TITRE_SANS_SOCIETE]);
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
      doc({ societe: "", societeId: 7, forme: null }),
      doc({ societe: null, societeId: 8, forme: "SARL" }),
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

  it("le groupe qui vient de recevoir un dépôt s'ouvre", () => {
    /*
     * Le dépôt annonce « vous le retrouverez dans sa société » : le document restait
     * derrière un groupe replié, et l'annonce désignait ce qu'on ne voyait pas.
     */
    expect(ouvertParDefaut(groupe("ALPHA", [doc()]), 12, "", 1)).toBe(true);
    expect(ouvertParDefaut(groupe("ALPHA", [doc()]), 12, "", 2)).toBe(false);
  });

  it("les dépôts personnels sont un groupe comme un autre", () => {
    // Leur société est nulle : c'est une valeur, pas une absence de dépôt.
    const personnels = { societeId: null, titre: "Mes dépôts", documents: [doc()] };
    expect(ouvertParDefaut(personnels, 12, "", null)).toBe(true);
    expect(ouvertParDefaut(groupe("ALPHA", [doc()]), 12, "", null)).toBe(false);
  });

  it("sans dépôt, la règle habituelle s'applique", () => {
    expect(ouvertParDefaut(groupe("ALPHA", [doc()]), 12)).toBe(false);
    expect(ouvertParDefaut(groupe("ALPHA", [doc()]), 12, "", undefined)).toBe(false);
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

describe("distinguer les groupes de même nom", () => {
  const groupe = (titre: string, societeId: number | null) => ({
    societeId,
    titre,
    documents: [doc()],
  });

  it("ajoute la référence quand deux groupes portent le même nom", () => {
    // Deux blocs identiques ressemblent à un doublon, et on ne sait pas lequel ouvrir.
    const distingues = distinguer([groupe("ESSAI", 12), groupe("ESSAI", 340)]);
    expect(distingues.map((g) => g.precision)).toEqual(["#0012", "#0340"]);
  });

  it("n'ajoute rien quand le nom suffit", () => {
    // L'ajouter partout ajouterait du bruit à ce qui est déjà clair.
    const distingues = distinguer([groupe("ALPHA", 1), groupe("BETA", 2)]);
    expect(distingues.map((g) => g.precision)).toEqual([undefined, undefined]);
  });

  it("laisse les dépôts personnels tranquilles", () => {
    const distingues = distinguer([groupe("Mes dépôts", null), groupe("Mes dépôts", null)]);
    expect(distingues.every((g) => g.precision === undefined)).toBe(true);
  });
});

describe("l'ordre dans lequel on cherche un acte", () => {
  it("les statuts viennent en premier", () => {
    /*
     * C'est la pièce qu'on redemande le plus souvent : une banque, un bailleur, un
     * client la réclament. Le classement par date mettait en tête le dernier
     * document produit, qui n'est presque jamais celui qu'on vient chercher.
     */
    const groupes = grouper([
      doc({ nom: "Attestation de domiciliation", creeLe: new Date("2026-08-05") }),
      doc({ nom: "Statuts constitutifs", creeLe: new Date("2026-08-01") }),
      doc({ nom: "Procès-verbal de nomination", creeLe: new Date("2026-08-04") }),
    ]);

    expect(groupes[0].documents.map((d) => d.nom)).toEqual([
      "Statuts constitutifs",
      "Procès-verbal de nomination",
      "Attestation de domiciliation",
    ]);
  });

  it("le Kbis suit les statuts", () => {
    expect(rangDeLActe("Statuts constitutifs")).toBeLessThan(rangDeLActe("Kbis"));
    expect(rangDeLActe("Kbis")).toBeLessThan(rangDeLActe("Procès-verbal de nomination"));
  });

  it("l'ordre ignore la casse et les accents", () => {
    expect(rangDeLActe("STATUTS CONSTITUTIFS")).toBe(rangDeLActe("Statuts constitutifs"));
    expect(rangDeLActe("Déclaration de non-condamnation")).toBe(
      rangDeLActe("Declaration de non-condamnation")
    );
  });

  it("ce qui n'est pas un acte connu ferme la marche, du plus récent au plus ancien", () => {
    const groupes = grouper([
      doc({ nom: "Bail commercial", creeLe: new Date("2026-01-01") }),
      doc({ nom: "Facture", creeLe: new Date("2026-08-01") }),
      doc({ nom: "Statuts constitutifs", creeLe: new Date("2020-01-01") }),
    ]);

    expect(groupes[0].documents.map((d) => d.nom)).toEqual([
      "Statuts constitutifs",
      "Facture",
      "Bail commercial",
    ]);
  });

  it("un document à remplacer passe avant les statuts", () => {
    // Il bloque le dossier : rien ne passe devant.
    const groupes = grouper([
      doc({ nom: "Statuts constitutifs" }),
      doc({ nom: "Pièce d'identité", motifRejet: "Document périmé" }),
    ]);
    expect(groupes[0].documents[0].nom).toBe("Pièce d'identité");
  });
});

describe("l'aperçu", () => {
  it("un PDF et une image s'affichent, un Word se télécharge", () => {
    expect(affichable("a1b2.pdf")).toBe(true);
    expect(affichable("a1b2.PDF")).toBe(true);
    expect(affichable("photo.jpeg")).toBe(true);
    expect(affichable("statuts.docx")).toBe(false);
  });

  it("sans fichier, rien à montrer", () => {
    expect(affichable(null)).toBe(false);
    expect(affichable("")).toBe(false);
    expect(affichable("sans-extension")).toBe(false);
  });
});

describe("le titre d'une société", () => {
  it("porte sa forme, comme sur ses statuts", () => {
    // Elle distingue aussi deux dossiers d'une même enseigne : la SASU et la SCI
    // qui porte ses murs.
    expect(titreDeSociete("ATELIER MERIDIEN", "SASU")).toBe("SASU ATELIER MERIDIEN");
    expect(titreDeSociete("Atelier Meridien", "sarl")).toBe("SARL Atelier Meridien");
  });

  it("ne la répète pas quand le nom la porte déjà", () => {
    // Certains clients saisissent « SASU Untel » dans le champ de dénomination.
    expect(titreDeSociete("SASU ATELIER", "SASU")).toBe("SASU ATELIER");
    expect(titreDeSociete("Sasu Atelier", "SASU")).toBe("Sasu Atelier");
  });

  it("se passe de forme quand il n'y en a pas", () => {
    expect(titreDeSociete("ATELIER", null)).toBe("ATELIER");
    expect(titreDeSociete("ATELIER", "  ")).toBe("ATELIER");
  });

  it("un dossier sans nom reste identifiable", () => {
    expect(titreDeSociete("", "SASU")).toBe(TITRE_SANS_NOM);
    expect(titreDeSociete(null, null)).toBe(TITRE_SANS_NOM);
  });
});

describe("un rejet résolu", () => {
  const piece = (p: Partial<DocumentRange>) =>
    doc({ nom: "Pièce d'identité", type: "identite", societeId: 1, ...p });

  it("cesse de réclamer une action dès qu'une pièce plus récente arrive", () => {
    /*
     * Sans cela, l'ancienne ligne continue de dire « à remplacer » après le dépôt :
     * on croit que rien n'a été fait, et on redépose indéfiniment le même document.
     */
    const resolus = resoudreRejets([
      piece({ motifRejet: "Document périmé", creeLe: new Date("2026-08-01") }),
      piece({ motifRejet: null, creeLe: new Date("2026-08-10") }),
    ]);

    expect(resolus.filter(aRemplacer)).toHaveLength(0);
  });

  it("reste tant que rien ne l'a remplacé", () => {
    const resolus = resoudreRejets([
      piece({ motifRejet: "Document périmé", creeLe: new Date("2026-08-01") }),
    ]);
    expect(resolus.filter(aRemplacer)).toHaveLength(1);
  });

  it("une autre pièce du même dossier ne le remplace pas", () => {
    // Une attestation ne remplace pas une pièce d'identité.
    const resolus = resoudreRejets([
      piece({ motifRejet: "Document périmé", creeLe: new Date("2026-08-01") }),
      doc({ type: "domicile", societeId: 1, creeLe: new Date("2026-08-10") }),
    ]);
    expect(resolus.filter(aRemplacer)).toHaveLength(1);
  });

  it("la même pièce d'un autre dossier non plus", () => {
    const resolus = resoudreRejets([
      piece({ motifRejet: "Document périmé", creeLe: new Date("2026-08-01") }),
      piece({ societeId: 2, creeLe: new Date("2026-08-10") }),
    ]);
    expect(resolus.filter(aRemplacer)).toHaveLength(1);
  });

  it("un dépôt libre, sans type, n'est jamais résolu par un autre", () => {
    const resolus = resoudreRejets([
      doc({ type: null, motifRejet: "Illisible", creeLe: new Date("2026-08-01") }),
      doc({ type: null, creeLe: new Date("2026-08-10") }),
    ]);
    expect(resolus.filter(aRemplacer)).toHaveLength(1);
  });
});
