import { describe, it, expect } from "vitest";
import { etatDesPieces, phraseDesPieces } from "@/domain/formalite/pieces";
import { travailDuCabinet } from "@/domain/formalite/cabinet";
import { etapesDuSuivi } from "@/domain/formalite/suivi";

/**
 * Ce qui manque au dossier, et qui doit le savoir.
 *
 * Quatre failles se rejoignaient ici. Le cabinet lisait « pièces vérifiées » sur un
 * dossier dont une pièce obligatoire n'avait jamais été déposée - le décompte ne
 * portait que sur les documents reçus, et un document absent n'attend rien. L'écran
 * des pièces ne listait que les présents. La route de paiement ne vérifiait rien, le
 * contrôle vivant dans la page. Et le suivi annonçait un avocat dès le règlement,
 * alors que le dossier attendait dans la file.
 */

const ATTENDUES = [
  { identifiant: "identite", titre: "Pièce d'identité", obligatoire: true },
  { identifiant: "jouissance", titre: "Justificatif de jouissance", obligatoire: true },
  { identifiant: "comptes", titre: "Derniers comptes", obligatoire: false },
];

describe("l'état des pièces", () => {
  it("compte comme manquante une pièce obligatoire jamais déposée", () => {
    /*
     * C'est le cas qui rendait un dossier incomplet indiscernable d'un dossier
     * complet : rien n'attendait de vérification, donc tout semblait fait.
     */
    const etat = etatDesPieces(ATTENDUES, [
      { type: "identite", status: "verified", rejection_reason: null },
    ]);

    expect(etat.manquantes.map((p) => p.identifiant)).toEqual(["jouissance"]);
    expect(etat.complet).toBe(false);
  });

  it("ne réclame pas une pièce facultative", () => {
    const etat = etatDesPieces(ATTENDUES, [
      { type: "identite", status: "verified", rejection_reason: null },
      { type: "jouissance", status: "verified", rejection_reason: null },
    ]);

    expect(etat.manquantes).toEqual([]);
    expect(etat.complet).toBe(true);
  });

  it("retient une pièce refusée tant qu'elle n'est pas remplacée", () => {
    /*
     * Après un refus, le document quittait la file d'attente : la tâche du cabinet
     * redevenait faite pendant qu'on attendait la nouvelle pièce.
     */
    const etat = etatDesPieces(ATTENDUES, [
      { type: "identite", status: "verified", rejection_reason: null },
      { type: "jouissance", status: "rejected", rejection_reason: "Illisible" },
    ]);

    expect(etat.refusees.map((p) => p.identifiant)).toEqual(["jouissance"]);
    expect(etat.complet).toBe(false);
  });

  it("oublie le refus quand un remplacement est arrivé", () => {
    // Sans cela, un dossier corrigé resterait éternellement incomplet.
    const etat = etatDesPieces(ATTENDUES, [
      { type: "identite", status: "verified", rejection_reason: null },
      { type: "jouissance", status: "rejected", rejection_reason: "Illisible" },
      { type: "jouissance", status: "uploaded", rejection_reason: null },
    ]);

    expect(etat.refusees).toEqual([]);
    expect(etat.aVerifier.map((p) => p.identifiant)).toEqual(["jouissance"]);
    expect(etat.complet).toBe(true);
  });

  it("dit en une phrase ce qui manque, et le nomme", () => {
    const manque = etatDesPieces(ATTENDUES, []);
    expect(phraseDesPieces(manque)).toBe(
      "Il manque 2 pièces : pièce d'identité, justificatif de jouissance."
    );

    const complet = etatDesPieces(ATTENDUES, [
      { type: "identite", status: "verified", rejection_reason: null },
      { type: "jouissance", status: "verified", rejection_reason: null },
    ]);
    expect(phraseDesPieces(complet)).toBe("Toutes les pièces attendues sont au dossier.");
  });
});

describe("la liste des tâches du cabinet", () => {
  const base = {
    type: "modification" as const,
    status: "en_attente_validation",
    sousPhase: "5b",
    piecesAVerifier: 0,
    actesProduits: true,
    statutsConcernes: false,
    aLAnnoncePubliee: false,
    creePar: "client" as const,
  };

  const tachePieces = (etat: Record<string, unknown>) =>
    travailDuCabinet({ ...base, ...etat } as never).find((t) => t.identifiant === "pieces")!;

  it("reste à faire quand une pièce manque, même si rien n'attend d'être vérifié", () => {
    const tache = tachePieces({ piecesAVerifier: 0, piecesManquantes: 1 });

    expect(tache.etat).toBe("a_faire");
    expect(tache.titre).toBe("1 pièce manquante");
    expect(tache.explication).toContain("ne peut pas partir sans elle");
  });

  it("se coche seulement quand rien ne manque et rien n'attend", () => {
    expect(tachePieces({ piecesAVerifier: 0, piecesManquantes: 0 }).etat).toBe("faite");
    expect(tachePieces({ piecesAVerifier: 2, piecesManquantes: 0 }).etat).toBe("a_faire");
  });

  it("annonce d'abord ce qui manque, ensuite ce qui attend", () => {
    // Une pièce absente se réclame au client ; une pièce déposée se regarde.
    expect(tachePieces({ piecesAVerifier: 3, piecesManquantes: 2 }).titre).toBe(
      "2 pièces manquantes"
    );
  });
});

describe("le suivi ne promet pas un avocat qui n'est pas là", () => {
  const dossier = {
    type: "modification",
    forme: "SAS",
    status: "en_attente_validation",
    sousPhase: "5a",
    aLAttestationDeCapital: false,
    aLAnnoncePubliee: false,
    aLeKbis: false,
    paye: true,
  };

  it("laisse l'étape « confié » en cours tant que personne ne l'a pris", () => {
    /*
     * Elle se cochait sur le seul règlement : le client lisait « l'avocat s'en
     * occupe » alors que son dossier attendait son tour dans la file.
     */
    const etapes = etapesDuSuivi({ ...dossier, avocatAssigne: false } as never);
    const confie = etapes.find((e) => e.identifiant === "confie")!;

    expect(confie.etat).toBe("en_cours");
    expect(etapes.find((e) => e.identifiant === "verification")!.etat).toBe("a_venir");
  });

  it("la coche dès qu'un avocat a pris le dossier", () => {
    const etapes = etapesDuSuivi({ ...dossier, avocatAssigne: true } as never);

    expect(etapes.find((e) => e.identifiant === "confie")!.etat).toBe("faite");
    expect(etapes.find((e) => e.identifiant === "verification")!.etat).toBe("en_cours");
  });
});
