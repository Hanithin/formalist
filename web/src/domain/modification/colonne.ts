/**
 * Ce qu'on lit à droite du formulaire d'une modification.
 *
 * Écrite sur le modèle de `comptes/colonne`, avec une différence : le sujet d'une
 * modification n'est pas la société, ce sont les changements décidés. Ils font donc un
 * bloc à eux, entre l'identité et le montant - c'est la réponse à « qu'est-ce que j'ai
 * coché, déjà », qu'on se pose trois étapes plus loin, quand on remplit les détails.
 *
 * `recapitulatifDeModification`, à côté, sert l'onglet « Le dossier » de l'avocat :
 * la relecture complète, section par section. Ce n'est pas la même lecture.
 */

import { dateEnFrancais } from "@/domain/formalite/lettres";
import { sirenLisible } from "./annonce";
import { devis, montantLisible } from "./offre";
import { statutsAMettreAJour } from "./formalites";
import { definitionModification } from "./types";
import type { SocieteModifiee } from "./gabarit";

/** Une ligne de la colonne. `valeur` nulle : le champ n'a pas encore de réponse. */
export interface LigneDeColonne {
  cle: string;
  libelle: string;
  valeur: string | null;
}

export interface ColonneDeModification {
  forme: string | null;
  denomination: string | null;
  lignes: LigneDeColonne[];
  /** Les changements cochés, dans l'ordre où ils ont été choisis. */
  changements: string[];
  total: string;
}

/**
 * Le dossier tel que la colonne le lit.
 *
 * Écrit en structure et non en `Modification` : celui-ci vit dans l'infrastructure,
 * que le domaine ne cite pas. Un `Modification` s'y range tel quel.
 */
export interface DonneesDeLaColonne {
  codes?: string[];
  societe?: SocieteModifiee;
  valeurs?: Record<string, unknown>;
  assemblee?: { date?: string | null };
  statuts?: { source?: string } | null;
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

/** « 30 000 € », et les centimes seulement s'il y en a. */
function euros(montant: number | null | undefined): string | null {
  if (typeof montant !== "number" || !Number.isFinite(montant)) return null;
  return montant
    .toLocaleString("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: Number.isInteger(montant) ? 0 : 2,
    })
    .replace(/[  ]/g, " ");
}

export function colonneDeModification(donnees: DonneesDeLaColonne): ColonneDeModification {
  const societe = donnees.societe ?? {};
  const valeurs = donnees.valeurs ?? {};
  const codes = donnees.codes ?? [];

  const lignes: LigneDeColonne[] = [
    {
      cle: "siren",
      libelle: "SIREN",
      valeur: texte(societe.siren) ? sirenLisible(societe.siren) : null,
    },
    { cle: "capital", libelle: "Capital", valeur: euros(societe.capital) },
    {
      cle: "assemblee",
      libelle: "Assemblée",
      valeur: date(donnees.assemblee?.date),
    },
    /*
     * Les statuts ne se disent que lorsqu'ils sont attendus.
     *
     * Sept changements sur neuf ne touchent pas aux statuts - une nomination de gérant,
     * une cession de parts - et la ligne aurait dit « à fournir » d'un document que
     * personne ne demande.
     */
    ...(statutsAMettreAJour(codes)
      ? [
          {
            cle: "statuts",
            libelle: "Statuts",
            valeur: donnees.statuts
              ? donnees.statuts.source === "depot"
                ? "déposés par vous"
                : "repris du registre"
              : null,
          },
        ]
      : []),
  ];

  const chiffrage = devis({
    codes,
    ressortActuel: texte(societe.ville),
    ressortNouveau: texte(valeurs.nouvelleVille),
    depotDesStatuts: statutsAMettreAJour(codes),
  });

  return {
    forme: texte(societe.forme) || null,
    denomination: texte(societe.denomination) || null,
    lignes,
    changements: codes
      .map((code) => definitionModification(code)?.libelleCourt)
      .filter((libelle): libelle is string => Boolean(libelle)),
    total: montantLisible(chiffrage.totalTTC),
  };
}
