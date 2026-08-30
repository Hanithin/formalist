import { describe, it, expect } from "vitest";
import { piecesDesComptes } from "@/domain/comptes/pieces";
import { actesDesComptes } from "@/domain/comptes/actes";

/**
 * Le rapport spécial sur les conventions réglementées, et qui l'écrit.
 *
 * Le formulaire demandait le nom du commissaire aux comptes depuis toujours, et aucun
 * document ne le portait ; aucune pièce n'était attendue non plus. Le procès-verbal
 * écrivait pourtant « après avoir pris connaissance du rapport spécial établi par le
 * commissaire aux comptes » sans que ce rapport existe nulle part au dossier.
 *
 * Deux règles se répondent désormais : là où le cabinet écrit le rapport, rien n'est
 * demandé au client ; là où le commissaire l'établit, c'est au client de le verser.
 */
describe("le rapport du commissaire aux comptes", () => {
  const base = { forme: "SARL", nombreDeConventions: 2 };

  it("est réclamé au client quand un commissaire l'établit", () => {
    const pieces = piecesDesComptes({
      ...base,
      avecCommissaire: true,
      commissaireNom: "Cabinet AUDIT RHONE",
    });
    expect(pieces).toHaveLength(1);
    expect(pieces[0].identifiant).toBe("rapport-commissaire");
    expect(pieces[0].obligatoire).toBe(true);
    /* La pièce nomme celui qui l'a écrite : on cherche ce rapport-là, pas « un » rapport. */
    expect(pieces[0].explication).toContain("Cabinet AUDIT RHONE");
  });

  it("ne l'est pas quand c'est le cabinet qui l'écrit", () => {
    expect(piecesDesComptes({ ...base, avecCommissaire: false })).toEqual([]);
  });

  it("ne l'est pas là où la loi ne demande ni rapport ni vote", () => {
    /* Une société unipersonnelle mentionne au registre : rien à présenter. */
    expect(piecesDesComptes({ forme: "EURL", avecCommissaire: true, nombreDeConventions: 2 })).toEqual([]);
    /* Une société civile de gestion patrimoniale n'est visée par aucun texte. */
    expect(piecesDesComptes({ forme: "SCI", avecCommissaire: true, nombreDeConventions: 2 })).toEqual([]);
  });

  it("ne l'est pas sans convention à présenter", () => {
    expect(piecesDesComptes({ forme: "SARL", avecCommissaire: true, nombreDeConventions: 0 })).toEqual([]);
  });

  it("répond exactement à la règle qui décide de l'écrire", () => {
    /*
     * Le cas dangereux est celui où les deux règles divergent : le dossier réclamerait
     * un document qu'il produit lui-même, ou n'en réclamerait aucun là où il en manque.
     */
    for (const forme of ["SARL", "SAS", "SA", "EURL", "SASU", "SCI", "SNC"]) {
      for (const avecCommissaire of [true, false]) {
        for (const nombreDeConventions of [0, 3]) {
          const args = { forme, nombreDeConventions, chiffres: { totalBilanCentimes: 0, chiffreAffairesCentimes: 0, effectif: 0 } };
          const ecrit = actesDesComptes({
            ...args,
            nombreDAssocies: 3,
            avecCommissaire,
            exclusions: [],
            demandeLaConfidentialite: false,
          }).some((a) => a.titre.startsWith("Rapport spécial"));
          const demande = piecesDesComptes({ forme, avecCommissaire, nombreDeConventions }).length > 0;
          expect(ecrit && demande, `${forme} · commissaire ${avecCommissaire} · ${nombreDeConventions} convention(s)`).toBe(false);
        }
      }
    }
  });
});
