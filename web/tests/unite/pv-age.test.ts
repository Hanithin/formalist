import { describe, it, expect } from "vitest";
import {
  donneesDuPvAge,
  verifierLePvAge,
  blocsActives,
  motsDeLaForme,
  numeroDePresent,
  ordinalDeResolution,
  sirenEspace,
  jourEnLettres,
  anneeEnLettres,
  identificationDeLAssocie,
  BLOCS_DU_MODELE,
} from "@/domain/modification/pv-age";
import type { ContexteGabarit } from "@/domain/modification/gabarit";

/**
 * La couche d'adaptation vers le modèle universel du cabinet.
 *
 * Le .docx livré n'est pas modifié : c'est cette fonction qui traduit les champs de
 * Formalist vers ses balises. Elle porte donc les deux règles que la mission déclare non
 * négociables - l'ordre canonique des résolutions et la terminologie dérivée de la forme
 * sociale - et les contrôles de cohérence qui empêchent un acte faux de sortir.
 */

const SOCIETE = {
  denomination: "ATELIER DURAND",
  forme: "SARL",
  siren: "512345678",
  adresse: "12 rue des Artisans",
  codePostal: "69003",
  ville: "Lyon",
  villeRcs: "Lyon",
  capital: 10000,
};

const ASSOCIES = [
  { nature: "physique" as const, civilite: "Monsieur", prenom: "Paul", nom: "DURAND", parts: 600 },
  { nature: "physique" as const, civilite: "Madame", prenom: "Anne", nom: "DURAND", parts: 400 },
];

function contexte(partiel: Partial<ContexteGabarit> = {}): ContexteGabarit {
  return {
    societe: SOCIETE,
    assemblee: { date: "2026-09-15", associes: ASSOCIES },
    codes: ["transfert_siege"],
    valeurs: {
      nouvelleAdresse: "5 avenue Victor Hugo",
      nouveauCodePostal: "69006",
      nouvelleVille: "Lyon",
      dateEffetTransfert: "2026-10-01",
    },
    ...partiel,
  } as ContexteGabarit;
}

describe("la terminologie découle de la forme sociale", () => {
  it("distingue les actions des parts sociales", () => {
    expect(motsDeLaForme("SAS").titres).toBe("actions");
    expect(motsDeLaForme("SAS").associesPluriel).toBe("actionnaires");
    expect(motsDeLaForme("SARL").titres).toBe("parts sociales");
    expect(motsDeLaForme("SARL").associesPluriel).toBe("associés");
    expect(motsDeLaForme("SCI").titres).toBe("parts sociales");
  });

  it("dit qui convoque et qui préside", () => {
    expect(motsDeLaForme("SAS").convocationPar).toBe("du Président");
    expect(motsDeLaForme("SARL").convocationPar).toBe("de la gérance");
  });

  it("réserve l'article 1832-2 aux parts non négociables", () => {
    // Les actions sont librement négociables : l'article ne les vise pas.
    expect(motsDeLaForme("SAS").partsNonNegociables).toBe(false);
    expect(motsDeLaForme("SARL").partsNonNegociables).toBe(true);
  });

  it("fonde l'agrément sur le texte de la forme", () => {
    expect(motsDeLaForme("SARL").fondementAgrement).toContain("L. 223-14");
    expect(motsDeLaForme("SCI").fondementAgrement).toContain("1861");
  });
});

describe("l'ordre des résolutions est celui du modèle", () => {
  it("ignore l'ordre de saisie", () => {
    /*
     * Un client qui coche « prorogation » puis « transfert de siège » obtient le
     * transfert en première résolution : c'est l'acte qui commande, pas le formulaire.
     */
    const blocs = blocsActives(["prorogation", "transfert_siege"], {});
    expect(blocs).toEqual(["r_transfert_siege", "r_prorogation"]);
  });

  it("choisit le bloc d'augmentation selon le mode", () => {
    expect(blocsActives(["augmentation_capital"], { modeAugmentation: "Apport en nature" })).toEqual([
      "r_augmentation_nature",
    ]);
    expect(
      blocsActives(["augmentation_capital"], { modeAugmentation: "Incorporation de réserves" })
    ).toEqual(["r_incorporation"]);
    // Une compensation de créances reste une souscription en numéraire.
    expect(
      blocsActives(["augmentation_capital"], { modeAugmentation: "Compensation de créances" })
    ).toEqual(["r_augmentation_numeraire"]);
  });

  it("approuve et rémunère un apport de titres dans le même acte", () => {
    expect(blocsActives(["apport_titres"], {})).toEqual([
      "r_apport_titres",
      "r_augmentation_remuneration",
    ]);
  });

  it("numérote dans l'ordre du modèle, pouvoirs compris", () => {
    const donnees = donneesDuPvAge(
      contexte({ codes: ["prorogation", "transfert_siege"], valeurs: { dureeActuelle: 50, nouvelleDuree: 99 } })
    );

    expect((donnees.r_transfert_siege as { ord: string }).ord).toBe("PREMIÈRE");
    expect((donnees.r_prorogation as { ord: string }).ord).toBe("DEUXIÈME");
    // Les pouvoirs ferment la marche, sans bloc propre.
    expect(donnees.ord).toBe("TROISIÈME");
  });

  it("éteint les blocs que Formalist ne propose pas", () => {
    const donnees = donneesDuPvAge(contexte());
    for (const bloc of BLOCS_DU_MODELE) {
      if (bloc === "r_transfert_siege") continue;
      expect(donnees[bloc], bloc).toBe(false);
    }
  });
});

describe("l'ouverture de l'acte", () => {
  const donnees = donneesDuPvAge(contexte());

  it("écrit la date en lettres", () => {
    expect(donnees.annee_lettres).toBe("deux mille vingt-six");
    expect(donnees.jour_lettres).toBe("quinze septembre");
    expect(jourEnLettres("2026-09-01")).toBe("premier septembre");
    expect(anneeEnLettres(null)).toBe("");
  });

  it("groupe le numéro RCS par trois", () => {
    expect(donnees.rcs_numero).toBe("512 345 678");
    expect(sirenEspace("908221138")).toBe("908 221 138");
    // Un numéro incomplet se rend tel quel plutôt que d'être découpé de travers.
    expect(sirenEspace("9082")).toBe("9082");
  });

  it("numérote les présents en chiffres romains", () => {
    expect(numeroDePresent(0)).toBe("(i)");
    expect(numeroDePresent(1)).toBe("(ii)");
    expect(ordinalDeResolution(0)).toBe("PREMIÈRE");
    expect(ordinalDeResolution(20)).toBe("21E");
  });

  it("compte les titres présents et ceux du capital", () => {
    expect(donnees.nb_participants_lettres).toBe("deux");
    expect(donnees.titres_representes).toBe("1 000");
    expect(donnees.total_titres).toBe("1 000");
  });

  it("ponctue l'ordre du jour", () => {
    const points = donnees.ordre_du_jour as { num: number; libelle: string }[];
    expect(points[0].libelle).toBe("transfert du siège social ;");
    expect(points[points.length - 1].libelle).toContain("pouvoirs");
    expect(points[points.length - 1].libelle.endsWith(".")).toBe(true);
  });
});

describe("l'identification des présents", () => {
  it("décrit une société associée de bout en bout", () => {
    const texte = identificationDeLAssocie({
      nature: "morale",
      denomination: "STORYFILMS",
      forme: "SAS",
      capital: 5000,
      siege: "34 RUE LAUGIER 75017 PARIS",
      siren: "841862907",
      representant: "Madame Rose BERTIN",
      qualiteRepresentant: "Présidente",
    });

    expect(texte).toContain("la société STORYFILMS");
    expect(texte).toContain("société par actions simplifiée au capital de 5 000 euros");
    // Le siège vient du registre en capitales : il reprend sa casse ordinaire.
    expect(texte).toContain("34 rue Laugier 75017 Paris");
    expect(texte).toContain("sous le numéro 841 862 907");
    expect(texte).toContain("en sa qualité de présidente");
  });

  it("nomme une personne physique sans inventer son état civil", () => {
    /*
     * Le modèle attend la naissance, la nationalité et le domicile ; Formalist ne les
     * recueille que pour un dirigeant nommé. On écrit ce qu'on a, plutôt que de laisser
     * des crochets dans un acte signé.
     */
    const texte = identificationDeLAssocie(ASSOCIES[0]);
    expect(texte).toBe("Monsieur Paul DURAND");
    expect(texte).not.toContain("[");
  });
});

describe("les contrôles de cohérence", () => {
  it("refuse un capital qui ne suit pas", () => {
    const alertes = verifierLePvAge(
      contexte({
        codes: ["augmentation_capital"],
        valeurs: {
          modeAugmentation: "Apport en numéraire",
          capitalActuelAugm: 99999,
          nouveauCapitalAugm: 120000,
        },
      })
    );

    expect(alertes.some((a) => a.gravite === "bloquant" && a.message.includes("capital"))).toBe(true);
  });

  it("refuse un nouveau capital qui ne fait pas titres × nominal", () => {
    const alertes = verifierLePvAge(
      contexte({
        codes: ["augmentation_capital"],
        valeurs: {
          modeAugmentation: "Apport en numéraire",
          capitalActuelAugm: 10000,
          nouveauCapitalAugm: 20000,
          nbPartsNouvelles: 500,
          valeurNominaleAugm: 10,
        },
      })
    );

    // 500 titres à 10 euros font 5 000, non 10 000 : la prime ne s'ajoute pas au capital.
    expect(alertes.some((a) => a.message.includes("15 000"))).toBe(true);
  });

  it("exige l'agrément d'un tiers dans une société de personnes", () => {
    const alertes = verifierLePvAge(
      contexte({
        codes: ["cession_parts"],
        valeurs: { agrementRequis: "Non" },
        cessions: [{ cedant: 0, parts: 100, prix: 12000, vers: "tiers", nom: "Monsieur Karim BEN SALAH" }],
      })
    );

    expect(alertes.some((a) => a.gravite === "bloquant" && a.message.includes("agrément"))).toBe(true);
  });

  it("écarte l'article 1832-2 dans une société par actions", () => {
    const alertes = verifierLePvAge(
      contexte({
        societe: { ...SOCIETE, forme: "SAS" },
        codes: ["augmentation_capital"],
        valeurs: {
          modeAugmentation: "Apport en nature",
          capitalActuelAugm: 10000,
          nouveauCapitalAugm: 30000,
          apportBienCommun: "Oui : le bien apporté est un bien commun",
        },
      })
    );

    expect(alertes.some((a) => a.message.includes("1832-2"))).toBe(true);
  });

  it("avertit du délai d'opposition quand la réduction n'efface pas des pertes", () => {
    const alertes = verifierLePvAge(
      contexte({
        codes: ["reduction_capital"],
        valeurs: {
          motifReduction: "Remboursement aux associés",
          capitalActuelRed: 10000,
          nouveauCapitalRed: 8000,
        },
      })
    );

    const opposition = alertes.find((a) => a.message.includes("opposition"));
    expect(opposition?.gravite).toBe("avertissement");
  });

  it("laisse passer un dossier cohérent", () => {
    expect(verifierLePvAge(contexte())).toEqual([]);
  });
});

describe("les résolutions portent leurs propres valeurs", () => {
  it("donne à chaque bloc sa date d'effet", () => {
    /*
     * docxtemplater résout d'abord dans la portée du bloc : sans date propre, celle du
     * transfert s'appliquerait à l'augmentation de capital.
     */
    const donnees = donneesDuPvAge(
      contexte({
        codes: ["transfert_siege", "augmentation_capital"],
        valeurs: {
          nouvelleAdresse: "5 avenue Victor Hugo",
          nouveauCodePostal: "69006",
          nouvelleVille: "Lyon",
          dateEffetTransfert: "2026-10-01",
          modeAugmentation: "Apport en numéraire",
          capitalActuelAugm: 10000,
          nouveauCapitalAugm: 15000,
          nbPartsNouvelles: 500,
          valeurNominaleAugm: 10,
          dateEffetAugm: "2026-11-15",
          banqueDepot: "Qonto",
          dateDepotFonds: "2026-11-10",
        },
      })
    );

    expect((donnees.r_transfert_siege as { date_effet: string }).date_effet).toBe("1er octobre 2026");
    expect((donnees.r_augmentation_numeraire as { date_effet: string }).date_effet).toBe(
      "15 novembre 2026"
    );
  });

  it("écrit la souscription d'une compensation de créances", () => {
    const donnees = donneesDuPvAge(
      contexte({
        codes: ["augmentation_capital"],
        valeurs: {
          modeAugmentation: "Compensation de créances",
          capitalActuelAugm: 10000,
          nouveauCapitalAugm: 15000,
          titulaireCreance: "Monsieur Paul DURAND",
          montantCreance: 5000,
          dateArreteCompte: "2026-09-01",
        },
      })
    );

    const bloc = donnees.r_augmentation_numeraire as { modalites_souscription: string };
    expect(bloc.modalites_souscription).toContain("compensation");
    expect(bloc.modalites_souscription).toContain("Monsieur Paul DURAND");
  });
});

describe("plusieurs cessions dans une même assemblée", () => {
  /*
   * L'assemblée agrée chaque cession : c'est l'agrément qui la rend opposable, et sans
   * lui elle est nulle. Le procès-verbal n'en rédigeait qu'une - la première - pendant
   * que les actes de cession, eux, se produisaient tous. Deux associés qui cédaient le
   * même jour repartaient avec deux contrats et un seul agrément.
   */
  const deuxCessions = {
    societe: SOCIETE,
    codes: ["cession_parts"],
    valeurs: {},
    assemblee: { date: "2026-09-10", associes: ASSOCIES },
    cessions: [
      { cedant: 0, parts: 300, prix: 15000, date: "2026-09-15", vers: "tiers", nom: "Marc BERTIN" },
      { cedant: 1, parts: 200, prix: 10000, date: "2026-09-15", vers: "tiers", nom: "HOLDING SUD" },
    ],
  } as unknown as ContexteGabarit;

  it("rédige une résolution par cession", () => {
    const donnees = donneesDuPvAge(deuxCessions);
    const resolutions = donnees.r_cession as { ord: string; identification_cessionnaire: string }[];

    expect(resolutions).toHaveLength(2);
    expect(resolutions.map((r) => r.ord)).toEqual(["PREMIÈRE", "DEUXIÈME"]);
    expect(resolutions.map((r) => r.identification_cessionnaire)).toEqual([
      "Marc BERTIN",
      "HOLDING SUD",
    ]);
  });

  it("décale les pouvoirs, qui ferment la marche", () => {
    const donnees = donneesDuPvAge(deuxCessions);
    expect(donnees.ord).toBe("TROISIÈME");
  });

  /* L'ordre du jour annonce chaque cession, en nommant ses parties. */
  it("annonce chaque cession à l'ordre du jour", () => {
    const ordre = donneesDuPvAge(deuxCessions).ordre_du_jour as { libelle: string }[];

    expect(ordre).toHaveLength(3);
    expect(ordre[0].libelle).toContain("Marc BERTIN");
    expect(ordre[1].libelle).toContain("HOLDING SUD");
    expect(ordre[2].libelle).toContain("pouvoirs");
  });

  /* Une cession seule garde la forme qu'elle avait : une résolution, un ordre du jour. */
  it("une seule cession ne change rien", () => {
    const donnees = donneesDuPvAge({
      ...deuxCessions,
      cessions: [deuxCessions.cessions![0]],
    } as ContexteGabarit);

    expect(donnees.r_cession).toHaveLength(1);
    expect(donnees.ord).toBe("DEUXIÈME");
    expect((donnees.ordre_du_jour as { libelle: string }[])[0].libelle).toContain(
      "constatation d'une cession"
    );
  });

  /* La qualité du signataire s'accorde : Madame Anne DURAND est associée. */
  it("le pied de l'acte accorde la qualité des signataires", () => {
    const signataires = donneesDuPvAge(deuxCessions).signataires as {
      qualite_signataire: string;
    }[];

    expect(signataires.map((s) => s.qualite_signataire)).toEqual(["Associé", "Associée"]);
  });
});
