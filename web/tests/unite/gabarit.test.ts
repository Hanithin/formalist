import { describe, it, expect } from "vitest";
import { nombreEnFrancais, dateEnFrancais } from "@/domain/formalite/lettres";
import {
  donneesDeGabarit,
  identitePhysique,
  nomDeJeuneFille,
  personneDuDirigeant,
  sirenDe,
  dirigeantDeLAnnonce,
  situationAccordee,
  societeDesignee,
} from "@/domain/formalite/gabarit";
import { apportsDe, valeurNominale } from "@/domain/formalite/capital";
import type { Brouillon } from "@/domain/formalite/parcours";

describe("montants en toutes lettres", () => {
  it("les cas simples", () => {
    expect(nombreEnFrancais(0)).toBe("zéro");
    expect(nombreEnFrancais(1)).toBe("un");
    expect(nombreEnFrancais(1000)).toBe("mille");
  });

  it("les accords qui piègent", () => {
    // « quatre-vingts » prend son s seul, pas suivi d'une unité.
    expect(nombreEnFrancais(80)).toBe("quatre-vingts");
    expect(nombreEnFrancais(81)).toBe("quatre-vingt-un");
    expect(nombreEnFrancais(71)).toBe("soixante et onze");
    expect(nombreEnFrancais(21)).toBe("vingt et un");
    // « cents » s'accorde quand rien ne suit.
    expect(nombreEnFrancais(200)).toBe("deux cents");
    expect(nombreEnFrancais(201)).toBe("deux cent un");
  });

  it("un capital courant", () => {
    expect(nombreEnFrancais(1500)).toBe("mille cinq cents");
    expect(nombreEnFrancais(10000)).toBe("dix mille");
  });

  it("les centimes", () => {
    expect(nombreEnFrancais(1.5)).toBe("un et cinquante centimes");
    expect(nombreEnFrancais(0.01)).toBe("un");
  });

  it("un montant illisible ne rend rien plutôt qu'un mot faux", () => {
    expect(nombreEnFrancais(-5)).toBe("");
    expect(nombreEnFrancais(Number.NaN)).toBe("");
  });
});

describe("dates en français", () => {
  it("une date ISO devient lisible", () => {
    expect(dateEnFrancais("2026-08-10")).toBe("10 août 2026");
    // Le premier du mois s'écrit « 1er » : « Fait le 1 janvier » dans un acte
    // déposé au greffe se lit comme une négligence sur le reste du document.
    expect(dateEnFrancais("1990-01-01")).toBe("1er janvier 1990");
    expect(dateEnFrancais("1990-01-02")).toBe("2 janvier 1990");
  });

  it("retire la marque du pluriel de vingt et cent devant mille", () => {
    /*
     * « quatre-vingts » et « deux cents » prennent leur s quand rien ne les suit ; ils
     * la perdent dès qu'un autre nombre vient après. Le capital d'une société s'écrit
     * en lettres dans ses statuts et dans chacun de ses actes : la faute s'y lit à
     * chaque page.
     */
    expect(nombreEnFrancais(80)).toBe("quatre-vingts");
    expect(nombreEnFrancais(200)).toBe("deux cents");
    expect(nombreEnFrancais(80000)).toBe("quatre-vingt mille");
    expect(nombreEnFrancais(200000)).toBe("deux cent mille");
    expect(nombreEnFrancais(280000)).toBe("deux cent quatre-vingt mille");
    expect(nombreEnFrancais(380500)).toBe("trois cent quatre-vingt mille cinq cents");
    // Ce qui suit « mille » garde son accord : rien ne vient après.
    expect(nombreEnFrancais(1080)).toBe("mille quatre-vingts");
  });


  it("une entrée absente ou illisible passe sans casser l'acte", () => {
    expect(dateEnFrancais(null)).toBe("-");
    expect(dateEnFrancais("")).toBe("-");
    expect(dateEnFrancais("bientôt")).toBe("bientôt");
  });
});

describe("nom de jeune fille, déduit du nom de la mère", () => {
  it("le mot en capitales est retenu", () => {
    expect(nomDeJeuneFille("Marie DUPONT")).toBe("DUPONT");
    expect(nomDeJeuneFille("Anne-Marie DE LA TOUR")).toBe("TOUR");
  });

  it("sans capitales, le dernier mot est mis en capitales", () => {
    expect(nomDeJeuneFille("Marie Dupont")).toBe("DUPONT");
  });

  it("absent, il vaut un tiret et non un blanc", () => {
    expect(nomDeJeuneFille(undefined)).toBe("-");
    expect(nomDeJeuneFille("   ")).toBe("-");
  });
});

describe("valeur nominale et apports", () => {
  it("la valeur d'une part se déduit du capital et du nombre de parts", () => {
    expect(valeurNominale({ capital: 1000, partsTotales: 100 })).toBe(10);
  });

  it("sans parts émises, elle vaut zéro plutôt qu'une division impossible", () => {
    expect(valeurNominale({ capital: 1000 })).toBe(0);
    expect(valeurNominale({ capital: 1000, partsTotales: 0 })).toBe(0);
  });

  it("un apport en nature est libéré d'emblée", () => {
    const apports = apportsDe(
      { parts: 100, apportEnNature: { montant: 400 }, versement: 600 },
      10
    );
    expect(apports.souscrit).toBe(1000);
    expect(apports.numeraire).toBe(600);
    expect(apports.verse).toBe(1000);
    expect(apports.reste).toBe(0);
    expect(apports.pourcentageLibere).toBe(100);
  });

  it("une libération partielle laisse un reste à verser", () => {
    const apports = apportsDe({ parts: 100, versement: 250 }, 10);
    expect(apports.souscrit).toBe(1000);
    expect(apports.verse).toBe(250);
    expect(apports.reste).toBe(750);
    expect(apports.pourcentageLibere).toBe(25);
  });

  it("sans nombre de parts, le montant saisi fait foi", () => {
    expect(apportsDe({ apport: 500 }, 0).souscrit).toBe(500);
  });
});

describe("le dirigeant repris d'un associé", () => {
  const associes = [
    { type: "physique" as const, personne: { prenom: "Camille", nom: "Durand" } },
  ];

  it("emprunte son état civil à l'associé désigné", () => {
    expect(personneDuDirigeant({ associe: 0 }, associes).nom).toBe("Durand");
  });

  it("garde le sien quand il est une autre personne", () => {
    expect(personneDuDirigeant({ personne: { nom: "Martin" } }, associes).nom).toBe("Martin");
  });
});

describe("les champs remis aux gabarits Word", () => {
  const brouillon: Brouillon = {
    forme: "SAS",
    denomination: "ATELIER MERIDIEN",
    activite: "Conseil en design",
    adresse: "12 rue des Lilas",
    codePostal: "75011",
    ville: "Paris",
    capital: 1000,
    partsTotales: 100,
    banque: "Qonto",
    associes: [
      {
        type: "physique",
        personne: {
          civilite: "Madame",
          prenom: "Camille",
          nom: "Durand",
          dateDeNaissance: "1990-04-12",
          villeDeNaissance: "Lyon",
          nomDeLaMere: "Anne MARTIN",
          situationMatrimoniale: "Marié(e)",
          conjoint: { prenom: "Paul", nom: "Durand", regimeMatrimonial: "Séparation de biens" },
        },
        parts: 100,
        versement: 1000,
      },
    ],
    dirigeants: [{ associe: 0, remuneration: "Fixe" }],
  };

  const donnees = donneesDeGabarit(brouillon, {
    maintenant: new Date("2026-08-11T10:00:00"),
    villeRcs: "Paris",
  });

  it("la société et son capital, en chiffres et en lettres", () => {
    expect(donnees.NOM_SOCIETE).toBe("ATELIER MERIDIEN");
    expect(donnees.CAPITAL_LETTRES).toBe("mille");
    expect(donnees.VALEUR_NOMINALE).toBe("10");
  });

  it("les champs indexés portent le rang de l'associé", () => {
    expect(donnees.HAS_ASSOC_1).toBe(true);
    expect(donnees.ASSOCIE_1).toBe("Madame Camille Durand");
    expect(donnees.DATE_NAISSANCE_1).toBe("12 avril 1990");
    expect(donnees.NOM_JEUNE_FILLE_1).toBe("MARTIN");
    expect(donnees.MONTANT_SOUSCRIT_1).toBe("1 000");
    expect(donnees.PCT_DETENTION_1).toBe("100");
  });

  it("les rangs libres sont explicitement faux, pour que le gabarit s'arrête", () => {
    expect(donnees.HAS_ASSOC_2).toBe(false);
    expect(donnees.HAS_ASSOC_10).toBe(false);
  });

  it("les parts sont numérotées en continu", () => {
    expect(donnees.PARTS_DE_1).toBe("1");
    expect(donnees.PARTS_A_1).toBe("100");
  });

  it("le conjoint et son régime figurent dans l'acte", () => {
    // Les gabarits ne nomment le conjoint que du premier associé, sans indice.
    expect(donnees.CONJOINT_DE).toBe("Madame Camille Durand");
    expect(donnees.CONJOINT_NOM).toBe("Paul Durand");
    expect(donnees.REGIME_MATRIMONIAL).toBe("Séparation de biens");
  });

  it("le dirigeant reprend l'état civil de l'associé désigné", () => {
    expect(donnees.GERANT_CIVILITE_NOM_PRENOM).toBe("Madame Camille Durand");
    expect(donnees.GERANT_EST_FEMME).toBe(true);
    expect(donnees.GERANT_LIEU_NAISSANCE).toBe("Lyon");
    // La rémunération n'est pas un mot mais la phrase des statuts ; le choix brut
    // reste disponible pour restaurer le formulaire.
    expect(donnees.REMUNERATION_PRESIDENT_TYPE).toBe("Fixe");
    // Ce brouillon est une SAS : c'est l'assemblée générale qui décide.
    expect(donnees.REMUNERATION_PRESIDENT).toBe(
      "La présidence exercera ses fonctions à titre de rémunération fixe dont le montant sera fixé par décision de l’assemblée générale."
    );
  });

  it("la situation matrimoniale tombe au milieu d'une phrase, donc en minuscules", () => {
    // Et accordée : l'associée n° 1 de ce brouillon est une femme.
    expect(donnees.SITUATION_MATRIMONIALE_1).toBe("mariée");
  });

  it("un champ vide s'écrit « - » : dans un acte, un blanc se lit comme un oubli", () => {
    const vide = donneesDeGabarit({});
    expect(vide.NOM_SOCIETE).toBe("-");
    expect(vide.NATIONALITE).toBe("Française");
    expect(vide.SITUATION_MATRIMONIALE).toBe("célibataire");
  });

  it("la liste ASSOCIES double les champs indexés, pour les gabarits qui bouclent", () => {
    const liste = donnees.ASSOCIES as Record<string, unknown>[];
    expect(liste).toHaveLength(1);
    expect(liste[0].CIVILITE_NOM_PRENOM).toBe("Madame Camille Durand");
    expect(liste[0].MONTANT_VERSE).toBe("1 000");
  });

  it("les totaux se cumulent sur les associés", () => {
    expect(donnees.TOTAL_VERSE).toBe("1 000");
    expect(donnees.TOTAL_RESTE).toBe("0");
  });

  it("au-delà de dix associés, seuls les dix premiers sont écrits", () => {
    const onze = Array.from({ length: 11 }, (_, i) => ({
      type: "physique" as const,
      personne: { nom: "N" + i },
      parts: 10,
    }));
    const beaucoup = donneesDeGabarit({ ...brouillon, associes: onze, partsTotales: 110 });
    expect(beaucoup.HAS_ASSOC_10).toBe(true);
    expect((beaucoup.ASSOCIES as unknown[]).length).toBe(10);
  });
});

describe("les noms de champs sont ceux des gabarits Word", () => {
  /**
   * Ces noms ne se devinent pas : ils sont relevés dans les .docx. Une première
   * version les avait tirés du JavaScript d'origine et en avait manqué la moitié -
   * le nom de la société n'apparaissait alors dans aucun acte.
   */
  const brouillon: Brouillon = {
    forme: "SASU",
    denomination: "ATELIER MERIDIEN",
    activite: "Conseil en design.\nFormation.",
    adresse: "12 rue des Lilas",
    codePostal: "69110",
    ville: "Sainte-Foy-lès-Lyon",
    capital: 10000,
    partsTotales: 1000,
    dateCloturePremierExercice: "2027-12-31",
    dateDebutActivite: "2026-09-01",
    banque: "Qonto",
    optionFiscale: "IS",
    associes: [
      {
        type: "physique",
        personne: { civilite: "Madame", prenom: "Camille", nom: "Durand" },
        parts: 1000,
        versement: 10000,
      },
    ],
    dirigeants: [{ associe: 0, remuneration: "Variable" }],
  };

  const d = donneesDeGabarit(brouillon, {
    maintenant: new Date("2026-08-11T10:00:00"),
    villeRcs: "Lyon",
  });

  it("la société porte les noms attendus par les gabarits", () => {
    expect(d.NOM_SOCIETE).toBe("ATELIER MERIDIEN");
    expect(d.NOM_SOCIETE_COMPLET).toBe("ATELIER MERIDIEN");
    expect(d.ADRESSE_SIEGE).toBe("12 rue des Lilas, 69110 Sainte-Foy-lès-Lyon");
    expect(d.SIEGE_SOCIAL).toBe("12 rue des Lilas, 69110 Sainte-Foy-lès-Lyon");
    expect(d.VILLE_SOCIETE).toBe("Sainte-Foy-lès-Lyon");
    expect(d.FORME_JURIDIQUE).toBe("SASU");
  });

  it("le RCS est celui du tribunal de commerce, pas de la commune", () => {
    expect(d.RCS_VILLE).toBe("Lyon");
  });

  it("le capital porte ses quatre noms", () => {
    expect(d.CAPITAL).toBe("10 000");
    expect(d.CAPITAL_CHIFFRES).toBe("10 000");
    expect(d.CAPITAL_FORMATE).toBe("10 000");
    expect(d.CAPITAL_LETTRES).toBe("dix mille");
  });

  it("les parts sont nommées parts et actions selon le gabarit", () => {
    expect(d.NB_PARTS).toBe("1 000");
    expect(d.NOMBRE_ACTIONS).toBe("1 000");
    expect(d.NOMBRE_ACTIONS_LETTRES).toBe("mille");
    expect(d.VALEUR_NOMINALE_CHIFFRES).toBe("10");
    expect(d.VALEUR_NOMINALE_UNITE).toBe("euros");
  });

  it("l'objet social est découpé ligne par ligne", () => {
    expect(d.OBJET_SOCIAL_1).toBe("Conseil en design.");
    expect(d.OBJET_SOCIAL_2).toBe("Formation.");
    expect(d.OBJET_SOCIAL_3).toBe("");
  });

  it("la clôture s'écrit sans année, elle revient chaque an", () => {
    expect(d.DATE_CLOTURE).toBe("31 décembre");
    expect(d.ANNEE_PREMIER_EXERCICE).toBe("2027");
    expect(d.DATE_DEBUT_ACTIVITE).toBe("1er septembre 2026");
  });

  it("la date de signature est celle qu'on lui donne, pas celle de l'horloge", () => {
    expect(d.DATE_SIGNATURE).toBe("11 août 2026");
    expect(d.DATE_SIGNATURE_COURTE).toBe("11/08/2026");
  });

  it("la banque choisie ouvre sa section, les autres restent fermées", () => {
    expect(d.BANQUE_QONTO).toBe(true);
    expect(d.BANQUE_SHINE).toBe(false);
    expect(d.BANQUE_AUTRE).toBe(false);
    expect(d.NOM_BANQUE).toBe("Qonto");
  });

  it("une forme unipersonnelle ouvre sa section et ferme l'autre", () => {
    expect(d.IS_UNIPERSONNELLE).toBe(true);
    expect(d.IS_PLURIPERSONNELLE).toBe(false);
    expect(d.OPTION_IS).toBe(true);
  });

  it("le nom de famille s'écrit en capitales", () => {
    expect(d.NOM).toBe("DURAND");
    expect(d.PRENOM).toBe("Camille");
    expect(d.CIVILITE).toBe("Madame");
  });

  it("la rémunération est une phrase, dont le décideur suit la forme", () => {
    expect(d.REMUNERATION_PRESIDENT).toContain("rémunération variable");
    expect(d.REMUNERATION_PRESIDENT).toContain("l’actionnaire unique");
    expect(donneesDeGabarit({ ...brouillon, forme: "SARL" }).REMUNERATION_GERANT).toContain(
      "l’assemblée des associés"
    );
    expect(donneesDeGabarit({ ...brouillon, forme: "SAS" }).REMUNERATION_PRESIDENT).toContain(
      "l’assemblée générale"
    );
  });

  it("sans directeur général, les trois rangs sont explicitement fermés", () => {
    expect(d.HAS_DG).toBe(false);
    expect(d.HAS_DG_1).toBe(false);
    expect(d.HAS_DG_3).toBe(false);
  });

  it("un directeur général nommé ouvre son rang", () => {
    const avecDg = donneesDeGabarit({
      ...brouillon,
      dirigeants: [{ associe: 0 }, { personne: { civilite: "Monsieur", prenom: "Paul", nom: "Martin" } }],
    });
    expect(avecDg.HAS_DG).toBe(true);
    expect(avecDg.HAS_DG_1).toBe(true);
    expect(avecDg.DG_1_NOM).toBe("MARTIN");
    expect(avecDg.DG_1_PRENOM).toBe("Paul");
    expect(avecDg.DG_1_EST_HOMME).toBe(true);
  });

  it("le statut d'occupation du siège est celui de l'attestation", () => {
    expect(d.STATUT_OCCUPATION).toBe("propriétaire");
    expect(d.DUREE).toBe("99");
  });
});

describe("l'adresse du siège dans les actes", () => {
  it("s'écrit en entier : la voie, le code postal et la commune", () => {
    const d = donneesDeGabarit({
      adresse: "12 rue des Lilas",
      codePostal: "75011",
      ville: "Paris",
    });
    // « Le siège social est fixé : 12 rue des Lilas » sans la ville serait rejeté.
    expect(d.ADRESSE_SIEGE).toBe("12 rue des Lilas, 75011 Paris");
    expect(d.SIEGE_SOCIAL).toBe("12 rue des Lilas, 75011 Paris");
  });

  it("se contente de ce qui est saisi", () => {
    expect(donneesDeGabarit({ adresse: "12 rue des Lilas" }).ADRESSE_SIEGE).toBe(
      "12 rue des Lilas"
    );
    expect(donneesDeGabarit({}).ADRESSE_SIEGE).toBe("-");
  });
});

describe("l'identité, en une phrase", () => {
  /*
   * « marié(e) » vient d'un menu déroulant, où les deux genres tiennent dans la même
   * ligne. Dans un acte qui nomme déjà quelqu'un, la parenthèse est une faute.
   */
  it("la situation matrimoniale s'accorde à la civilité", () => {
    expect(situationAccordee({ civilite: "Madame", situationMatrimoniale: "Marié(e)" })).toBe(
      "mariée"
    );
    expect(situationAccordee({ civilite: "Monsieur", situationMatrimoniale: "Marié(e)" })).toBe(
      "marié"
    );
    expect(situationAccordee({ civilite: "Madame", situationMatrimoniale: "Pacsé(e)" })).toBe(
      "pacsée"
    );
    expect(situationAccordee({})).toBe("célibataire");
  });

  it("le lieu de naissance porte son code postal entre parenthèses", () => {
    const phrase = identitePhysique({
      civilite: "Madame",
      prenom: "Claire",
      nom: "MARCHAND",
      dateDeNaissance: "1988-04-12",
      villeDeNaissance: "Lyon",
      codePostalDeNaissance: "69003",
      situationMatrimoniale: "Célibataire",
      adresse: "9 rue Oberkampf",
    });

    expect(phrase).toBe(
      "Madame Claire MARCHAND, née le 12 avril 1988 à Lyon (69003), " +
        "de nationalité Française, célibataire, demeurant 9 rue Oberkampf"
    );
  });

  /* Une société n'a ni naissance ni situation : sa désignation dit ce qui la nomme. */
  it("une société est désignée par son immatriculation et son représentant", () => {
    expect(
      societeDesignee({
        denomination: "HOLDING MERIDIEN",
        forme: "SARL",
        capital: 50000,
        adresse: "8 quai de la Gare",
        codePostal: "75013",
        ville: "Paris",
        numeroRcs: "842019336",
        villeImmatriculation: "Paris",
        representant: { civilite: "Monsieur", prenom: "Marc", nom: "BERTIN" },
      })
    ).toBe(
      "HOLDING MERIDIEN, SARL au capital de 50 000 euros, dont le siège social est " +
        "8 quai de la Gare 75013 Paris, immatriculée au registre du commerce et des " +
        "sociétés de Paris sous le numéro 842019336, représentée par Monsieur Marc BERTIN"
    );
  });

  /* Le SIREN identifie la société ; le SIRET, un établissement. */
  it("le SIREN se prend au registre, ou aux neuf premiers chiffres du SIRET", () => {
    expect(sirenDe({ numeroRcs: "842019336", siret: "84201933600018" })).toBe("842019336");
    expect(sirenDe({ siret: "84201933600018" })).toBe("842019336");
    expect(sirenDe({})).toBe("");
  });
});

/*
 * Le menu déroulant écrit « Marié(e) » ; l'acte nomme une personne, donc l'accorde.
 * La faute était passée par trois chemins - le préfixe, le rang, la liste des
 * souscripteurs - qui composaient chacun la phrase de leur côté.
 */
it("aucune variable de gabarit ne porte de parenthèse d'accord", () => {
  const donnees = donneesDeGabarit(
    {
      forme: "SARL",
      denomination: "LE CLOS",
      associes: [
        {
          type: "physique",
          parts: 60,
          personne: {
            civilite: "Monsieur",
            prenom: "Thomas",
            nom: "RENAUD",
            situationMatrimoniale: "Marié(e)",
          },
        },
        {
          type: "physique",
          parts: 40,
          personne: {
            civilite: "Madame",
            prenom: "Camille",
            nom: "DURAND",
            situationMatrimoniale: "Marié(e)",
          },
        },
      ],
      partsTotales: 100,
      capital: 1000,
    } as Brouillon,
    { maintenant: new Date("2026-08-30T10:00:00Z") }
  );

  const fautes = Object.entries(donnees).filter(
    ([, valeur]) => typeof valeur === "string" && valeur.includes("(e)")
  );
  expect(fautes).toEqual([]);
  expect(donnees.SITUATION_MATRIMONIALE_1).toBe("marié");
  expect(donnees.SITUATION_MATRIMONIALE_2).toBe("mariée");
});

/*
 * Les statuts nomment l'associé personne morale par les mêmes variables que le reste
 * des actes ; elles écrivaient le SIRET et une rue sans commune.
 */
it("l'associé personne morale porte son SIREN et son siège entier", () => {
  const donnees = donneesDeGabarit(
    {
      forme: "SARL",
      denomination: "ATELIER DU CANAL",
      associes: [
        {
          type: "morale",
          parts: 100,
          societe: {
            denomination: "HOLDING MERIDIEN",
            forme: "SARL",
            capital: 50000,
            adresse: "8 quai de la Gare",
            codePostal: "75013",
            ville: "Paris",
            siret: "84201933600018",
            villeImmatriculation: "Paris",
          },
        },
      ],
      partsTotales: 100,
      capital: 20000,
    } as Brouillon,
    { maintenant: new Date("2026-08-30T10:00:00Z") }
  );

  expect(donnees.ASSOC_1_SOCIETE_SIREN).toBe("842019336");
  expect(donnees.ASSOC_1_SOCIETE_ADRESSE).toBe("8 quai de la Gare 75013 Paris");
});

describe("le dirigeant de l'annonce légale", () => {
  /*
   * Le texte de l'avis lisait le dirigeant dans des clés d'un ancien formulaire :
   * chaque avis de constitution sortait avec « Président : [NOM DU DIRIGEANT],
   * demeurant [ADRESSE DU DIRIGEANT] », prêt à partir tel quel au journal.
   */
  it("nomme la personne physique et son domicile", () => {
    expect(
      dirigeantDeLAnnonce({
        forme: "SASU",
        associes: [
          {
            type: "physique",
            parts: 100,
            personne: {
              civilite: "Monsieur",
              prenom: "Julien",
              nom: "MOREAU",
              adresse: "12 rue de la Paix, 75002 Paris",
            },
          },
        ],
        dirigeants: [{ associe: 0 }],
      } as Brouillon)
    ).toEqual({
      nom: "Monsieur Julien MOREAU",
      adresse: "12 rue de la Paix, 75002 Paris",
    });
  });

  /* Une société qui préside se désigne par son immatriculation, non par une naissance. */
  it("désigne la société qui dirige, et son siège", () => {
    expect(
      dirigeantDeLAnnonce({
        forme: "SASU",
        associes: [
          {
            type: "morale",
            parts: 100,
            societe: {
              denomination: "HOLDING MERIDIEN",
              forme: "SARL",
              capital: 50000,
              adresse: "8 quai de la Gare",
              codePostal: "75013",
              ville: "Paris",
              numeroRcs: "842019336",
              villeImmatriculation: "Paris",
              representant: { civilite: "Monsieur", prenom: "Marc", nom: "BERTIN" },
            },
          },
        ],
        dirigeants: [{ associe: 0 }],
      } as Brouillon).adresse
    ).toBe("8 quai de la Gare 75013 Paris");
  });

  it("ne rend rien plutôt qu'un crochet, quand le dirigeant manque", () => {
    expect(dirigeantDeLAnnonce({} as Brouillon)).toEqual({ nom: "", adresse: "" });
  });
});
