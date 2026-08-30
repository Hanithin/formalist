/**
 * Ce qu'on lit à droite du formulaire d'une fermeture.
 *
 * Écrite sur le modèle de `comptes/colonne`, avec la particularité de ce parcours : il
 * se déroule en deux temps séparés par des mois - la dissolution, puis la clôture de la
 * liquidation - et le dossier reste ouvert entre les deux. La colonne dit donc d'abord
 * lequel des deux est en cours ; sans quoi l'on rouvre son dossier six mois plus tard
 * sans savoir où l'on en était.
 *
 * Comme au dépôt des comptes, le pied porte l'échéance : le délai d'opposition des
 * créanciers tant qu'il court, le terme du mandat du liquidateur sinon.
 */

import { dateEnFrancais } from "@/domain/formalite/lettres";
import { sirenLisible } from "@/domain/modification/annonce";
import { montantLisible } from "@/domain/modification/offre";
import { devisDeFermeture } from "./offre";
import { delaiDOpposition, termeDuMandat } from "./delais";
import { estUnipersonnelle } from "./voie";
import type { SocieteFermee } from "./gabarit";

/** Une ligne de la colonne. `valeur` nulle : le champ n'a pas encore de réponse. */
export interface LigneDeColonne {
  cle: string;
  libelle: string;
  valeur: string | null;
}

export interface ColonneDeFermeture {
  forme: string | null;
  denomination: string | null;
  /** « Dissolution · liquidation amiable », pour savoir où l'on en est. */
  phase: string;
  lignes: LigneDeColonne[];
  /** L'échéance en cours, et ce qu'elle est. */
  echeance: { libelle: string; valeur: string } | null;
  total: string;
}

/**
 * Le dossier tel que la colonne le lit.
 *
 * Écrit en structure et non en `Fermeture` : celui-ci vit dans l'infrastructure, que le
 * domaine ne cite pas. Un `Fermeture` s'y range tel quel.
 */
export interface DonneesDeLaColonne {
  voie?: "liquidation-amiable" | "tup" | "liquidation-judiciaire" | null;
  phase?: "dissolution" | "cloture";
  societe?: SocieteFermee;
  associes?: unknown[];
  valeurs?: Record<string, string | number | undefined>;
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

/** « Madame Claire MARCHAND », de ce qui a été saisi de son état civil. */
function liquidateur(valeurs: Record<string, string | number | undefined>): string | null {
  const nom = [
    texte(valeurs.liquidateurCivilite),
    texte(valeurs.liquidateurPrenom),
    texte(valeurs.liquidateurNom),
  ]
    .filter(Boolean)
    .join(" ");
  return nom || null;
}

/**
 * L'échéance qui court.
 *
 * Le délai d'opposition des créanciers l'emporte tant qu'il est ouvert : il tient la
 * suite du dossier, rien ne se dépose avant son terme. À défaut, le terme du mandat du
 * liquidateur - trois ans, jour pour jour - qui est la borne de tout le reste, et qui
 * n'existe pas pour une transmission universelle, où personne n'est nommé.
 */
function echeanceDe(
  valeurs: Record<string, string | number | undefined>,
  tup: boolean
): { libelle: string; valeur: string } | null {
  const opposition = delaiDOpposition(texte(valeurs.publicationBodacc));
  const expire = opposition && date(opposition.expireLe);
  if (expire) return { libelle: "Fin des oppositions", valeur: expire };

  /* Sans liquidateur, pas de mandat à borner : une TUP n'a que son délai d'opposition. */
  if (tup) return null;

  const terme = date(termeDuMandat(texte(valeurs.dateDissolution)));
  if (terme) return { libelle: "Fin du mandat", valeur: terme };

  return null;
}

const VOIES: Record<string, string> = {
  "liquidation-amiable": "liquidation amiable",
  tup: "transmission universelle",
  "liquidation-judiciaire": "liquidation judiciaire",
};

export function colonneDeFermeture(donnees: DonneesDeLaColonne): ColonneDeFermeture {
  const societe = donnees.societe ?? {};
  const valeurs = donnees.valeurs ?? {};
  const enCloture = donnees.phase === "cloture";

  const voieLisible = donnees.voie ? VOIES[donnees.voie] : null;
  const phase = (enCloture ? "Clôture de la liquidation" : "Dissolution") +
    (voieLisible ? " · " + voieLisible : "");

  const lignes: LigneDeColonne[] = [
    {
      cle: "siren",
      libelle: "SIREN",
      valeur: texte(societe.siren) ? sirenLisible(societe.siren) : null,
    },
    {
      cle: "dissolution",
      libelle: "Dissolution",
      valeur: date(valeurs.dateDissolution),
    },
  ];

  /*
   * La clôture ne s'affiche qu'en seconde phase.
   *
   * Elle se décide des mois après la dissolution : la ligne aurait dit « à renseigner »
   * pendant toute la première phase, d'une case qui n'existe pas encore à l'écran.
   */
  if (enCloture) {
    lignes.push({ cle: "cloture", libelle: "Clôture", valeur: date(valeurs.dateCloture) });
  }

  /*
   * Une transmission universelle n'a pas de liquidateur.
   *
   * Le patrimoine passe d'un bloc à l'associé unique : il n'y a rien à liquider, donc
   * personne à nommer pour le faire, et aucun siège de liquidation. La ligne aurait dit
   * « à renseigner » d'une case qui n'existe nulle part dans ce parcours - c'est
   * l'associé qui recueille, et lui seul, qu'on lit ici.
   */
  if (donnees.voie === "tup") {
    lignes.push({
      cle: "associe",
      libelle: "Associé",
      valeur: texte(valeurs.associeDenomination) || null,
    });
  } else {
    lignes.push({
      cle: "liquidateur",
      libelle: "Liquidateur",
      valeur: liquidateur(valeurs),
    });
    lignes.push({
      cle: "siege",
      libelle: "Siège liq.",
      valeur: texte(valeurs.siegeDeLaLiquidation) || null,
    });
  }

  const voie = donnees.voie === "tup" ? "tup" : "liquidation-amiable";
  const devis = devisDeFermeture({
    voie,
    associeUniqueDirigeant:
      estUnipersonnelle(societe.forme) || (donnees.associes ?? []).length <= 1,
  });

  return {
    forme: texte(societe.forme) || null,
    denomination: texte(societe.denomination) || null,
    phase,
    lignes,
    echeance: echeanceDe(valeurs, donnees.voie === "tup"),
    total: montantLisible(devis.totalTTC),
  };
}
