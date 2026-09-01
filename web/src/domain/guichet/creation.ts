import type { Brouillon } from "@/domain/formalite/parcours";
import { estForme } from "@/domain/formalite/formes";
import { apportsDe } from "@/domain/formalite/capital";
import {
  codeSituationMatrimoniale,
  FORME_JURIDIQUE,
  PAYS_FRANCE,
  ROLE_POUR_ENTREPRISE,
} from "./nomenclatures";

/**
 * Le `content` d'une formalité de création, tel que le guichet unique l'attend.
 *
 * C'est la traduction entre deux modèles qui ne se ressemblent pas. Le brouillon de
 * Formalist tient en une quarantaine de champs, écrits pour être remplis par quelqu'un
 * qui crée sa société. Le guichet en compte plusieurs centaines, imbriqués sur quatre
 * niveaux, écrits pour couvrir toutes les formes d'entreprise de France - exploitations
 * agricoles, sociétés étrangères, entrepreneurs non sédentaires.
 *
 * D'où le second retour. Une traduction incomplète est la règle, pas l'exception : ce
 * module dit ce qu'il n'a pas pu remplir, plutôt que d'inventer ou de se taire. La
 * liste se maintient d'elle-même - elle vient du code qui traduit, non d'un document
 * qui dériverait.
 *
 * Rien ici ne touche au réseau : la fonction est pure et se vérifie sans compte.
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
 * L'entreprise et ce qui la décrit.
 *
 * `montantCapital` et `montantCapitalCentime` cohabitent dans le dictionnaire : le
 * guichet accepte un capital en euros et sa partie centimes. Nos capitaux sont entiers,
 * et déclarer zéro centime est plus sûr que d'omettre le champ.
 */
function identite(brouillon: Brouillon, forme: string, manques: Manque[]): Record<string, unknown> {
  const objet = texte(brouillon.activite);
  if (!objet) {
    manques.push({
      chemin: "personneMorale.identite.entreprise.objet",
      quoi: "L'objet social",
      origine: "formulaire",
    });
  }

  const cloture = texte(brouillon.dateCloturePremierExercice);
  if (!cloture) {
    manques.push({
      chemin: "personneMorale.identite.description.dateClotureExerciceSocial",
      quoi: "La date de clôture de l'exercice",
      origine: "formulaire",
    });
  }

  return {
    entreprise: {
      pays: PAYS_FRANCE,
      denomination: texte(brouillon.denomination) ?? "",
      objet: objet ?? "",
      formeJuridique: forme,
    },
    description: {
      duree: brouillon.dureeDeVie ?? 99,
      dateClotureExerciceSocial: cloture ?? "",
      montantCapital: brouillon.capital ?? 0,
      montantCapitalCentime: 0,
      deviseCapital: "EUR",
      capitalVariable: false,
    },
  };
}

/**
 * Les dirigeants, en pouvoirs.
 *
 * Le guichet appelle « pouvoir » ce que nous appelons dirigeant, et lui demande un rôle
 * codé - président, gérant - contre une table que nous ne renseignons pas encore. Le
 * bloc est donc posé avec l'identité, et le rôle signalé comme manquant : c'est
 * exactement le genre de champ qu'il vaut mieux voir en liste qu'apprendre au refus.
 */
function pouvoirs(brouillon: Brouillon, manques: Manque[]): Record<string, unknown>[] {
  const tous = brouillon.associes ?? [];

  return (brouillon.dirigeants ?? []).map((dirigeant, rang) => {
    const personne =
      typeof dirigeant.associe === "number" ? tous[dirigeant.associe]?.personne : dirigeant.personne;

    manques.push({
      chemin: "personneMorale.composition.pouvoirs." + rang + ".roleEntreprise",
      quoi: "Le rôle du dirigeant, codé selon la table `roleEntreprise` de l'INPI",
      origine: "nomenclature",
    });

    return {
      typeDePersonne: "INDIVIDU",
      isRepresentantLegal: true,
      individu: {
        descriptionPersonne: {
          nom: texte(personne?.nom) ?? "",
          prenoms: [texte(personne?.prenom) ?? ""],
          dateDeNaissance: texte(personne?.dateDeNaissance) ?? "",
          lieuDeNaissance: texte(personne?.villeDeNaissance) ?? "",
          codePostalNaissance: texte(personne?.codePostalDeNaissance) ?? "",
          paysNaissance: PAYS_FRANCE,
          nationalite: texte(personne?.nationalite) ?? "Française",
          situationMatrimoniale: codeSituationMatrimoniale(personne?.situationMatrimoniale) ?? "",
        },
        adresseDomicile: adresseFrancaise(
          personne?.adresse,
          personne?.codePostal,
          personne?.ville
        ),
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
 * L'activité, elle, ne se déclare pas en toutes lettres. Le guichet la veut codée
 * contre sa propre catégorisation - un fichier de cent quinze kilo-octets, distinct de
 * la NAF - et nous ne collectons qu'une description libre.
 */
function etablissementPrincipal(
  brouillon: Brouillon,
  manques: Manque[]
): Record<string, unknown> {
  manques.push({
    chemin: "personneMorale.etablissementPrincipal.activites.0.categorisationActivite1",
    quoi: "La catégorie de l'activité, codée selon la catégorisation des activités de l'INPI",
    origine: "nomenclature",
  });

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
      },
    ],
  };
}

/**
 * Le contenu d'une formalité de création, et ce qui lui manque.
 *
 * La forme juridique décide de tout le reste : sans elle, il n'y a rien à traduire, et
 * rendre un contenu à moitié rempli ferait passer pour incomplet ce qui est en réalité
 * ininterprétable.
 */
export function contenuDeLaCreation(brouillon: Brouillon): ContenuDeCreation {
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

  const code = FORME_JURIDIQUE[forme];

  /*
   * Le déclarant est le cabinet, non le client.
   *
   * C'est lui qui dépose au nom de la société, et le guichet veut son identité et son
   * lien avec l'entreprise. Cette donnée-là ne se demande pas à chaque dossier : elle se
   * pose une fois, dans la configuration du mandataire.
   */
  manques.push({
    chemin: "declarant",
    quoi: "L'identité du mandataire déposant, et son lien avec l'entreprise",
    origine: "configuration",
  });

  /*
   * Les bénéficiaires effectifs se déduisent des associés qui détiennent plus du quart
   * du capital - mais le registre veut aussi les modalités de contrôle, que nous ne
   * demandons pas.
   */
  const partsTotales = brouillon.partsTotales ?? 0;
  const beneficiaires = (brouillon.associes ?? []).filter((associe) => {
    const parts = apportsDe(associe, 0).parts;
    return partsTotales > 0 && parts / partsTotales > 0.25;
  });
  if (beneficiaires.length > 0) {
    manques.push({
      chemin: "personneMorale.beneficiairesEffectifs",
      quoi:
        "Les modalités de contrôle des " +
        beneficiaires.length +
        " bénéficiaires effectifs (détention directe, indirecte, en indivision)",
      origine: "formulaire",
    });
  }

  return {
    contenu: {
      natureCreation: {
        dateCreation: texte(brouillon.dateDebutActivite) ?? "",
        societeEtrangere: false,
        formeJuridique: code,
        microEntreprise: false,
        etablieEnFrance: true,
        salarieEnFrance: false,
        relieeEntrepriseAgricole: false,
        entrepriseAgricole: false,
        eirl: false,
        indicateurEtablissementFictif: false,
      },
      personneMorale: {
        identite: identite(brouillon, code, manques),
        adresseEntreprise: {
          adresse: adresseFrancaise(brouillon.adresse, brouillon.codePostal, brouillon.ville),
        },
        composition: { pouvoirs: pouvoirs(brouillon, manques) },
        etablissementPrincipal: etablissementPrincipal(brouillon, manques),
      },
    },
    manques,
  };
}
