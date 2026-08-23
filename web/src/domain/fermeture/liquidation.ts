/**
 * Les comptes définitifs de liquidation, et ce qu'ils déclenchent.
 *
 * Le liquidateur vend ce qui reste, paie ce qui est dû, et présente aux associés un
 * compte qui tient en quatre lignes : ce qu'il a encaissé, ce qu'il a payé, ce qu'il
 * rend du capital, et ce qui reste. Ce reste s'appelle un boni quand il est positif,
 * un mali quand la société rend moins que les apports.
 *
 * Trois conséquences en découlent, et aucune n'est évidente pour celui qui ferme :
 *
 *   - le boni supporte un droit de partage de 2,5 %, qui se paie au service des impôts
 *     avant le dépôt au greffe, et non après ;
 *   - il s'impose ensuite chez l'associé comme un revenu distribué, non comme une
 *     plus-value ;
 *   - il n'y a pas de droit de partage quand la société n'a qu'un associé : on ne
 *     partage pas avec soi-même.
 *
 * Tous les montants sont en centimes. Un droit de 2,5 % calculé sur des euros flottants
 * donne des écarts d'un centime que le service des impôts relève.
 */

/** Taux du droit de partage, article 746 du code général des impôts. */
export const TAUX_DROIT_DE_PARTAGE = 0.025;

export interface Chiffres {
  /** Ce que la réalisation de l'actif a produit, frais de liquidation déduits. */
  actifRealiseCentimes: number;
  /** Ce qui a été payé aux créanciers. */
  passifApureCentimes: number;
  /** Le capital social, tel qu'il figure aux statuts. */
  capitalCentimes: number;
  /** Les frais de la liquidation elle-même : annonces, greffe, honoraires. */
  fraisDeLiquidationCentimes: number;
}

export interface Resultat {
  /** Ce qui reste après paiement des créanciers et des frais. */
  actifNetCentimes: number;
  /** Le capital rendu aux associés, dans la limite de ce qui reste. */
  capitalRembourseCentimes: number;
  /** Positif : ce que la société rend en plus des apports. */
  boniCentimes: number;
  /** Positif : ce que les associés ne récupèrent pas de leurs apports. */
  maliCentimes: number;
  /** L'assiette du droit de partage. */
  assietteDuPartageCentimes: number;
  droitDePartageCentimes: number;
  /** Pourquoi le droit est dû, ou pourquoi il ne l'est pas. */
  explicationDuPartage: string;
  /** Les incohérences qui empêchent de clôturer. */
  anomalies: string[];
}

export interface Contexte extends Chiffres {
  /** Un seul associé : il n'y a pas de partage, donc pas de droit de partage. */
  unipersonnelle: boolean;
}

export function resultatDeLaLiquidation(contexte: Contexte): Resultat {
  const actifNetCentimes =
    contexte.actifRealiseCentimes -
    contexte.passifApureCentimes -
    contexte.fraisDeLiquidationCentimes;

  const capitalRembourseCentimes = Math.max(
    0,
    Math.min(contexte.capitalCentimes, actifNetCentimes)
  );
  const boniCentimes = Math.max(0, actifNetCentimes - contexte.capitalCentimes);
  const maliCentimes = Math.max(0, contexte.capitalCentimes - Math.max(0, actifNetCentimes));

  /*
   * L'assiette du droit, telle que l'administration la retient.
   *
   * Le BOFiP la fixe à l'actif net partagé en entier, non au seul boni : ce que les
   * associés se répartissent est un partage, capital compris. Beaucoup de modèles
   * n'appliquent le droit qu'au boni et sous-estiment la note - le service des impôts
   * la rectifie au moment de l'enregistrement, avant que le greffe n'accepte le dossier.
   */
  const assietteDuPartageCentimes = contexte.unipersonnelle
    ? 0
    : Math.max(0, actifNetCentimes);

  const droitDePartageCentimes = Math.round(
    assietteDuPartageCentimes * TAUX_DROIT_DE_PARTAGE
  );

  const anomalies: string[] = [];
  if (contexte.actifRealiseCentimes < 0) {
    anomalies.push("L'actif réalisé ne peut pas être négatif");
  }
  if (contexte.passifApureCentimes < 0) {
    anomalies.push("Le passif apuré ne peut pas être négatif");
  }
  if (contexte.capitalCentimes <= 0) {
    anomalies.push("Le capital social est nécessaire pour distinguer le boni du mali");
  }
  /*
   * Un actif net négatif n'est pas un mali : c'est un passif non apuré.
   *
   * Clôturer là-dessus laisserait des créanciers impayés et une société radiée. C'est
   * exactement la situation qui appelle le tribunal, et non le greffe.
   */
  if (actifNetCentimes < 0) {
    anomalies.push(
      "Les sommes réalisées ne couvrent pas le passif et les frais : la liquidation amiable ne peut pas être clôturée sur un solde négatif"
    );
  }

  return {
    actifNetCentimes,
    capitalRembourseCentimes,
    boniCentimes,
    maliCentimes,
    assietteDuPartageCentimes,
    droitDePartageCentimes,
    explicationDuPartage: contexte.unipersonnelle
      ? "Votre société n'a qu'un associé : il n'y a pas de partage, donc pas de droit de partage. Le boni reste imposable chez lui comme un revenu distribué."
      : assietteDuPartageCentimes === 0
        ? "Il n'y a rien à partager : aucun droit de partage n'est dû."
        : "Le partage supporte un droit de 2,5 % (article 746 du code général des impôts). Il se paie au service des impôts des entreprises à l'enregistrement du procès-verbal de clôture, avant le dépôt au greffe.",
    anomalies,
  };
}

/**
 * Ce qui arrive au boni chez l'associé.
 *
 * Un boni n'est pas une plus-value : c'est un revenu distribué, imposé comme un
 * dividende. La confusion est répandue et coûte cher, parce que l'abattement de 40 %
 * du barème ne s'applique pas de la même façon selon la nature retenue.
 */
export const IMPOSITION_DU_BONI =
  "Chez l'associé personne physique, le boni est un revenu distribué (article 161 du code général des impôts), et non une plus-value. Il supporte le prélèvement forfaitaire unique de 12,8 % augmenté des prélèvements sociaux, sauf option pour le barème progressif. La part correspondant au remboursement des apports n'est pas imposée : seul l'excédent l'est.";

/** Ce qui arrive au mali, dont personne ne parle. */
export const TRAITEMENT_DU_MALI =
  "Un mali n'ouvre aucun droit à remboursement. Chez l'associé personne physique, il constitue une moins-value de cession de titres, imputable sur les plus-values de même nature de l'année et des dix suivantes. Chez un associé société, il suit le régime des titres de participation.";

/**
 * L'exception que nous ne calculons pas, et que nous signalons.
 *
 * Quand un associé reprend en nature le bien qu'il avait lui-même apporté, la théorie
 * de la mutation conditionnelle des apports le répute n'en avoir jamais cessé d'être
 * propriétaire : aucun droit de mutation n'est dû sur cette reprise. Le calcul devient
 * alors une affaire d'espèce, qui se traite avec l'avocat plutôt que dans un formulaire.
 */
export const REPRISE_EN_NATURE =
  "Si un associé reprend en nature un bien qu'il avait lui-même apporté - un immeuble, un fonds de commerce - la reprise échappe au droit de mutation : il est réputé n'en avoir jamais cessé d'être propriétaire. Cette situation change l'assiette du droit de partage. Signalez-la : l'avocat reprendra le calcul avec vous.";
