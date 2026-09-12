/**
 * Les données des actes qui constatent une augmentation déjà réalisée.
 *
 * L'article L. 225-149 du code de commerce dit que l'augmentation résultant de
 * l'exercice de bons « est définitivement réalisée du seul fait de l'exercice des
 * droits ». Il n'y a donc pas d'assemblée à faire délibérer : le président constate, sur
 * délégation, et modifie corrélativement les statuts. Le même texte écarte les
 * formalités de dépôt des fonds - aucune attestation bancaire n'est due.
 *
 * Quatre actes en découlent, et chacun a sa raison d'être :
 *
 * - la renonciation individuelle au droit préférentiel de souscription, qui évite la
 *   désignation d'un commissaire aux comptes ad hoc (L. 225-132 al. 5 contre L. 225-138
 *   III) ;
 * - les décisions collectives, quand l'émission n'a jamais été décidée et doit être
 *   ratifiée (article 1156 al. 3 du code civil, article L. 235-3 du code de commerce) ;
 * - l'avenant de conversion, quand la conversion intervient avant son terme et suppose
 *   l'accord de chaque souscripteur ;
 * - la décision du président, qui est l'acte que le greffe attend.
 */

import { repartition, type ContratAir } from "./air";
import type { Valeurs } from "./types";
import { nombreEnFrancais } from "@/domain/formalite/lettres";

/** Le texte de remplacement des gabarits, quand une donnée manque. */
const TIRET = "-";

/**
 * « 1 129,03 » : les montants s'écrivent avec une espace ordinaire.
 *
 * Selon la version d'ICU, `toLocaleString` sépare les milliers par une espace fine
 * insécable (U+202F) ou par une insécable (U+00A0). La première manque dans certaines
 * polices : elle apparaît alors comme un carré au milieu d'un montant, dans un acte
 * déposé au greffe.
 *
 * Les deux sont écrites en échappement plutôt qu'en clair : une réécriture du fichier
 * les a déjà aplaties ailleurs sans que rien ne le signale, et la règle ne s'appliquait
 * plus.
 */
function montant(valeur: number, decimales = 2): string {
  return valeur
    .toLocaleString("fr-FR", { maximumFractionDigits: decimales, minimumFractionDigits: 0 })
    .replace(/[\u202f\u00a0]/g, " ");
}

function texte(valeur: unknown): string {
  const dit = (valeur ?? "").toString().trim();
  return dit || TIRET;
}

function nombre(valeurs: Valeurs, champ: string): number {
  const brut = valeurs[champ];
  const valeur =
    typeof brut === "number"
      ? brut
      : Number(
          (brut ?? "")
            .toString()
            .replace(/[^\d.,-]/g, "")
            .replace(",", ".")
        );
  return Number.isFinite(valeur) ? valeur : 0;
}

/** Le diviseur du nominal, tel que le choix l'écrit : « 1 000 » n'est pas un nombre. */
export function diviseurDuNominal(valeurs: Valeurs): number {
  const chiffres = (valeurs.airDivision ?? "").toString().replace(/[^\d]/g, "");
  const valeur = Number(chiffres);
  return Number.isFinite(valeur) && valeur >= 1 ? valeur : 1;
}

/** Une ligne du tableau annexé aux actes. */
export interface LigneDeConversion {
  INVESTISSEUR: string;
  MONTANT: string;
  VALORISATION: string;
  PRIX: string;
  ACTIONS: string;
  PART: string;
}

export interface ContexteConstatation {
  valeurs: Valeurs;
  air: ContratAir[];
  /** Le capital social avant conversion, en euros. */
  capital: number;
}

/**
 * Tout ce que les quatre actes ont besoin de savoir.
 *
 * Les balises sont en majuscules, comme partout ailleurs dans les gabarits du cabinet.
 * Les chiffres y sont déjà écrits - « 1 129,03 euros », « mille cent vingt-neuf » - parce
 * qu'un gabarit ne calcule pas : il place.
 */
export function donneesDeLaConstatation(contexte: ContexteConstatation): Record<string, unknown> {
  const { valeurs, air } = contexte;

  const diviseur = diviseurDuNominal(valeurs);
  const existantesAvant = nombre(valeurs, "airActionsExistantes");
  const nominaleAvant = nombre(valeurs, "airValeurNominale");
  const existantes = existantesAvant * diviseur;
  const nominale = diviseur > 1 && nominaleAvant > 0 ? nominaleAvant / diviseur : nominaleAvant;

  const utiles = air.filter((a) => a.montant > 0 && a.valorisation > 0);
  const parts = repartition(existantes, utiles);

  /*
   * Le capital se calcule sur les actions, non sur le capital d'avant.
   *
   * Le nominal peut porter trois décimales après une division par mille, et additionner
   * un montant arrondi à un capital arrondi fait diverger l'annonce légale des statuts
   * d'un centime. Le produit du nominal par le nombre d'actions ne diverge pas.
   */
  const capitalAvant = existantes * nominale;
  const capitalApres = parts.actionsApres * nominale;
  const nominalCree = parts.actionsCreees * nominale;

  const decimales = nominale > 0 && nominale < 0.01 ? 3 : 2;

  /*
   * Une ligne par souscripteur, qui sert deux fois.
   *
   * Le tableau annexé à la décision du président la lit en ligne de tableau ;
   * l'attestation d'inscription en compte répète le même jeu de balises sur une page
   * entière, une par titulaire. Les deux gabarits parcourent la même liste.
   */
  const lignes: LigneDeConversion[] = parts.investisseurs.map((investisseur) => ({
    INVESTISSEUR: investisseur.investisseur || TIRET,
    MONTANT: montant(investisseur.montant, 0) + " euros",
    VALORISATION: montant(investisseur.valorisation, 0) + " euros",
    PRIX: montant(investisseur.prix, 4) + " euros",
    ACTIONS: montant(investisseur.actions, 0),
    PART: (investisseur.part * 100).toFixed(3).replace(".", ",") + " %",
  }));

  const totalInvesti = utiles.reduce((t, a) => t + a.montant, 0);

  return {
    /* Le capital, avant et après. */
    AIR_ACTIONS_AVANT: montant(existantes, 0),
    AIR_ACTIONS_CREEES: montant(parts.actionsCreees, 0),
    AIR_ACTIONS_APRES: montant(parts.actionsApres, 0),
    AIR_NOMINALE: montant(nominale, decimales),
    AIR_NOMINALE_AVANT: montant(nominaleAvant, 2),
    AIR_CAPITAL_AVANT: montant(capitalAvant, decimales),
    AIR_CAPITAL_APRES: montant(capitalApres, decimales),
    /*
     * Le capital en lettres, et seulement quand il tombe rond.
     *
     * Diviser le nominal par mille donne un capital à trois décimales - 1 166,136 euros -
     * dont les lettres arrondies diraient « mille cent soixante-six euros » à côté du
     * chiffre. Un acte qui se contredit sur son propre capital se fait refuser ; les
     * lettres s'effacent donc plutôt que de mentir, et le gabarit ne les écrit pas.
     */
    IS_CAPITAL_ENTIER: Number.isInteger(Math.round(capitalApres * 1000) / 1000)
      ? Number.isInteger(capitalApres)
      : false,
    AIR_CAPITAL_APRES_LETTRES: nombreEnFrancais(Math.round(capitalApres)),
    AIR_NOMINAL_CREE: montant(nominalCree, decimales),
    AIR_TOTAL_INVESTI: montant(totalInvesti, 0),
    AIR_NOMBRE_ACCORDS: String(utiles.length),
    AIR_PART_FONDATEURS:
      parts.actionsApres > 0
        ? ((parts.actionsExistantes / parts.actionsApres) * 100).toFixed(2).replace(".", ",") + " %"
        : TIRET,

    /* La division du nominal, quand elle a lieu. */
    IS_DIVISION: diviseur > 1,
    AIR_DIVISEUR: montant(diviseur, 0),
    AIR_DIVISEUR_LETTRES: nombreEnFrancais(diviseur),

    /* Ce qui décide du contenu des actes. */
    IS_RATIFICATION:
      valeurs.airDecisionEmission === "N'a pas fait l'objet d'une décision collective : à ratifier",
    IS_RENONCIATION_INDIVIDUELLE:
      valeurs.airDroitPreferentiel ===
      "Chaque associé y renonce individuellement, au profit des souscripteurs",
    IS_CONVERSION_ANTICIPEE:
      valeurs.airEvenement === "Clôture du tour de financement, par accord des parties",
    IS_PACTE_CONDITION:
      valeurs.airPacte === "Un pacte existe et son adhésion conditionne la conversion",
    IS_LIBERATION_IMPUTEE:
      valeurs.airLiberation === "Par imputation sur le prix des bons, déjà versé",

    AIR_EVENEMENT: texte(valeurs.airEvenement),
    AIR_DATE: texte(valeurs.airDateEvenement),

    /* Le tableau annexé, une ligne par souscripteur. */
    AIR_LIGNES: lignes,
  };
}
