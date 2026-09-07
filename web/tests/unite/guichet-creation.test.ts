import { describe, it, expect } from "vitest";
import {
  adresseFrancaise,
  contenuDeLaCreation,
  formaliteDeCreation,
} from "@/domain/guichet/creation";
import { codeSituationMatrimoniale, FORME_JURIDIQUE } from "@/domain/guichet/nomenclatures";
import type { Brouillon } from "@/domain/formalite/parcours";

/**
 * La traduction du brouillon vers le contenu attendu par le guichet unique.
 *
 * Deux modèles qui ne se ressemblent pas : quarante champs d'un côté, plusieurs
 * centaines de l'autre. La traduction est donc incomplète par nature, et c'est la
 * liste des manques qui compte autant que le contenu - elle dit ce qu'il reste à
 * demander, et elle vient du code qui traduit plutôt que d'un document qui dériverait.
 */
const BROUILLON: Brouillon = {
  forme: "SAS",
  denomination: "ATELIER MERIDIEN",
  activite: "la conception et la vente de mobilier contemporain",
  adresse: "12 rue Vauban",
  codePostal: "69006",
  ville: "Lyon",
  capital: 20000,
  partsTotales: 2000,
  dureeDeVie: 99,
  dateDebutActivite: "2026-09-15",
  dateCloturePremierExercice: "2027-12-31",
  banque: "Qonto",
  associes: [
    {
      type: "physique",
      parts: 1400,
      personne: {
        civilite: "Monsieur",
        prenom: "Jean",
        nom: "Dupont",
        dateDeNaissance: "1980-04-12",
        villeDeNaissance: "Lyon",
        situationMatrimoniale: "Marié(e)",
        adresse: "5 rue de la Paix",
        codePostal: "69001",
        ville: "Lyon",
      },
    },
    {
      type: "physique",
      parts: 600,
      personne: { civilite: "Madame", prenom: "Claire", nom: "Martin" },
    },
  ],
  dirigeants: [{ associe: 0 }],
};

describe("les nomenclatures", () => {
  /* Une SASU est une SAS à associé unique : le registre ne les distingue pas. */
  it("donnent le même code à une forme et à sa version unipersonnelle", () => {
    expect(FORME_JURIDIQUE.SAS).toBe("5710");
    expect(FORME_JURIDIQUE.SASU).toBe("5710");
    expect(FORME_JURIDIQUE.SARL).toBe("5499");
    expect(FORME_JURIDIQUE.EURL).toBe("5499");
    expect(FORME_JURIDIQUE.SCI).toBe("6540");
  });

  it("codent la situation matrimoniale telle que le formulaire l'écrit", () => {
    expect(codeSituationMatrimoniale("Célibataire")).toBe("1");
    expect(codeSituationMatrimoniale("Marié(e)")).toBe("4");
    expect(codeSituationMatrimoniale("Pacsé(e)")).toBe("5");
  });

  /*
   * Rien plutôt qu'un repli : « célibataire » par défaut ferait déclarer célibataire
   * une personne mariée, et un champ faux ne se voit pas là où un champ absent se
   * signale.
   */
  it("ne devinent pas une situation qu'on ne leur a pas dite", () => {
    expect(codeSituationMatrimoniale("")).toBeNull();
    expect(codeSituationMatrimoniale(undefined)).toBeNull();
    expect(codeSituationMatrimoniale("en concubinage")).toBeNull();
  });
});

describe("l'adresse", () => {
  it("sépare le numéro de la voie quand il est certain", () => {
    expect(adresseFrancaise("12 rue Vauban", "69006", "Lyon")).toEqual({
      codePays: "FRA",
      codePostal: "69006",
      commune: "Lyon",
      numVoie: "12",
      voie: "rue Vauban",
    });
  });

  /* Le type de voie se code contre deux cent trente entrées : on ne le devine pas. */
  it("laisse la ligne entière quand elle ne commence pas par un numéro", () => {
    expect(adresseFrancaise("Lieu-dit Le Colombier", "69006", "Lyon")).toMatchObject({
      voie: "Lieu-dit Le Colombier",
    });
  });

  it("rend les deux champs que le contrat exige, même sans voie", () => {
    const a = adresseFrancaise("", "69006", "Lyon");
    expect(a).toEqual({ codePays: "FRA", codePostal: "69006", commune: "Lyon" });
  });
});

describe("le contenu d'une création", () => {
  it("pose la forme juridique aux deux endroits qui la portent", () => {
    const { contenu } = contenuDeLaCreation(BROUILLON);
    const nature = contenu.natureCreation as Record<string, unknown>;
    const pm = contenu.personneMorale as Record<string, Record<string, Record<string, unknown>>>;

    expect(nature.formeJuridique).toBe("5710");
    expect(pm.identite.entreprise.formeJuridique).toBe("5710");
  });

  it("porte le capital, sa devise et la durée", () => {
    const { contenu } = contenuDeLaCreation(BROUILLON);
    const pm = contenu.personneMorale as Record<string, Record<string, Record<string, unknown>>>;

    expect(pm.identite.description).toMatchObject({
      montantCapital: 20000,
      montantCapitalCentime: 0,
      deviseCapital: "EUR",
      duree: 99,
    });
  });

  /*
   * Une clôture, deux champs, deux écritures.
   *
   * `datePremiereCloture` porte la première clôture en entier ; `dateClotureExerciceSocial`
   * le rendez-vous annuel qui suivra, en DDMM. Nous mettions la date ISO dans le second,
   * et le guichet répondait « La date doit être au format DDMM ».
   */
  it("écrit la clôture aux deux formats que le guichet distingue", () => {
    const { contenu } = contenuDeLaCreation(BROUILLON);
    const pm = contenu.personneMorale as Record<string, Record<string, Record<string, unknown>>>;

    expect(pm.identite.description.datePremiereCloture).toBe("2027-12-31");
    expect(pm.identite.description.dateClotureExerciceSocial).toBe("3112");
  });

  /*
   * L'objet social se déclare avec la durée et le capital, non à côté de la dénomination.
   */
  it("déclare l'objet social dans la description, non dans l'entreprise", () => {
    const { contenu } = contenuDeLaCreation(BROUILLON);
    const pm = contenu.personneMorale as Record<string, Record<string, Record<string, unknown>>>;

    expect(pm.identite.description.objet).toBe(BROUILLON.activite);
    expect(pm.identite.entreprise.objet).toBeUndefined();
  });

  /* Le siège qui exerce vaut 2 : siège et établissement principal. */
  it("déclare le siège comme établissement principal", () => {
    const { contenu } = contenuDeLaCreation(BROUILLON);
    const pm = contenu.personneMorale as Record<string, Record<string, Record<string, unknown>>>;
    expect(pm.etablissementPrincipal.descriptionEtablissement.rolePourEntreprise).toBe("2");
  });

  it("traduit le dirigeant en pouvoir, avec son état civil", () => {
    const { contenu } = contenuDeLaCreation(BROUILLON);
    const pm = contenu.personneMorale as Record<string, { pouvoirs: Record<string, never>[] }>;
    const pouvoir = pm.composition.pouvoirs[0] as unknown as {
      individu: { descriptionPersonne: Record<string, unknown> };
    };

    expect(pouvoir.individu.descriptionPersonne).toMatchObject({
      nom: "Dupont",
      prenoms: ["Jean"],
      dateDeNaissance: "1980-04-12",
      situationMatrimoniale: "4",
    });
  });

  /*
   * Sans forme juridique il n'y a rien à traduire. Rendre un contenu à moitié rempli
   * ferait passer pour incomplet ce qui est en réalité ininterprétable.
   */
  it("ne traduit rien sans forme juridique", () => {
    const { contenu, manques } = contenuDeLaCreation({ denomination: "SANS FORME" });
    expect(contenu).toEqual({});
    expect(manques).toHaveLength(1);
    expect(manques[0].chemin).toBe("natureCreation.formeJuridique");
  });
});

describe("le pays de naissance", () => {
  /*
   * Le dépôt écrivait « FRA » quoi qu'on ait saisi.
   *
   * Une personne née à Alger était déclarée née en France, et rien dans le dossier ne
   * permettait de s'en apercevoir : le champ du formulaire disait « Algérie », le
   * contenu envoyé disait la France.
   */
  it("suit le pays saisi plutôt que la France", () => {
    const ne = (pays: string): Brouillon => ({
      ...BROUILLON,
      associes: [
        {
          ...BROUILLON.associes![0],
          personne: { ...BROUILLON.associes![0].personne, paysDeNaissance: pays },
        },
        BROUILLON.associes![1],
      ],
    });

    const pouvoirs = (b: Brouillon) =>
      (contenuDeLaCreation(b).contenu.personneMorale as { composition: { pouvoirs: unknown[] } })
        .composition.pouvoirs[0] as { individu: { descriptionPersonne: { paysNaissance: string } } };

    expect(pouvoirs(ne("Algérie")).individu.descriptionPersonne.paysNaissance).toBe("ALGÉRIE");
    expect(pouvoirs(ne("Belgique")).individu.descriptionPersonne.paysNaissance).toBe("BELGIQUE");

    /* Trente-quatre pays ne s'écrivent pas chez eux comme chez nous : ceux-là passent
       par la table des écarts, et non par de simples capitales. */
    expect(pouvoirs(ne("Birmanie")).individu.descriptionPersonne.paysNaissance).toBe("MYANMAR");
    expect(pouvoirs(ne("République tchèque")).individu.descriptionPersonne.paysNaissance).toBe(
      "TCHÈQUE, RÉPUBLIQUE"
    );
  });

  /* Sans réponse, la France : c'est le cas de très loin le plus fréquent. */
  it("retient la France quand rien n'est saisi", () => {
    const pouvoir = (
      contenuDeLaCreation(BROUILLON).contenu.personneMorale as {
        composition: { pouvoirs: unknown[] };
      }
    ).composition.pouvoirs[0] as {
      individu: { descriptionPersonne: { paysNaissance: string } };
    };
    expect(pouvoir.individu.descriptionPersonne.paysNaissance).toBe("FRANCE");
  });

  /*
   * Un État disparu se signale plutôt que de se faire coder de force : la saisie reste
   * libre pour qui y est né, et c'est au dépôt de trancher.
   */
  it("signale un pays qu'il ne sait pas nommer", () => {
    const brouillon: Brouillon = {
      ...BROUILLON,
      associes: [
        {
          ...BROUILLON.associes![0],
          personne: { ...BROUILLON.associes![0].personne, paysDeNaissance: "Yougoslavie" },
        },
        BROUILLON.associes![1],
      ],
    };
    const manque = contenuDeLaCreation(brouillon).manques.find((m) =>
      m.chemin.endsWith("paysNaissance")
    );
    expect(manque?.quoi).toContain("Yougoslavie");
    expect(manque?.origine).toBe("formulaire");
  });
});

describe("ce qui manque encore", () => {
  /*
   * La liste vient des refus du guichet, non de notre lecture du dictionnaire.
   *
   * Elle en annonçait quatre - le déclarant, les bénéficiaires effectifs, le rôle du
   * dirigeant, la catégorie d'activité - dont un seul était juste. Le déclarant n'est
   * pas réclamé au dépôt ; le rôle se déduit de la forme ; le bloc des bénéficiaires
   * effectifs n'a pas été demandé. Restent trois vrais trous.
   */
  it("ne retient que ce qu'aucune règle ne peut combler", () => {
    const chemins = contenuDeLaCreation(BROUILLON).manques.map((m) => m.chemin);

    expect(chemins).toContain(
      "personneMorale.etablissementPrincipal.activites.0.categorisationActivite1"
    );
    expect(chemins).toContain("personneMorale.identite.publicationLegale");
    expect(chemins.some((c) => c.endsWith("codeInseeGeographique"))).toBe(true);

    /* Ce que le guichet ne demande pas, ou que la forme suffit à dire. */
    expect(chemins).not.toContain("declarant");
    expect(chemins).not.toContain("personneMorale.composition.pouvoirs.0.roleEntreprise");
  });

  /* Le complément de dépôt les comble : c'est par lui que l'avocat les fournit. */
  it("n'en signale plus aucun une fois le complément donné", () => {
    const { manques } = contenuDeLaCreation(BROUILLON, {
      categorisationActivite: ["07", "04", "08", "02"],
      codeInseeNaissance: { 0: "95018" },
      publicationLegale: { journal: "Actu-Juridique", date: "2026-10-01", lieu: "Paris" },
    });

    expect(manques).toEqual([]);
  });

  it("range chaque manque selon d'où viendra la réponse", () => {
    for (const manque of contenuDeLaCreation(BROUILLON).manques) {
      expect(["formulaire", "configuration", "nomenclature"]).toContain(manque.origine);
    }
  });
});

describe("ce que la forme et le dossier suffisent à dire", () => {
  const pouvoir = (b: Brouillon) =>
    (contenuDeLaCreation(b).contenu.personneMorale as { composition: { pouvoirs: unknown[] } })
      .composition.pouvoirs[0] as Record<string, unknown> & {
      individu: { descriptionPersonne: Record<string, unknown> };
    };

  /* « Les formes juridiques SAS doivent posséder au moins un président de SAS (73) ». */
  it("code le rôle du dirigeant sur la forme", () => {
    expect(pouvoir(BROUILLON).roleEntreprise).toBe("73");
    expect(pouvoir({ ...BROUILLON, forme: "SARL" }).roleEntreprise).toBe("30");
  });

  /* La table `genre` est un tableau, non un dictionnaire : on transmet le rang, non la
     lettre. « F » se fait refuser là où « 2 » passe. */
  it("tire le genre de la civilité, et ne l'invente pas", () => {
    expect(pouvoir(BROUILLON).individu.descriptionPersonne.genre).toBe("1");

    const sansCivilite: Brouillon = {
      ...BROUILLON,
      associes: [
        {
          ...BROUILLON.associes![0],
          personne: { ...BROUILLON.associes![0].personne, civilite: undefined },
        },
        BROUILLON.associes![1],
      ],
    };
    expect(pouvoir(sansCivilite).individu.descriptionPersonne.genre).toBe("");
    expect(
      contenuDeLaCreation(sansCivilite).manques.some((m) => m.chemin.endsWith("genre"))
    ).toBe(true);
  });

  /* Au-delà du quart du capital, le dirigeant est aussi bénéficiaire effectif. */
  it("dit si le dirigeant est bénéficiaire effectif", () => {
    expect(pouvoir(BROUILLON).beneficiaireEffectif).toBe(true);

    const disperse: Brouillon = {
      ...BROUILLON,
      partsTotales: 2000,
      associes: [
        { type: "physique", parts: 400, personne: { civilite: "Monsieur", prenom: "A", nom: "Un" } },
        { type: "physique", parts: 1600, personne: { prenom: "B", nom: "Deux" } },
      ],
    };
    expect(pouvoir(disperse).beneficiaireEffectif).toBe(false);
  });

  /*
   * Le siège chez le dirigeant demande deux drapeaux : l'un dit le fait, l'autre que le
   * dirigeant l'autorise - « L'option de domiciliation est obligatoire, il doit être à
   * true ».
   */
  it("décrit le siège selon son mode de domiciliation", () => {
    const chez = (mode: Brouillon["modeDomiciliation"]) =>
      (
        contenuDeLaCreation({ ...BROUILLON, modeDomiciliation: mode }).contenu
          .personneMorale as { adresseEntreprise: { caracteristiques: Record<string, unknown> } }
      ).adresseEntreprise.caracteristiques;

    expect(chez("Domicile personnel du dirigeant")).toMatchObject({
      indicateurDomicileEntrepreneur: true,
      indicateurDomicileEntrepreneurValidation: true,
      domiciliataire: false,
    });
    expect(chez("Société de domiciliation")).toMatchObject({
      domiciliataire: true,
      indicateurDomicileEntrepreneur: false,
    });
    expect(chez("Société de domiciliation")).not.toHaveProperty(
      "indicateurDomicileEntrepreneurValidation"
    );
  });

  /* Le parcours pose déjà l'option fiscale et le régime de TVA : rien à demander de plus. */
  it("compose le régime fiscal des deux questions du parcours", () => {
    const fiscal = (b: Partial<Brouillon>) =>
      (contenuDeLaCreation({ ...BROUILLON, ...b }).contenu.personneMorale as {
        optionsFiscales: Record<string, unknown>;
      }).optionsFiscales;

    expect(fiscal({ optionFiscale: "IS", regimeTva: "Régime réel simplifié" })).toMatchObject({
      regimeImpositionBenefices: "114",
      regimeImpositionTVA: "311",
      dateClotureExerciceComptable: "3112",
    });
    expect(fiscal({ optionFiscale: "IS", regimeTva: "Régime réel normal" })).toMatchObject({
      regimeImpositionBenefices: "115",
      regimeImpositionTVA: "312",
    });
    expect(fiscal({ optionFiscale: "IR", regimeTva: "Franchise en base de TVA" })).toMatchObject({
      regimeImpositionBenefices: "112",
      regimeImpositionTVA: "310",
    });
    /* Une société civile à l'IR relève du revenu foncier, non des BIC. */
    expect(fiscal({ forme: "SCI", optionFiscale: "IR" })).toMatchObject({
      regimeImpositionBenefices: "120",
    });
  });

  /* « Je ne sais pas » est une réponse du formulaire, pas une valeur transmissible. */
  it("retient le réel simplifié quand le client ne sait pas", () => {
    const fiscal = (
      contenuDeLaCreation({ ...BROUILLON, optionFiscale: "IS", regimeTva: "Je ne sais pas" })
        .contenu.personneMorale as { optionsFiscales: Record<string, unknown> }
    ).optionsFiscales;

    expect(fiscal.regimeImpositionBenefices).toBe("114");
    expect(fiscal.regimeImpositionTVA).toBe("311");
  });
});

describe("l'enveloppe de la formalité", () => {
  /*
   * `typePersonne` manquait, et son absence ne rendait pas une erreur de validation :
   * le guichet tombait dans son propre code, en 500, faute de pouvoir deviner le type
   * d'événement. Les trois champs de l'enveloppe se posent donc ensemble.
   */
  it("porte les trois champs qui vivent hors du contenu", () => {
    const { corps } = formaliteDeCreation(BROUILLON, "FORMALIST-12");

    expect(corps).toMatchObject({
      typeFormalite: "C",
      typePersonne: "M",
      referenceMandataire: "FORMALIST-12",
      companyName: "ATELIER MERIDIEN",
      diffusionCommerciale: "O",
    });
    expect(corps.content).toMatchObject({ natureCreation: { formeJuridique: "5710" } });
  });

  it("rend les manques du contenu avec l'enveloppe", () => {
    expect(formaliteDeCreation(BROUILLON, "FORMALIST-12").manques.length).toBeGreaterThan(0);
    expect(
      formaliteDeCreation(BROUILLON, "FORMALIST-12", {
        categorisationActivite: ["07", "04"],
        codeInseeNaissance: { 0: "95018" },
        publicationLegale: { journal: "Actu-Juridique", date: "2026-10-01" },
      }).manques
    ).toEqual([]);
  });
});
