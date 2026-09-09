import type { Brouillon } from "@/domain/formalite/parcours";
import { estForme, regle, type Forme } from "@/domain/formalite/formes";
import { apportsDe } from "@/domain/formalite/capital";
import { nomAuGuichet } from "@/domain/formalite/pays";
import {
  codeSituationMatrimoniale,
  DIFFUSION_COMMERCIALE,
  formeSocialeDuRegime,
  FORME_JURIDIQUE,
  genreDeLaCivilite,
  PAYS_FRANCE,
  regimeImpositionBenefices,
  regimeImpositionTva,
  ROLE_ENTREPRISE,
  ROLE_POUR_ENTREPRISE,
  TYPE_DESTINATAIRE_ENTREPRISE,
  TYPE_FORMALITE,
  TYPE_ORIGINE_CREATION,
  TYPE_PERSONNE_MORALE,
} from "./nomenclatures";

/**
 * La formalité de création, telle que le guichet unique l'attend.
 *
 * C'est la traduction entre deux modèles qui ne se ressemblent pas. Le brouillon de
 * Formalist tient en une quarantaine de champs, écrits pour être remplis par quelqu'un
 * qui crée sa société. Le guichet en compte plusieurs centaines, imbriqués sur quatre
 * niveaux, écrits pour couvrir toutes les formes d'entreprise de France - exploitations
 * agricoles, sociétés étrangères, entrepreneurs non sédentaires.
 *
 * Ce module a été refait le 8 septembre 2026 contre le service réel : le guichet exige
 * seize champs là où nous en annoncions quatre, et un seul des quatre était juste. Ce
 * qui suit ne vient donc pas de la lecture du dictionnaire mais de ses refus, dépôt
 * après dépôt, sur `guichet-unique-demo.inpi.fr` - `npm run guichet:depot` les rejoue.
 *
 * D'où le second retour. Une traduction incomplète reste la règle : ce module dit ce
 * qu'il n'a pas pu remplir, plutôt que d'inventer ou de se taire. La liste se maintient
 * d'elle-même - elle vient du code qui traduit, non d'un document qui dériverait.
 *
 * Rien ici ne touche au réseau : les fonctions sont pures et se vérifient sans compte.
 */

/** Ce que le guichet attend et que nous n'avons pas. */
export interface Manque {
  /** Où il se place dans le contenu, tel que le guichet le nommerait. */
  chemin: string;
  /** Ce qui manque, dit à qui devra le fournir. */
  quoi: string;
  /**
   * D'où viendra la réponse.
   *
   * `formulaire` : une question à poser au client, qui n'existe pas encore.
   * `configuration` : une donnée du cabinet, à poser une fois pour toutes.
   * `nomenclature` : une valeur à coder contre une table de l'INPI.
   */
  origine: "formulaire" | "configuration" | "nomenclature";
}

export interface ContenuDeCreation {
  contenu: Record<string, unknown>;
  manques: Manque[];
}

/** Ce que le dossier ne porte pas et qu'il faut lui donner au moment de déposer. */
export interface ComplementDeDepot {
  /**
   * La catégorisation de l'activité, sur quatre niveaux au plus.
   *
   * Elle ne se devine pas d'une description libre : le guichet la code contre son propre
   * arbre, lisible par `GET /api/data_dictionary/category_activities`, et en exige les
   * deux premiers niveaux au moins. C'est un choix, pas une conversion.
   */
  categorisationActivite?: string[];
  /** Le code INSEE de la commune de naissance, par rang d'associé. */
  codeInseeNaissance?: Record<number, string>;
  /** L'annonce légale de constitution, une fois parue. */
  publicationLegale?: { journal?: string; date?: string; lieu?: string };
}

function texte(valeur: unknown): string | null {
  return typeof valeur === "string" && valeur.trim() ? valeur.trim() : null;
}

/**
 * Une adresse française, découpée comme le guichet la veut.
 *
 * Nous gardons une ligne - « 12 rue Vauban » - là où le guichet distingue le numéro, le
 * type de voie et son nom. Le numéro se lit sans risque ; le type de voie se code
 * contre une table de deux cent trente entrées, et une abréviation devinée vaudrait
 * moins qu'un champ vide. On ne découpe donc que ce qui est certain, et la ligne
 * entière part dans `voie` quand le reste ne l'est pas.
 *
 * `codePostal` et `commune` sont les seuls champs que le contrat rend obligatoires pour
 * une adresse française.
 */
export function adresseFrancaise(
  ligne: string | null | undefined,
  codePostal: string | null | undefined,
  commune: string | null | undefined
): Record<string, unknown> {
  const brut = (ligne ?? "").trim();
  const numero = /^(\d+)\s+(.*)$/.exec(brut);

  return {
    codePays: PAYS_FRANCE,
    codePostal: (codePostal ?? "").trim(),
    commune: (commune ?? "").trim(),
    ...(numero ? { numVoie: numero[1], voie: numero[2] } : brut ? { voie: brut } : {}),
  };
}

/**
 * Le jour et le mois d'une clôture, en DDMM.
 *
 * Le guichet distingue deux dates que nous n'avions qu'une fois : `datePremiereCloture`
 * est la première clôture, en entier, et `dateClotureExerciceSocial` le rendez-vous
 * annuel qui suivra - le 31 décembre s'y écrit « 3112 ». Nous envoyions la date ISO
 * dans le second, et le guichet répondait « La date doit être au format DDMM ».
 */
export function jourEtMois(dateIso: string | null | undefined): string | null {
  const trouve = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateIso ?? "").trim());
  return trouve ? trouve[3] + trouve[2] : null;
}

/**
 * L'entreprise et ce qui la décrit.
 *
 * L'objet social se déclare dans `description`, non dans `entreprise` où nous le
 * posions à côté de la dénomination : le guichet le veut avec la durée et le capital -
 * « Ce champ est obligatoire pour une personne morale ».
 *
 * `montantCapital` et `montantCapitalCentime` cohabitent dans le dictionnaire : le
 * guichet accepte un capital en euros et sa partie centimes. Nos capitaux sont entiers,
 * et déclarer zéro centime est plus sûr que d'omettre le champ.
 */
function identite(
  brouillon: Brouillon,
  forme: string,
  complement: ComplementDeDepot,
  manques: Manque[]
): Record<string, unknown> {
  const objet = texte(brouillon.activite);
  if (!objet) {
    manques.push({
      chemin: "personneMorale.identite.description.objet",
      quoi: "L'objet social",
      origine: "formulaire",
    });
  }

  const cloture = texte(brouillon.dateCloturePremierExercice);
  if (!cloture) {
    manques.push({
      chemin: "personneMorale.identite.description.datePremiereCloture",
      quoi: "La date de clôture du premier exercice",
      origine: "formulaire",
    });
  }

  /*
   * L'annonce légale, que le dossier ne porte pas encore.
   *
   * Le guichet l'exige de toute création de société non étrangère. Elle n'est connue
   * qu'une fois parue - journal, date, lieu - et c'est l'avocat qui la reçoit : elle
   * arrive donc par le complément de dépôt, non par le brouillon du client.
   */
  const parution = complement.publicationLegale;
  if (!parution?.journal || !parution.date) {
    manques.push({
      chemin: "personneMorale.identite.publicationLegale",
      quoi: "L'annonce légale de constitution : le journal et la date de parution",
      origine: "formulaire",
    });
  }

  return {
    entreprise: {
      pays: PAYS_FRANCE,
      denomination: texte(brouillon.denomination) ?? "",
      formeJuridique: forme,
    },
    description: {
      objet: objet ?? "",
      duree: brouillon.dureeDeVie ?? 99,
      dateClotureExerciceSocial: jourEtMois(cloture) ?? "",
      datePremiereCloture: cloture ?? "",
      montantCapital: brouillon.capital ?? 0,
      montantCapitalCentime: 0,
      deviseCapital: "EUR",
      capitalVariable: false,
      /*
       * L'aide aux créateurs et repreneurs d'entreprise ne se demande pas au hasard.
       *
       * Le champ est obligatoire et le parcours ne pose pas la question. La déclarer
       * demandée serait pire que de la déclarer absente : l'ACRE s'apprécie sur la
       * situation du dirigeant - demandeur d'emploi, jeune, bénéficiaire de minima - et
       * une demande infondée se solde par un rejet de l'URSSAF, pas par un avantage. La
       * question a sa place dans le parcours ; en attendant, on ne la demande pas.
       */
      depotDemandeAcre: false,
    },
    publicationLegale: {
      journalPublicationAutre: parution?.journal ?? "",
      datePublication: parution?.date ?? "",
      lieuPublication: parution?.lieu ?? texte(brouillon.ville) ?? "",
    },
    /* Le greffe écrit à la société, à son siège : c'est le cas 1. */
    destinataireCorrespondance: {
      typeDestinataireCorrespondance: TYPE_DESTINATAIRE_ENTREPRISE,
    },
  };
}

/**
 * Les dirigeants, en pouvoirs.
 *
 * Le guichet appelle « pouvoir » ce que nous appelons dirigeant. Il ne se contente pas
 * de l'état civil : il veut le rôle codé, le genre, la forme sociale et le fait de
 * savoir si la personne est aussi bénéficiaire effectif. Tout cela, le dossier le sait
 * déjà - le titre vient de la forme, le genre de la civilité, la forme sociale du
 * régime social, la qualité de bénéficiaire du nombre de parts. Rien à demander de
 * plus, à une exception près : la commune de naissance en code INSEE.
 */
function pouvoirs(
  brouillon: Brouillon,
  forme: Forme,
  complement: ComplementDeDepot,
  manques: Manque[]
): Record<string, unknown>[] {
  const tous = brouillon.associes ?? [];
  const partsTotales = brouillon.partsTotales ?? 0;

  return (brouillon.dirigeants ?? []).map((dirigeant, rang) => {
    const rangAssocie = typeof dirigeant.associe === "number" ? dirigeant.associe : null;
    const associe = rangAssocie === null ? null : tous[rangAssocie];
    const personne = associe ? associe.personne : dirigeant.personne;
    const chemin = "personneMorale.composition.pouvoirs." + rang;

    /*
     * Le genre ne se déduit pas d'un prénom.
     *
     * Le guichet n'admet que « M » et « F » et refuse le dépôt sans. La civilité le dit
     * quand elle est saisie ; quand elle ne l'est pas, il n'y a rien à en tirer, et
     * poser le masculin par défaut l'affirmerait sur une femme.
     */
    const genre = genreDeLaCivilite(personne?.civilite);
    if (!genre) {
      manques.push({
        chemin: chemin + ".individu.descriptionPersonne.genre",
        quoi: "La civilité du dirigeant, dont le guichet tire le genre",
        origine: "formulaire",
      });
    }

    /*
     * Un pays de naissance qu'on ne sait pas nommer se signale.
     *
     * Le dépôt écrivait « FRA » quoi qu'on ait saisi : une personne née à Alger y était
     * déclarée née en France, et le registre n'avait aucun moyen de s'en apercevoir. Le
     * guichet veut d'ailleurs le nom en clair et en capitales, non le code ISO. La table
     * couvre les États actuels ; ce qu'elle ne connaît pas - un État disparu, une
     * graphie inhabituelle - reste à trancher plutôt qu'à deviner.
     */
    const paysSaisi = personne?.paysDeNaissance?.trim();
    const paysNaissance = paysSaisi ? nomAuGuichet(paysSaisi) : "FRANCE";
    if (paysSaisi && !paysNaissance) {
      manques.push({
        chemin: chemin + ".individu.descriptionPersonne.paysNaissance",
        quoi: "Le pays de naissance « " + paysSaisi + " » n'est pas connu du guichet",
        origine: "formulaire",
      });
    }

    /*
     * La commune de naissance, en code INSEE.
     *
     * Nous saisissons « Argenteuil » ; le guichet veut « 95018 ». La correspondance ne
     * s'invente pas - plusieurs communes portent le même nom - et le parcours ne la
     * demande pas. C'est le seul état civil qui manque encore.
     */
    const insee = complement.codeInseeNaissance?.[rangAssocie ?? rang];
    if (!insee) {
      manques.push({
        chemin: chemin + ".individu.descriptionPersonne.codeInseeGeographique",
        quoi:
          "Le code INSEE de la commune de naissance" +
          (personne?.villeDeNaissance ? " (« " + personne.villeDeNaissance + " »)" : ""),
        origine: "formulaire",
      });
    }

    /* Détient-il plus du quart du capital ? Le registre des bénéficiaires en dépend. */
    const parts = associe ? apportsDe(associe, 0).parts : 0;
    const beneficiaire = partsTotales > 0 && parts / partsTotales > 0.25;

    return {
      typeDePersonne: "INDIVIDU",
      isRepresentantLegal: true,
      roleEntreprise: ROLE_ENTREPRISE[forme],
      beneficiaireEffectif: beneficiaire,
      individu: {
        descriptionPersonne: {
          nom: texte(personne?.nom) ?? "",
          prenoms: [texte(personne?.prenom) ?? ""],
          genre: genre ?? "",
          dateDeNaissance: texte(personne?.dateDeNaissance) ?? "",
          lieuDeNaissance: texte(personne?.villeDeNaissance) ?? "",
          codePostalNaissance: texte(personne?.codePostalDeNaissance) ?? "",
          codeInseeGeographique: insee ?? "",
          paysNaissance: paysNaissance ?? "",
          nationalite: texte(personne?.nationalite) ?? "Française",
          situationMatrimoniale: codeSituationMatrimoniale(personne?.situationMatrimoniale) ?? "",
          formeSociale: formeSocialeDuRegime(dirigeant.regimeSocial),
        },
        adresseDomicile: adresseFrancaise(personne?.adresse, personne?.codePostal, personne?.ville),
      },
    };
  });
}

/**
 * L'établissement, et l'activité qu'il exerce.
 *
 * Le siège d'une société qui exerce vaut 2 - siège et établissement principal. Le
 * contrat ne laisse le choix qu'entre trois cas, et c'est celui de toutes les sociétés
 * que Formalist crée aujourd'hui : nous ne savons pas déclarer un siège sans activité,
 * ni un établissement secondaire.
 *
 * L'activité ne se déclare pas en toutes lettres : le guichet la code contre son propre
 * arbre, et en exige les deux premiers niveaux. C'est le seul champ qui demande un choix
 * plutôt qu'une conversion - la description libre ne s'y ramène pas.
 */
function etablissementPrincipal(
  brouillon: Brouillon,
  complement: ComplementDeDepot,
  manques: Manque[]
): Record<string, unknown> {
  const categories = complement.categorisationActivite ?? [];
  if (categories.length < 2) {
    manques.push({
      chemin: "personneMorale.etablissementPrincipal.activites.0.categorisationActivite1",
      quoi:
        "La catégorie de l'activité, sur deux niveaux au moins, choisie dans l'arbre de l'INPI",
      origine: "nomenclature",
    });
  }

  const [un, deux, trois, quatre] = categories;

  return {
    descriptionEtablissement: {
      rolePourEntreprise: ROLE_POUR_ENTREPRISE.siegeEtPrincipal,
      pays: PAYS_FRANCE,
      indicateurEtablissementPrincipal: true,
    },
    adresse: adresseFrancaise(brouillon.adresse, brouillon.codePostal, brouillon.ville),
    activites: [
      {
        indicateurPrincipal: true,
        dateDebut: texte(brouillon.dateDebutActivite) ?? "",
        descriptionDetaillee: texte(brouillon.activite) ?? "",
        exerciceActivite: "P",
        formeExercice: "01",
        /* L'activité naît avec la société : ni achat, ni apport, ni reprise. */
        origine: TYPE_ORIGINE_CREATION,
        ...(un ? { categorisationActivite1: un } : {}),
        ...(deux ? { categorisationActivite2: deux } : {}),
        ...(trois ? { categorisationActivite3: trois } : {}),
        ...(quatre ? { categorisationActivite4: quatre } : {}),
      },
    ],
  };
}

/**
 * Les caractéristiques de l'adresse du siège.
 *
 * Le guichet veut savoir ce qu'est le local avant de savoir où il est. Trois cas, que
 * le parcours distingue déjà : le domicile du dirigeant, une société de domiciliation,
 * ou des locaux à soi. Le premier demande deux drapeaux et non un - « L'option de
 * domiciliation de l'entreprise est obligatoire, il doit être à true » : l'indicateur
 * dit le fait, la validation dit que le dirigeant l'autorise.
 */
function caracteristiquesDuSiege(brouillon: Brouillon): Record<string, unknown> {
  const chezLeDirigeant = brouillon.modeDomiciliation === "Domicile personnel du dirigeant";
  const chezUnDomiciliataire = brouillon.modeDomiciliation === "Société de domiciliation";

  /*
   * Le domiciliataire se nomme, il ne se signale pas.
   *
   * Le drapeau partait seul : le guichet savait que la société était domiciliée, non
   * chez qui. Or le domicilié « déclare le contrat de domiciliation au registre du
   * commerce et des sociétés, avec l'indication du nom ou de la dénomination sociale
   * et des références de l'immatriculation principale » du domiciliataire - articles
   * L.123-10 et R.123-166-1 du code de commerce. Ces deux informations sont saisies
   * depuis toujours ; elles n'allaient nulle part.
   *
   * Le cabinet, lui, n'est pas un domiciliataire : il n'a pas d'agrément préfectoral et
   * ne conclut pas de contrat de domiciliation. Il met ses locaux à disposition, comme
   * le ferait un propriétaire - le drapeau reste faux, et c'est l'attestation qui vaut
   * titre de jouissance.
   */
  return {
    ambulant: false,
    domiciliataire: chezUnDomiciliataire,
    indicateurDomicileEntrepreneur: chezLeDirigeant,
    ...(chezLeDirigeant ? { indicateurDomicileEntrepreneurValidation: true } : {}),
  };
}

/**
 * Le domiciliataire, nommé au guichet.
 *
 * Le drapeau `domiciliataire` partait seul, et le guichet refusait : « Ce champ est
 * obligatoire car le siège est indiqué comme étant domiciliataire ». Tout dépôt de
 * société hébergée échouait donc, et le message ne se lisait qu'au refus.
 *
 * Le nom du champ vient du guichet lui-même - il l'a écrit dans sa violation - et non
 * d'une lecture du contrat : le dictionnaire de données ne le publie pas.
 *
 * Le cabinet n'en est pas un : il n'a ni agrément préfectoral ni contrat de
 * domiciliation. Il met ses locaux à disposition, et rien ne part ici.
 */
function entrepriseDomiciliataire(
  brouillon: Brouillon,
  manques: Manque[]
): Record<string, unknown> | null {
  if (brouillon.modeDomiciliation !== "Société de domiciliation") return null;

  const domiciliataire = brouillon.domiciliataire ?? {};
  const siren = (domiciliataire.siren ?? "").replace(/\D/g, "");
  const denomination = texte(domiciliataire.denomination);

  if (siren.length !== 9) {
    manques.push({
      chemin: "personneMorale.adresseEntreprise.entrepriseDomiciliataire.siren",
      quoi: "Le SIREN de la société de domiciliation, neuf chiffres",
      origine: "formulaire",
    });
  }
  if (!denomination) {
    manques.push({
      chemin: "personneMorale.adresseEntreprise.entrepriseDomiciliataire.denomination",
      quoi: "La dénomination de la société de domiciliation",
      origine: "formulaire",
    });
  }

  return {
    ...(siren.length === 9 ? { siren } : {}),
    ...(denomination ? { denomination } : {}),
  };
}

/**
 * Le régime fiscal, que le parcours pose déjà en deux questions.
 *
 * L'option - IS ou IR - et le régime de TVA suffisent à composer le bloc : le guichet
 * demande des codes là où nous posons des mots, et la traduction vit dans les
 * nomenclatures. La date de clôture comptable y reparaît, au format DDMM comme
 * ailleurs : c'est le même jour, déclaré une seconde fois.
 */
function optionsFiscales(brouillon: Brouillon, forme: Forme): Record<string, unknown> {
  return {
    regimeImpositionBenefices: regimeImpositionBenefices(
      brouillon.optionFiscale,
      brouillon.regimeTva,
      forme
    ),
    regimeImpositionTVA: regimeImpositionTva(brouillon.regimeTva),
    dateClotureExerciceComptable: jourEtMois(brouillon.dateCloturePremierExercice) ?? "",
  };
}

/**
 * Le contenu d'une formalité de création, et ce qui lui manque.
 *
 * La forme juridique décide de tout le reste : sans elle, il n'y a rien à traduire, et
 * rendre un contenu à moitié rempli ferait passer pour incomplet ce qui est en réalité
 * ininterprétable.
 */
export function contenuDeLaCreation(
  brouillon: Brouillon,
  complement: ComplementDeDepot = {}
): ContenuDeCreation {
  const manques: Manque[] = [];
  const forme = brouillon.forme ?? "";

  if (!estForme(forme)) {
    return {
      contenu: {},
      manques: [
        {
          chemin: "natureCreation.formeJuridique",
          quoi: "La forme juridique, sans laquelle rien ne se traduit",
          origine: "formulaire",
        },
      ],
    };
  }

  const code = regle(forme)!.code;
  const juridique = FORME_JURIDIQUE[code];
  const domiciliataire = entrepriseDomiciliataire(brouillon, manques);

  return {
    contenu: {
      natureCreation: {
        dateCreation: texte(brouillon.dateDebutActivite) ?? "",
        societeEtrangere: false,
        formeJuridique: juridique,
        microEntreprise: false,
        etablieEnFrance: true,
        salarieEnFrance: false,
        relieeEntrepriseAgricole: false,
        entrepriseAgricole: false,
        eirl: false,
        indicateurEtablissementFictif: false,
      },
      personneMorale: {
        identite: identite(brouillon, juridique, complement, manques),
        adresseEntreprise: {
          caracteristiques: caracteristiquesDuSiege(brouillon),
          adresse: adresseFrancaise(brouillon.adresse, brouillon.codePostal, brouillon.ville),
          ...(domiciliataire ? { entrepriseDomiciliataire: domiciliataire } : {}),
        },
        composition: { pouvoirs: pouvoirs(brouillon, code, complement, manques) },
        etablissementPrincipal: etablissementPrincipal(brouillon, complement, manques),
        optionsFiscales: optionsFiscales(brouillon, code),
      },
    },
    manques,
  };
}

/**
 * La formalité entière, enveloppe comprise.
 *
 * Trois champs vivent hors du contenu, et leur absence ne se voit pas venir :
 * `typePersonne` surtout, sans lequel le guichet ne rend pas une erreur de validation
 * mais une 500 dans son propre code - il cherche à deviner le type d'événement et ne
 * trouve rien. `diffusionCommerciale` se dit « O » ou « N », jamais par un booléen.
 *
 * `referenceMandataire` est notre numéro de dossier : c'est par lui qu'on retrouvera le
 * dépôt, et l'infrastructure le compose.
 */
export function formaliteDeCreation(
  brouillon: Brouillon,
  reference: string,
  complement: ComplementDeDepot = {}
): { corps: Record<string, unknown>; manques: Manque[] } {
  const { contenu, manques } = contenuDeLaCreation(brouillon, complement);

  return {
    corps: {
      typeFormalite: TYPE_FORMALITE.creation,
      typePersonne: TYPE_PERSONNE_MORALE,
      referenceMandataire: reference,
      companyName: texte(brouillon.denomination) ?? "",
      nomDossier: texte(brouillon.denomination) ?? "",
      /* Le client ne s'oppose pas à la diffusion de ses données par l'INSEE. */
      diffusionCommerciale: DIFFUSION_COMMERCIALE.oui,
      content: contenu,
    },
    manques,
  };
}
