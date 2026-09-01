import { describe, it, expect } from "vitest";
import {
  LIBELLES_CATEGORIES,
  FORME_PAR_CATEGORIE,
  formeDeLaCategorie,
  libelleDeLaCategorie,
} from "@/domain/formalite/categories-juridiques";
import {
  NATURES,
  NATURES_PROPOSEES,
  natureDeLaForme,
  formeConnue,
  formeSelonAssocies,
  qualitesDuRepresentant,
  fonctionsDuDirigeant,
  fonctionDuDirigeant,
} from "@/domain/formalite/formes";
import {
  CHAMPS_CREATION,
  valeursDuBrouillon,
  brouillonAvecValeurs,
} from "@/domain/formalite/champs-creation";
import { motsDeLaForme } from "@/domain/modification/pv-age";
import { motsDeLaCession } from "@/domain/modification/acte-cession";
import { estCivile, estUnipersonnelle, dotationDeLaReserveLegale } from "@/domain/comptes/regles";
import { motAssocie, motPart } from "@/domain/formalite/parcours";
import { texteAnnonce } from "@/infrastructure/documents/annonce";
import { fondementLegalDeLApport, fondementDeLaDispense } from "@/domain/modification/traite-apport";
import { estUnipersonnelle as fermetureUnipersonnelle } from "@/domain/fermeture/voie";
import { MODIFICATIONS } from "@/domain/modification/types";
import { donneesDesComptes } from "@/domain/comptes/gabarit";

/**
 * La forme écrite dans un acte vient du registre, et le registre parle en codes.
 *
 * La table qui les traduisait tenait dix entrées écrites de mémoire, dont cinq fausses :
 * 5410 valait « SA » quand c'est une SARL nationale, 6532, 6533 et 6534 valaient « SCI »
 * quand ce sont une SICA, un GAEC et un groupement foncier, et deux codes - 5720, 5498 -
 * n'existaient pas. Rien n'échouait : la société portait simplement dans ses actes une
 * forme qui n'était pas la sienne.
 *
 * Ces tests tiennent la table à sa source et vérifient que le vocabulaire des actes est
 * décidé au même endroit pour toutes les formes.
 */

describe("la table des catégories juridiques", () => {
  it("porte la nomenclature entière", () => {
    /* 260 positions au niveau III, septembre 2022. */
    expect(Object.keys(LIBELLES_CATEGORIES)).toHaveLength(260);
  });

  it("ne rattache que des codes qui existent", () => {
    const inconnus = Object.keys(FORME_PAR_CATEGORIE).filter((c) => !LIBELLES_CATEGORIES[c]);
    expect(inconnus).toEqual([]);
  });

  it("ne rattache qu'à des formes déclarées", () => {
    const orphelines = Object.values(FORME_PAR_CATEGORIE).filter((f) => !NATURES[f]);
    expect(orphelines).toEqual([]);
  });

  it("corrige les entrées qui étaient fausses", () => {
    /* 5410 n'est pas une SA : c'est une SARL nationale. */
    expect(libelleDeLaCategorie("5410")).toBe("SARL nationale");
    expect(formeDeLaCategorie("5410")).toBe("SARL");

    /* Ni la SICA, ni le GAEC, ni le groupement foncier ne sont des SCI. */
    expect(formeDeLaCategorie("6532")).toBe("SC");
    expect(formeDeLaCategorie("6533")).toBe("GAEC");
    expect(formeDeLaCategorie("6534")).toBe("SC");
    expect(formeDeLaCategorie("6540")).toBe("SCI");

    /* Ces deux codes n'existent pas dans la nomenclature. */
    expect(libelleDeLaCategorie("5720")).toBeNull();
    expect(libelleDeLaCategorie("5498")).toBeNull();
  });

  it("reconnaît la société qui a révélé le défaut", () => {
    /* STERLING PEAK, 899979934 : une SELASU, immatriculée en 5785. */
    expect(formeDeLaCategorie("5785")).toBe("SELAS");
    expect(libelleDeLaCategorie("5785")).toBe(
      "Société d'exercice libéral par action simplifiée"
    );
  });

  it("ne rattache rien à ce qui n'est pas une société", () => {
    /* Une association, un GIE, une administration : le libellé est connu, pas la forme. */
    for (const code of ["9220", "6220", "7210", "1000", "3120"]) {
      expect(libelleDeLaCategorie(code)).toBeTruthy();
      expect(formeDeLaCategorie(code)).toBeNull();
    }
  });

  it("ne prétend pas distinguer l'unipersonnel", () => {
    /*
     * L'unipersonnalité n'est pas une catégorie juridique : une SASU est immatriculée
     * comme une SAS, une EURL comme une SARL. Aucun code ne peut donc les désigner.
     */
    expect(Object.values(FORME_PAR_CATEGORIE)).not.toContain("SASU");
    expect(Object.values(FORME_PAR_CATEGORIE)).not.toContain("EURL");
    expect(Object.values(FORME_PAR_CATEGORIE)).not.toContain("SELASU");
  });
});

describe("la nature d'une forme", () => {
  it("décide du vocabulaire au même endroit pour tout le monde", () => {
    /*
     * Cinq fonctions tenaient chacune leur liste. Une SA lisait « parts sociales » dans
     * sa feuille de présence et « actions » ailleurs, dans le même procès-verbal.
     */
    for (const forme of NATURES_PROPOSEES) {
      const nature = natureDeLaForme(forme);
      expect(motsDeLaForme(forme).titres).toBe(nature.titres);
      expect(motsDeLaCession(forme).titres).toBe(nature.titres);
      expect(motsDeLaForme(forme).associesPluriel).toBe(nature.associesPluriel);
    }
  });

  it("donne à chaque forme les titres du tableau validé", () => {
    const parActions = ["SA", "SAS", "SASU", "SE", "SCA", "SELAS", "SELASU", "SELAFA", "SELCA"];
    const parParts = ["SARL", "EURL", "SNC", "SCS", "SELARL", "SELARLU", "SCI", "SC", "SCM", "SCP", "SCEA", "EARL", "GAEC"];

    for (const f of parActions) expect(natureDeLaForme(f).titres).toBe("actions");
    for (const f of parParts) expect(natureDeLaForme(f).titres).toBe("parts sociales");
  });

  it("dirige les commandites par un gérant, malgré leurs actions", () => {
    /* C'est la commandite qui commande le titre, non la nature des titres. */
    expect(natureDeLaForme("SCA").titres).toBe("actions");
    expect(natureDeLaForme("SCA").titreDirigeant).toBe("Gérant");
    expect(natureDeLaForme("SELCA").titreDirigeant).toBe("Gérant");
  });

  it("donne un président à la SELAS, non un gérant", () => {
    /*
     * Une société d'exercice libéral par actions simplifiée est une SAS : elle a un
     * président. `qualitesDuRepresentant` la rangeait parmi les gérants.
     */
    expect(natureDeLaForme("SELAS").titreDirigeant).toBe("Président");
    expect(qualitesDuRepresentant("SELAS")).toContain("Président");
    expect(qualitesDuRepresentant("SELAS")).not.toContain("Gérant");

    expect(qualitesDuRepresentant("SELARL")).toContain("Gérant");
    expect(qualitesDuRepresentant("SELARL")).not.toContain("Président");
  });

  it("suit la forme support pour une holding de profession libérale", () => {
    expect(natureDeLaForme("SPFPL SARL").titres).toBe("parts sociales");
    expect(natureDeLaForme("SPFPL SARL").titreDirigeant).toBe("Gérant");
    expect(natureDeLaForme("SPFPL SAS").titres).toBe("actions");
    expect(natureDeLaForme("SPFPL SAS").titreDirigeant).toBe("Président");
  });

  it("ne fait pas échouer une forme qu'elle ne connaît pas", () => {
    /* Une société étrangère, une forme rare : l'acte doit rester rédigeable. */
    const inconnue = natureDeLaForme("LIMITED");
    expect(inconnue.code).toBe("");
    expect(inconnue.titres).toBe("parts sociales");
    expect(formeConnue("LIMITED")).toBe(false);
    expect(formeConnue("SELASU")).toBe(true);
  });

  it("précise l'unipersonnel au nombre d'associés", () => {
    expect(formeSelonAssocies("SAS", 1)).toBe("SASU");
    expect(formeSelonAssocies("SASU", 3)).toBe("SAS");
    expect(formeSelonAssocies("SARL", 1)).toBe("EURL");
    expect(formeSelonAssocies("SELAS", 1)).toBe("SELASU");
    expect(formeSelonAssocies("SELARL", 1)).toBe("SELARLU");
    /* Une forme sans jumelle ne bouge pas. */
    expect(formeSelonAssocies("SNC", 1)).toBe("SNC");
    expect(formeSelonAssocies("SCI", 1)).toBe("SCI");
  });
});

describe("les règles du dépôt des comptes", () => {
  it("ne prend pas les commandites pour des sociétés civiles", () => {
    /*
     * Le test portait sur les deux premières lettres : la SCA et la SCS y passaient
     * pour civiles et perdaient leur réserve légale et leur dépôt au greffe.
     */
    expect(estCivile("SCA")).toBe(false);
    expect(estCivile("SCS")).toBe(false);
    expect(estCivile("SCI")).toBe(true);
    expect(estCivile("SCP")).toBe(true);
    expect(estCivile("SCM")).toBe(true);
    expect(estCivile("SAS")).toBe(false);
  });

  it("reconnaît toutes les formes unipersonnelles, non les deux d'origine", () => {
    expect(estUnipersonnelle("SASU")).toBe(true);
    expect(estUnipersonnelle("EURL")).toBe(true);
    expect(estUnipersonnelle("SELASU")).toBe(true);
    expect(estUnipersonnelle("SELARLU")).toBe(true);
    expect(estUnipersonnelle("SAS")).toBe(false);
  });

  it("écrit « actions » dans le procès-verbal d'une SELAS", () => {
    /*
     * Le gabarit d'approbation nommait trois formes - SAS, SASU, SA - et une société
     * d'exercice libéral par actions simplifiée y approuvait ses comptes en parlant de
     * parts sociales. C'est le chemin exact du dépôt des comptes.
     */
    const contexte = (forme: string) => ({
      societe: { denomination: "CABINET ESSAI", forme, siren: "899979934", capital: 20000,
                 adresse: "34 rue Laugier", codePostal: "75017", ville: "Paris", villeRcs: "Paris" },
      associes: [], valeurs: {},
      affectation: { reserveLegaleCentimes: 0, autresReservesCentimes: 0,
                     dividendesCentimes: 0, reportANouveauCentimes: 0 },
      conventions: [], exclusions: [], demandeLaConfidentialite: false,
    });

    expect(donneesDesComptes(contexte("SELAS") as never).MOT_TITRES).toBe("actions");
    expect(donneesDesComptes(contexte("SELARL") as never).MOT_TITRES).toBe("parts sociales");
    expect(donneesDesComptes(contexte("SCP") as never).MOT_TITRES).toBe("parts sociales");
    expect(donneesDesComptes(contexte("SAS") as never).MOT_TITRES).toBe("actions");
  });

  it("accepte les formes que le parcours refusait", () => {
    for (const f of ["SELAS", "SELARL", "SCP", "SCM", "SCA", "EARL"]) {
      expect(NATURES_PROPOSEES).toContain(f);
    }
  });
});

describe("les autres écrans et documents", () => {
  /*
   * Le mot qui désigne la personne ne suit pas celui qui désigne le titre.
   *
   * Une société par actions émet bien des actions, mais l'article L. 227-1 du code de
   * commerce nomme « associés » ceux qui les détiennent - « actionnaire » est réservé à
   * la société anonyme. Les actes le disaient déjà ; l'interface disait l'inverse.
   */
  it("dit « associé » partout, et distingue les actions des parts", () => {
    for (const f of ["SELAFA", "SELCA", "SPFPL SAS", "SCA", "SE"]) {
      expect(motAssocie()).toBe("Associé");
      expect(motPart(f, true)).toBe("actions");
    }
    for (const f of ["SELARL", "SCP", "SCM", "SNC"]) {
      expect(motAssocie()).toBe("Associé");
      expect(motPart(f, true)).toBe("parts");
    }
  });

  it("ne publie plus « Représentant légal » au journal d'annonces légales", () => {
    /*
     * Le module d'annonce déduisait le titre d'une liste de cinq formes et rendait
     * « Représentant légal » pour toutes les autres - un titre qui n'existe chez
     * personne, et qui partait tel quel à la publication.
     */
    const annonce = (forme: string) =>
      texteAnnonce({
        type: "creation",
        forme,
        societe: "CABINET ESSAI",
        capital: 20000,
        data_json: JSON.stringify({
          adresse: "34 rue Laugier",
          code_postal: "75017",
          ville: "Paris",
          dirigeant_nom_complet: "Madame Claire MERCIER",
        }),
      });

    expect(annonce("SELAS")).toContain("Président");
    expect(annonce("SELARL")).toContain("Gérant");
    expect(annonce("SCP")).toContain("Gérant");
    expect(annonce("SCA")).toContain("Gérant");
    for (const f of ["SELAS", "SELARL", "SCP", "SCA", "SCM", "EARL"]) {
      expect(annonce(f)).not.toContain("Représentant légal");
    }
  });
});

describe("le régime dont la forme relève", () => {
  it("cite l'article de la SARL pour une SELARL", () => {
    /*
     * Une société d'exercice libéral n'a pas de droit propre : la loi du 31 décembre
     * 1990 la soumet au livre II du code de commerce. Une SELARL suit donc la SARL.
     * Les fonctions comparaient le sigle à « SARL » et « EURL », et citaient à la
     * SELARL l'article des sociétés par actions.
     */
    expect(fondementLegalDeLApport("SELARL")).toContain("L. 223-33");
    expect(fondementLegalDeLApport("SELARLU")).toContain("L. 223-33");
    expect(fondementLegalDeLApport("SARL")).toContain("L. 223-33");
    expect(fondementDeLaDispense("SELARL")).toBe("l'article L. 223-9 du code de commerce");

    /* Une SELAS suit la SAS, une SELAFA la SA. */
    expect(fondementLegalDeLApport("SELAS")).toContain("L. 227-1");
    expect(fondementLegalDeLApport("SELAFA")).toContain("L. 225-147");
    expect(fondementLegalDeLApport("SELAFA")).not.toContain("L. 227-1");
  });

  it("reconnaît l'associé unique d'une SELASU", () => {
    /* Deux sigles étaient nommés : la SELASU convoquait donc une assemblée d'un seul. */
    expect(fermetureUnipersonnelle("SELASU")).toBe(true);
    expect(fermetureUnipersonnelle("SELARLU")).toBe(true);
    expect(fermetureUnipersonnelle("SASU")).toBe(true);
    expect(fermetureUnipersonnelle("SELAS")).toBe(false);
  });

  it("avertit le conjoint dans toutes les sociétés à parts", () => {
    /*
     * L'article 1832-2 du code civil vise les parts non négociables. Quatre formes
     * étaient nommées : l'apport d'un bien commun à une SELARL ou à une SCP se faisait
     * sans avertissement, et le conjoint pouvait en demander la nullité deux ans durant.
     */
    const champ = MODIFICATIONS.flatMap((m) => m.champs ?? []).find(
      (c) => c.identifiant === "apportBienCommun"
    );

    expect(champ?.formes).toBeDefined();
    for (const f of ["SARL", "EURL", "SELARL", "SCP", "SCM", "SNC", "SCI", "EARL"]) {
      expect(champ?.formes).toContain(f);
    }
    /* Les sociétés par actions en sont exclues : leurs titres sont négociables. */
    for (const f of ["SAS", "SASU", "SA", "SELAS"]) {
      expect(champ?.formes).not.toContain(f);
    }
  });
});

describe("la réserve légale", () => {
  /**
   * L'article L. 232-10 du code de commerce vise « les sociétés à responsabilité
   * limitée et les sociétés par actions » - et personne d'autre. Le prélèvement est
   * d'un vingtième au moins du bénéfice diminué des pertes antérieures reportées, et
   * cesse d'être obligatoire quand la réserve atteint le dixième du capital.
   *
   * Le code ne testait que la société civile : une société en nom collectif et une
   * commandite simple se voyaient imposer un prélèvement que la loi ne leur demande
   * pas, et l'écran refusait leur affectation tant qu'elles ne l'avaient pas fait.
   */
  const cas = {
    resultatCentimes: 3_072_100,
    reportAnterieurCentimes: 0,
    capitalCentimes: 2_000_000,
    reserveExistanteCentimes: 1_500,
  };

  it("ne vise que les SARL et les sociétés par actions", () => {
    for (const forme of ["SARL", "EURL", "SELARL", "SAS", "SASU", "SA", "SELAS", "SELAFA"]) {
      expect(dotationDeLaReserveLegale({ forme, ...cas }).applicable, forme).toBe(true);
    }

    /* La commandite par actions en est une : elle la doit. La simple, non. */
    expect(dotationDeLaReserveLegale({ forme: "SCA", ...cas }).applicable).toBe(true);
    expect(dotationDeLaReserveLegale({ forme: "SCS", ...cas }).applicable).toBe(false);

    for (const forme of ["SNC", "SCI", "SCP", "SCM", "EARL", "GAEC"]) {
      expect(dotationDeLaReserveLegale({ forme, ...cas }).applicable, forme).toBe(false);
    }
  });

  it("prélève un vingtième, plafonné au dixième du capital", () => {
    const d = dotationDeLaReserveLegale({ forme: "SAS", ...cas });
    /* 5 % de 30 721 €, soit 1 536,05 €, et la réserve n'atteint pas encore 2 000 €. */
    expect(d.dotationCentimes).toBe(153_605);
    expect(d.plafondCentimes).toBe(200_000);
    expect(d.apresDotationCentimes).toBe(155_105);
  });

  it("s'arrête au plafond, sans le dépasser", () => {
    const d = dotationDeLaReserveLegale({
      ...cas,
      forme: "SAS",
      reserveExistanteCentimes: 195_000,
    });
    /* Il ne manque que 50 € : le vingtième est ramené à ce qui manque. */
    expect(d.dotationCentimes).toBe(5_000);
    expect(d.apresDotationCentimes).toBe(200_000);
  });

  it("prélève sur le bénéfice diminué des pertes reportées", () => {
    const d = dotationDeLaReserveLegale({
      ...cas,
      forme: "SAS",
      reportAnterieurCentimes: -1_000_000,
    });
    /* 30 721 € de bénéfice, 10 000 € de pertes : 5 % de 20 721 €. */
    expect(d.dotationCentimes).toBe(103_605);
  });
});

/**
 * Le titre du dirigeant, corrigé de ce que la forme interdit.
 *
 * L'écran restreint les choix depuis, et la vérification refuse un titre qui ne va pas
 * avec la forme - mais un dossier réglé avant garde le sien. Une SELAS s'est ainsi
 * déposée « en qualité de Gérant ».
 */
describe("le titre du dirigeant", () => {
  it("remplace un titre que la forme ne connaît pas", () => {
    expect(fonctionDuDirigeant("SELAS", "Gérant")).toBe("Président");
    expect(fonctionDuDirigeant("SELARL", "Président")).toBe("Gérant");
    expect(fonctionDuDirigeant("SAS", "Co-gérant")).toBe("Président");
  });

  it("laisse un titre que la forme connaît", () => {
    expect(fonctionDuDirigeant("SELAS", "Directeur général")).toBe("Directeur général");
    expect(fonctionDuDirigeant("SARL", "Co-gérant")).toBe("Co-gérant");
    expect(fonctionDuDirigeant("SAS", "Président")).toBe("Président");
  });

  it("donne le titre de la forme quand rien n'est choisi", () => {
    expect(fonctionDuDirigeant("SELAS", "")).toBe("Président");
    expect(fonctionDuDirigeant("SARL", null)).toBe("Gérant");
  });

  /* Le repli ne vaut que sur l'impossible : un titre offert n'est jamais réécrit. */
  it("ne réécrit jamais un titre que l'écran offrait", () => {
    for (const forme of ["SAS", "SASU", "SELAS", "SARL", "EURL", "SELARL", "SCI"]) {
      for (const titre of fonctionsDuDirigeant(forme)) {
        expect(fonctionDuDirigeant(forme, titre), forme + " / " + titre).toBe(titre);
      }
    }
  });
});

/**
 * Le formulaire d'une création, déclaré.
 *
 * Les quatre autres parcours décrivent leurs champs dans une table ; la création, la
 * plus ancienne, écrivait les siens à la main dans six composants. L'avocat qui voulait
 * corriger une valeur pour reproduire les actes n'avait aucune liste à lui montrer.
 */
describe("les champs d'une création", () => {
  it("porte un libellé et un groupe sur chaque champ", () => {
    for (const champ of CHAMPS_CREATION) {
      expect(champ.libelle, champ.identifiant).toBeTruthy();
      expect(champ.groupe, champ.identifiant).toBeTruthy();
    }
  });

  it("lit et réécrit le domiciliataire, qui vit dans un sous-objet", () => {
    /*
     * Le brouillon le range sous « domiciliataire », avec trois clés ; la table le
     * déclare à plat pour que la fenêtre le rende comme les autres.
     */
    const brouillon = {
      denomination: "ACME",
      domiciliataire: { denomination: "SEDOMICILIER", siren: "123", agrement: "A-1" },
    };

    const valeurs = valeursDuBrouillon(brouillon);
    expect(valeurs.domiciliataireDenomination).toBe("SEDOMICILIER");
    expect(valeurs.domiciliataireAgrement).toBe("A-1");

    const repose = brouillonAvecValeurs(brouillon, {
      denomination: "ACME 2",
      domiciliataireAgrement: "A-2",
    });
    expect(repose.denomination).toBe("ACME 2");
    expect(repose.domiciliataire).toEqual({
      denomination: "SEDOMICILIER",
      siren: "123",
      agrement: "A-2",
    });
  });

  it("n'invente rien quand le brouillon est vide", () => {
    expect(valeursDuBrouillon({})).toEqual({});
    expect(brouillonAvecValeurs({}, {}).domiciliataire).toEqual({});
  });
});
