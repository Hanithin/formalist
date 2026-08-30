/**
 * Ce qu'on lit à droite du formulaire, pendant qu'on le remplit.
 *
 * Le parcours de création a sa colonne : elle répond, à la cinquième étape, à la
 * question qu'on se pose alors - qu'est-ce que j'ai déjà répondu ? Le dépôt des comptes
 * pose la même question sur sept étapes, et une de plus que la création ne pose pas :
 * jusqu'à quand ai-je pour déposer.
 *
 * Ce module ne rédige rien qui existe ailleurs. Les échéances viennent de `regles`, le
 * montant de `offre`, le SIREN et les dates de leurs formateurs. Il ne fait que choisir
 * ce qui tient dans trois cent vingt pixels.
 *
 * `recapitulatifDesComptes`, à côté, sert l'onglet « Le dossier » de l'avocat : huit
 * sections et trente lignes, la relecture complète d'un dossier. Ce n'est pas la même
 * lecture, et ce n'est pas le même écran.
 */

import { dateEnFrancais } from "@/domain/formalite/lettres";
import { sirenLisible } from "@/domain/modification/annonce";
import { montantLisible } from "@/domain/modification/offre";
import { devisDesComptes } from "./offre";
import { dateLimiteApprobation, dateLimiteDepot } from "./regles";
import type { SocieteApprouvante } from "./gabarit";
import type { Affectation } from "./regles";
import type { Convention } from "./conventions";

/** Une ligne de la colonne. `valeur` nulle : le champ n'a pas encore de réponse. */
export interface LigneDeColonne {
  cle: string;
  libelle: string;
  valeur: string | null;
}

export interface ColonneDesComptes {
  forme: string | null;
  denomination: string | null;
  /** « Exercice clos le 31 décembre 2025 », tant qu'on sait lequel. */
  exercice: string | null;
  lignes: LigneDeColonne[];
  /** La date limite de dépôt au greffe, et son montant. */
  echeance: string | null;
  total: string;
}

/**
 * Le dossier tel que la colonne le lit.
 *
 * Écrit en structure et non en `Comptes` : celui-ci vit dans l'infrastructure, que le
 * domaine ne cite pas. Un `Comptes` s'y range tel quel.
 */
export interface DonneesDeLaColonne {
  societe?: SocieteApprouvante;
  valeurs?: Record<string, string | number | undefined>;
  affectation?: Affectation;
  conventions?: Convention[];
  demandeLaConfidentialite?: boolean;
}

function texte(valeur: unknown): string {
  if (typeof valeur === "number") return String(valeur);
  return typeof valeur === "string" ? valeur.trim() : "";
}

/** Une date saisie, ou rien : `dateEnFrancais` rend « - » sur le vide, pas la colonne. */
function date(valeur: unknown): string | null {
  const lu = texte(valeur);
  if (!lu) return null;
  const ecrite = dateEnFrancais(lu);
  return ecrite === "-" ? null : ecrite;
}

/**
 * « 12 500 € », et « 12 500,50 € » quand il y a des centimes.
 *
 * Les deux décimales de `montantLisible` conviennent à un prix, où le centime se
 * discute. Un résultat d'exercice s'annonce en euros ronds neuf fois sur dix, et
 * « 12 500,00 € » fait lire un chiffre de plus pour rien.
 */
function euros(centimes: number): string {
  return (centimes / 100)
    .toLocaleString("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: centimes % 100 === 0 ? 0 : 2,
    })
    /* Les espaces insécables du groupement, ramenées à l'espace ordinaire du reste. */
    .replace(/[\u00a0\u202f]/g, " ");
}

function centimes(valeur: unknown): number | null {
  const lu = texte(valeur);
  if (!lu) return null;
  const nombre = Number(lu.replace(",", "."));
  return Number.isFinite(nombre) ? Math.round(nombre * 100) : null;
}

/**
 * L'exercice, sur deux lignes.
 *
 * « du 1er janvier 2025 au 31 décembre 2025 » tient sur trois lignes dans la colonne et
 * se lit mal : la coupure est posée où l'œil l'attend, entre les deux bornes.
 */
function periode(ouverture: string | null, cloture: string | null): string | null {
  if (ouverture && cloture) return "du " + ouverture + "\nau " + cloture;
  if (cloture) return "clos le " + cloture;
  if (ouverture) return "ouvert le " + ouverture;
  return null;
}

/**
 * La date limite de dépôt au greffe.
 *
 * Elle se compte depuis l'assemblée, un mois après elle. Tant que l'assemblée n'est pas
 * fixée, on la compte depuis la date limite d'approbation - six mois après la clôture :
 * c'est la borne extérieure, celle qu'on ne peut de toute façon pas dépasser.
 */
function limiteDeDepot(
  forme: string | null | undefined,
  cloture: string,
  assemblee: string
): string | null {
  const appui = assemblee || dateLimiteApprobation(forme, cloture || null);
  return date(dateLimiteDepot(appui));
}

export function colonneDesComptes(donnees: DonneesDeLaColonne): ColonneDesComptes {
  const societe = donnees.societe ?? {};
  const valeurs = donnees.valeurs ?? {};
  const affectation = donnees.affectation;
  const conventions = donnees.conventions ?? [];

  const cloture = texte(valeurs.dateCloture);
  const assemblee = texte(valeurs.dateAssemblee);
  const resultat = centimes(valeurs.resultat);

  const lignes: LigneDeColonne[] = [
    {
      cle: "siren",
      libelle: "SIREN",
      valeur: texte(societe.siren) ? sirenLisible(societe.siren) : null,
    },
    {
      cle: "exercice",
      libelle: "Exercice",
      valeur: periode(date(valeurs.dateOuverture), date(cloture)),
    },
    { cle: "assemblee", libelle: "Assemblée", valeur: date(assemblee) },
    {
      cle: "resultat",
      libelle: "Résultat",
      valeur:
        resultat === null
          ? null
          : resultat === 0
            ? "à l'équilibre"
            : resultat > 0
              ? euros(resultat) + " de bénéfice"
              : euros(-resultat) + " de perte",
    },
  ];

  /*
   * L'affectation ne se lit qu'une fois le résultat connu.
   *
   * Un dividende de zéro, sur un dossier où rien n'est encore saisi, dirait « aucun » -
   * une réponse, là où il n'y a que du vide. Tant que le résultat manque, la ligne
   * reste à renseigner.
   */
  lignes.push({
    cle: "dividendes",
    libelle: "Dividendes",
    valeur:
      resultat === null || !affectation
        ? null
        : affectation.dividendesCentimes > 0
          ? euros(affectation.dividendesCentimes)
          : "aucun",
  });

  lignes.push({
    cle: "conventions",
    libelle: "Conventions",
    valeur:
      conventions.length === 0
        ? "aucune"
        : conventions.length === 1
          ? "1 convention"
          : conventions.length + " conventions",
  });

  lignes.push({
    cle: "confidentialite",
    libelle: "Confidentialité",
    valeur: donnees.demandeLaConfidentialite ? "demandée" : "non demandée",
  });

  const devis = devisDesComptes({
    forme: societe.forme,
    confidentialite: donnees.demandeLaConfidentialite,
  });

  return {
    forme: texte(societe.forme) || null,
    denomination: texte(societe.denomination) || null,
    exercice: date(cloture) ? "Exercice clos le " + date(cloture) : null,
    lignes,
    echeance: limiteDeDepot(societe.forme, cloture, assemblee),
    total: montantLisible(devis.totalTTC),
  };
}
