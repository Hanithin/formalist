import { describe, it, expect } from "vitest";
import { champsASaisir } from "@/domain/modification/types";
import { piecesAFournir, obligationsParticulieres } from "@/domain/modification/formalites";
import {
  verifierChamps,
  verifierCoherence,
  verifierLesParts,
} from "@/domain/modification/verification";

/**
 * L'augmentation de capital, selon son mode.
 *
 * Trois modes étaient proposés et aucun champ n'en dépendait : le texte d'aide parlait
 * du commissaire aux apports et de l'attestation de dépôt, mais rien ne recueillait ni
 * le nom du commissaire ni la banque. Les actes sortaient à trous, et la compensation
 * de créances - l'incorporation du compte courant d'un associé, le cas le plus fréquent
 * dans une petite société - n'existait pas.
 */

const identifiants = (mode: string, autres: Record<string, string> = {}) =>
  champsASaisir(["augmentation_capital"], { modeAugmentation: mode, ...autres }).map(
    (c) => c.identifiant
  );

describe("les modes d'augmentation", () => {
  it("la compensation de créances est proposée", () => {
    const champs = champsASaisir(["augmentation_capital"], {});
    const mode = champs.find((c) => c.identifiant === "modeAugmentation")!;
    expect(mode.options).toEqual([
      "Apport en numéraire",
      "Compensation de créances",
      "Incorporation de réserves",
      "Apport en nature",
    ]);
  });

  it("chaque mode demande ce qu'il implique, et rien d'autre", () => {
    expect(identifiants("Apport en numéraire")).toContain("banqueDepot");
    expect(identifiants("Apport en numéraire")).not.toContain("commissaireApports");

    expect(identifiants("Compensation de créances")).toContain("titulaireCreance");
    expect(identifiants("Compensation de créances")).toContain("dateArreteCompte");
    expect(identifiants("Compensation de créances")).not.toContain("banqueDepot");

    expect(identifiants("Incorporation de réserves")).toContain("posteIncorpore");
    expect(identifiants("Incorporation de réserves")).not.toContain("descriptionApport");

    expect(identifiants("Apport en nature")).toContain("descriptionApport");
    expect(identifiants("Apport en nature")).toContain("dispenseCommissaire");
  });

  it("le commissaire ne se nomme que s'il n'y a pas dispense", () => {
    /*
     * La dispense suppose l'unanimité, aucun apport au-dessus de 30 000 € et un total
     * sous la moitié du capital (art. L. 223-33 renvoyant à L. 223-9, art. D. 223-6-1).
     */
    const avec = identifiants("Apport en nature", {
      dispenseCommissaire: "Non, un commissaire est désigné",
    });
    expect(avec).toContain("commissaireApports");

    const sans = identifiants("Apport en nature", { dispenseCommissaire: "Oui, à l'unanimité" });
    expect(sans).not.toContain("commissaireApports");
  });

  it("un champ hors du mode choisi n'est jamais réclamé", () => {
    // Sinon l'étape ne se passe plus : elle exige ce qu'elle n'affiche pas.
    const manques = verifierChamps(["augmentation_capital"], {
      modeAugmentation: "Incorporation de réserves",
      capitalActuelAugm: 10000,
      nouveauCapitalAugm: 20000,
      posteIncorpore: "Réserves",
      montantIncorpore: 10000,
      dateEffetAugm: "2026-09-15",
      /* Le rapport du président est dû même là : R. 225-113. */
      motifsAugmentation: "renforcer les fonds propres",
    });
    expect(manques).toEqual([]);
  });
});

describe("les pièces suivent le mode", () => {
  it("la compensation de créances appelle l'arrêté de compte", () => {
    const pieces = piecesAFournir(["augmentation_capital"], {
      modeAugmentation: "Compensation de créances",
    });
    expect(pieces.map((p) => p.identifiant)).toContain("arrete-compte");
  });

  it("un apport en nature dispensé ne réclame pas le rapport", () => {
    /*
     * Le réclamer bloquerait un dossier sur une pièce que la loi n'exige pas dès lors
     * que les associés ont décidé la dispense à l'unanimité.
     */
    const avec = piecesAFournir(["augmentation_capital"], {
      modeAugmentation: "Apport en nature",
      dispenseCommissaire: "Non, un commissaire est désigné",
    });
    expect(avec.map((p) => p.identifiant)).toContain("commissaire-apports");

    const sans = piecesAFournir(["augmentation_capital"], {
      modeAugmentation: "Apport en nature",
      dispenseCommissaire: "Oui, à l'unanimité",
    });
    expect(sans.map((p) => p.identifiant)).not.toContain("commissaire-apports");
  });

  it("la dispense s'accompagne de ce qu'elle coûte", () => {
    // Cinq ans de responsabilité solidaire sur la valeur retenue : on le dit avant.
    const dits = obligationsParticulieres(["augmentation_capital"], {
      modeAugmentation: "Apport en nature",
      dispenseCommissaire: "Oui, à l'unanimité",
    });
    expect(dits.join(" ")).toContain("solidairement");
    expect(dits.join(" ")).toContain("cinq ans");
    expect(dits.join(" ")).toContain("L. 223-9");
  });
});

describe("un siège chez une société de domiciliation", () => {
  /*
   * L'activité est réglementée : le domiciliataire détient un agrément préfectoral
   * (articles R. 123-166-2 et suivants du code de commerce) dont les références
   * figurent au contrat. Le domicilié déclare au registre qui l'héberge.
   */
  it("réclame le nom, le SIREN et l'agrément du domiciliataire", () => {
    const manques = verifierChamps(["transfert_siege"], {
      nouvelleAdresse: "10 rue de Penthièvre",
      nouvelleVille: "Paris",
      nouveauCodePostal: "75008",
      nouveauModeDomiciliation: "Société de domiciliation",
      dateEffetTransfert: "2026-09-01",
    }).map((a) => a.champ);

    expect(manques).toContain("domiciliataireDenomination");
    expect(manques).toContain("domiciliataireSiren");
    expect(manques).toContain("domiciliataireAgrement");
  });

  it("ne les réclame pas pour un bail ou un domicile personnel", () => {
    for (const mode of ["Bail commercial ou professionnel", "Domicile personnel du dirigeant"]) {
      const manques = verifierChamps(["transfert_siege"], {
        nouvelleAdresse: "10 rue de Penthièvre",
        nouvelleVille: "Paris",
        nouveauCodePostal: "75008",
        nouveauModeDomiciliation: mode,
        dateEffetTransfert: "2026-09-01",
      }).map((a) => a.champ);

      expect(manques).toEqual([]);
    }
  });

  it("contrôle les neuf chiffres du SIREN du domiciliataire", () => {
    const anomalies = verifierCoherence(["transfert_siege"], {
      nouveauModeDomiciliation: "Société de domiciliation",
      domiciliataireSiren: "12345",
    });
    expect(anomalies.map((a) => a.champ)).toContain("domiciliataireSiren");

    expect(
      verifierCoherence(["transfert_siege"], {
        nouveauModeDomiciliation: "Société de domiciliation",
        domiciliataireSiren: "908 221 138",
      })
    ).toEqual([]);
  });

  /* Le contrat déposé doit porter l'agrément : la pièce le dit, sinon on l'apprend au greffe. */
  it("demande le contrat de domiciliation, agrément compris", () => {
    const piece = piecesAFournir(["transfert_siege"], {
      nouveauModeDomiciliation: "Société de domiciliation",
    }).find((p) => p.identifiant === "jouissance-locaux");

    expect(piece?.titre).toBe("Contrat de domiciliation");
    expect(piece?.explication).toContain("agrément préfectoral");
  });
});

describe("les parts de l'assemblée", () => {
  /*
   * Le procès-verbal doit représenter tout le capital : un associé oublié ne se voit
   * pas à la lecture de l'acte, il se découvre au greffe une fois tout signé.
   */
  it("laisse passer quand le compte est juste", () => {
    expect(
      verifierLesParts({ totalParts: 1000, associes: [{ parts: 700 }, { parts: 300 }] })
    ).toEqual([]);
  });

  it("refuse quand il manque des parts, et dit combien", () => {
    const [anomalie] = verifierLesParts({ totalParts: 1000, associes: [{ parts: 700 }] });
    expect(anomalie.message).toContain("300");
  });

  it("refuse aussi quand les associés en détiennent plus que le capital", () => {
    const [anomalie] = verifierLesParts({
      totalParts: 100,
      associes: [{ parts: 80 }, { parts: 40 }],
    });
    expect(anomalie.message).toContain("120");
  });

  /* Sans total déclaré, il n'y a rien à comparer : on ne bloque pas sur une absence. */
  it("ne vérifie rien tant que le total n'est pas donné", () => {
    expect(verifierLesParts({ associes: [{ parts: 700 }] })).toEqual([]);
    expect(verifierLesParts({ totalParts: null, associes: [{ parts: 700 }] })).toEqual([]);
  });
});

describe("l'apport d'un bien commun - article 1832-2 du code civil", () => {
  const APPORT_NATURE = {
    modeAugmentation: "Apport en nature",
    descriptionApport: "Un fonds de commerce",
    valeurApport: 20000,
    dispenseCommissaire: "Oui, à l'unanimité",
    capitalActuelAugm: 10000,
    nouveauCapitalAugm: 30000,
    dateEffetAugm: "2026-09-01",
  };

  /*
   * L'article ne vise que les parts non négociables. Les actions d'une SAS le sont :
   * poser la question à son associé serait lui demander de trancher une règle qui ne
   * le concerne pas.
   */
  it("ne se pose qu'aux sociétés à parts non négociables", () => {
    const pour = (forme: string) =>
      champsASaisir(["augmentation_capital"], APPORT_NATURE, forme).map((c) => c.identifiant);

    expect(pour("SARL")).toContain("apportBienCommun");
    expect(pour("SCI")).toContain("apportBienCommun");
    expect(pour("SAS")).not.toContain("apportBienCommun");
    expect(pour("SA")).not.toContain("apportBienCommun");
  });

  /* Forme inconnue : mieux vaut une question de trop qu'une mention légale tue. */
  it("se pose quand la forme n'est pas connue", () => {
    expect(
      champsASaisir(["augmentation_capital"], APPORT_NATURE).map((c) => c.identifiant)
    ).toContain("apportBienCommun");
  });

  it("réclame le nom du conjoint et sa position quand le bien est commun", () => {
    const manques = verifierChamps(
      ["augmentation_capital"],
      { ...APPORT_NATURE, apportBienCommun: "Oui : le bien apporté est un bien commun" },
      "SARL"
    ).map((a) => a.champ);

    expect(manques).toContain("conjointNomComplet");
    expect(manques).toContain("conjointRevendication");
  });

  it("ne réclame rien de plus quand le bien est propre", () => {
    const manques = verifierChamps(
      ["augmentation_capital"],
      {
        ...APPORT_NATURE,
        apportBienCommun: "Non : apporteur non marié, séparation de biens, ou bien propre",
      },
      "SARL"
    ).map((a) => a.champ);

    expect(manques).not.toContain("conjointNomComplet");
    expect(manques).not.toContain("conjointRevendication");
  });

  it("avertit de la nullité encourue, et du sort de la revendication", () => {
    const dits = obligationsParticulieres(
      ["augmentation_capital"],
      {
        ...APPORT_NATURE,
        apportBienCommun: "Oui : le bien apporté est un bien commun",
        conjointRevendication: "Non : il renonce à la qualité d'associé",
      },
      "SARL"
    ).join(" ");

    expect(dits).toContain("1832-2");
    expect(dits).toContain("deux ans");
    expect(dits).toContain("revendiquer");
  });
});
