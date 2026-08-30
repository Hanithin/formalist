/**
 * Ce qu'on lit à droite du formulaire d'une auto-entreprise.
 *
 * Écrite sur le modèle des autres parcours, avec ce que celui-ci a de particulier : il
 * n'y a pas de société. Le sujet du dossier est une personne et son activité, et c'est
 * l'activité qui décide de tout le reste - le régime fiscal, le plafond de chiffre
 * d'affaires, le taux du versement libératoire. Ces trois-là ne sont demandés nulle
 * part : ils se déduisent, et c'est ici qu'on les lit.
 *
 * Le compte des pièces s'y trouve aussi. C'est l'étape où l'on s'arrête - il faut
 * retrouver une facture, scanner une carte d'identité - et l'on rouvre son dossier sans
 * savoir laquelle manquait.
 */

import { dateEnFrancais } from "@/domain/formalite/lettres";
import { montantLisible, PRIX_TTC_CENTIMES } from "./offre";
import { piecesDeclaration, regleActivite, type Declaration } from "./declaration";

/** Une ligne de la colonne. `valeur` nulle : le champ n'a pas encore de réponse. */
export interface LigneDeColonne {
  cle: string;
  libelle: string;
  valeur: string | null;
}

export interface ColonneDeLaDeclaration {
  /** Le régime fiscal, déduit de l'activité. */
  regime: string | null;
  /** Le nom de la personne, tel que la déclaration le portera. */
  nom: string | null;
  /** L'activité déclarée, en toutes lettres. */
  activite: string | null;
  lignes: LigneDeColonne[];
  total: string;
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
 * Le nom sous lequel la personne déclare.
 *
 * Le nom d'usage l'emporte sur celui de naissance quand il est donné : c'est celui que
 * porteront les factures. La civilité reste dehors - « Madame » n'est pas un nom, et la
 * ligne de tête d'un écran n'en a pas besoin.
 */
export function nomDeLaPersonne(declaration: Declaration): string | null {
  const famille = texte(declaration.nomUsage) || texte(declaration.nomNaissance);
  const nom = [texte(declaration.prenoms), famille].filter(Boolean).join(" ");
  return nom || null;
}

/** « 77 700 € » : un plafond s'écrit avec ses espaces, sans centimes. */
function euros(montant: number): string {
  return (
    montant.toLocaleString("fr-FR", { maximumFractionDigits: 0 })
      /* Les espaces insécables du groupement, ramenées à l'espace ordinaire du reste. */
      .replace(/[\u00a0\u202f]/g, " ") + " €"
  );
}

/** « 1,7 % » : le taux du versement libératoire, à la française. */
function pourcent(taux: number): string {
  return taux.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " %";
}

/**
 * L'adresse, sur deux lignes.
 *
 * Celle de l'entreprise quand elle est distincte du domicile : c'est elle qui figure au
 * répertoire, et c'est celle-là qu'on vérifie.
 */
function adresse(declaration: Declaration): string | null {
  const distincte = declaration.adresseEntrepriseDistincte === true;
  const voie = texte(distincte ? declaration.entrepriseVoie : declaration.adresseVoie);
  const codePostal = texte(distincte ? declaration.entrepriseCodePostal : declaration.codePostal);
  const ville = texte(distincte ? declaration.entrepriseVille : declaration.ville);

  const seconde = [codePostal, ville].filter(Boolean).join(" ");
  if (voie && seconde) return voie + "\n" + seconde;
  return voie || seconde || null;
}

export function colonneDeLaDeclaration(
  declaration: Declaration,
  /** Les pièces déjà déposées, par leur type - qui peut manquer en base. */
  piecesDeposees: { type?: string | null }[] = []
): ColonneDeLaDeclaration {
  const regle = regleActivite(declaration.natureActivite);

  const attendues = piecesDeclaration(declaration);
  const deposees = attendues.filter((piece) =>
    piecesDeposees.some((d) => d.type === piece.identifiant)
  ).length;

  const lignes: LigneDeColonne[] = [
    { cle: "adresse", libelle: "Adresse", valeur: adresse(declaration) },
    { cle: "debut", libelle: "Début", valeur: date(declaration.dateDebut) },
    /*
     * Le plafond et le taux ne se demandent pas : ils découlent de la nature choisie.
     *
     * C'est pourtant le chiffre qu'on cherche en arrivant - jusqu'où puis-je facturer -
     * et il n'était écrit nulle part une fois l'étape de l'activité passée.
     */
    { cle: "plafond", libelle: "Plafond", valeur: regle ? euros(regle.plafond) : null },
    {
      cle: "versement",
      libelle: "Versement",
      valeur:
        declaration.versementLiberatoire === undefined
          ? null
          : declaration.versementLiberatoire
            ? "libératoire" + (regle ? ", " + pourcent(regle.tauxVersementLiberatoire) : "")
            : "non",
    },
    {
      cle: "acre",
      libelle: "ACRE",
      valeur:
        declaration.acre === undefined ? null : declaration.acre ? "demandée" : "non demandée",
    },
    {
      cle: "pieces",
      libelle: "Pièces",
      valeur: deposees + " sur " + attendues.length,
    },
  ];

  return {
    regime: regle?.regimeFiscal ?? null,
    nom: nomDeLaPersonne(declaration),
    activite: regle?.libelle ?? null,
    lignes,
    total: montantLisible(PRIX_TTC_CENTIMES),
  };
}
