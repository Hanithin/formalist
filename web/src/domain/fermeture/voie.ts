import { natureDeLaForme } from "@/domain/formalite/formes";
/**
 * Par quelle voie une société se ferme.
 *
 * Trois voies, et une seule question les sépare vraiment : la société peut-elle payer
 * ce qu'elle doit ? Si elle ne le peut pas, aucune des deux voies amiables ne lui est
 * ouverte, et s'y engager quand même expose le dirigeant personnellement. C'est la
 * première chose que l'écran demande, et la seule qui puisse tout arrêter.
 *
 * Vient ensuite la question de l'associé unique. Une société entièrement détenue par
 * une autre société se dissout sans liquidation : son patrimoine passe d'un bloc à son
 * associé (article 1844-5 alinéa 3 du code civil). Détenue par un particulier, la même
 * société n'y a pas droit - l'alinéa 4 l'écarte expressément - et doit passer par un
 * liquidateur, des comptes définitifs et deux annonces. C'est le piège le plus courant
 * de la matière : la SASU d'un particulier n'est pas « TUP-able », quoi qu'en disent
 * les forums.
 */

export type Voie = "liquidation-amiable" | "tup" | "liquidation-judiciaire";

export interface Situation {
  forme?: string | null;
  /**
   * L'actif disponible suffit-il à régler le passif exigible ?
   *
   * C'est la définition légale de la cessation des paiements (article L. 631-1 du code
   * de commerce), posée dans les mots du dirigeant plutôt que dans ceux de la loi.
   */
  dettesImpayables: boolean;
  /** Le capital est-il détenu en totalité par une seule société ? */
  associeUniquePersonneMorale: boolean;
}

export interface Orientation {
  voie: Voie;
  /** Peut-on ouvrir un dossier chez nous ? */
  possible: boolean;
  titre: string;
  /** Ce qui se passe, dit au dirigeant. */
  explication: string;
  /** Le texte sur lequel cela repose. */
  fondement: string;
}

/**
 * Les formes dont l'associé unique ne peut être qu'une personne, jamais deux.
 *
 * Deux sigles étaient nommés ici : une SELASU ou une SELARLU, tout aussi
 * unipersonnelles, se voyaient traitées comme des sociétés à plusieurs - convocation
 * d'une assemblée là où l'associé unique décide seul.
 */
export function estUnipersonnelle(forme: string | null | undefined): boolean {
  return natureDeLaForme(forme).unipersonnelle;
}

export function estCivile(forme: string | null | undefined): boolean {
  /* Sept sigles étaient nommés ici, et l'EARL comme le GAEC n'en étaient pas. */
  const categorie = natureDeLaForme(forme).categorie;
  return categorie === "civile" || categorie === "civile-agricole";
}

export function orientationDe(situation: Situation): Orientation {
  /*
   * Les dettes passent avant tout le reste.
   *
   * Un dirigeant qui dissout à l'amiable une société en cessation des paiements ne se
   * contente pas d'un dossier refusé : il laisse courir le délai de quarante-cinq jours
   * de l'article L. 631-4, et le tribunal peut ensuite lui reprocher d'avoir aggravé le
   * passif. Nous ne vendons pas d'actes dans cette situation.
   */
  if (situation.dettesImpayables) {
    return {
      voie: "liquidation-judiciaire",
      possible: false,
      titre: "Votre société doit passer par le tribunal",
      explication:
        "Quand l'actif disponible ne suffit plus à payer ce qui est exigible, la société est en cessation des paiements. La fermeture amiable lui est fermée : c'est au tribunal de commerce d'ouvrir un redressement ou une liquidation judiciaire. Le dirigeant a quarante-cinq jours à compter de la cessation des paiements pour la déclarer, et ce délai l'engage personnellement - passé outre, le tribunal peut mettre à sa charge une partie des dettes.",
      fondement:
        "Articles L. 631-1, L. 631-4 et L. 640-4 du code de commerce",
    };
  }

  if (situation.associeUniquePersonneMorale) {
    return {
      voie: "tup",
      possible: true,
      titre: "Dissolution sans liquidation",
      explication:
        "Votre société est détenue en totalité par une autre société. Elle se dissout sans liquidation : il n'y a ni liquidateur, ni comptes définitifs, ni partage. L'ensemble de son patrimoine - l'actif comme le passif - passe d'un bloc à son associé unique. La décision est publiée, les créanciers ont trente jours pour s'y opposer, et la transmission n'est acquise qu'au terme de ce délai.",
      fondement: "Article 1844-5 alinéa 3 du code civil",
    };
  }

  return {
    voie: "liquidation-amiable",
    possible: true,
    titre: "Dissolution puis liquidation amiable",
    explication:
      "La fermeture se fait en deux temps. On dissout d'abord : les associés décident, nomment un liquidateur, et la société entre en liquidation - elle survit pour les besoins de celle-ci. On liquide ensuite : le liquidateur vend ce qui reste, paie ce qui est dû, arrête des comptes définitifs, et les associés se partagent le solde. La radiation vient à la fin.",
    fondement: "Articles 1844-7 4° du code civil et L. 237-1 et suivants du code de commerce",
  };
}

/**
 * Pourquoi la TUP n'est pas proposée à celui qui pourrait la croire ouverte.
 *
 * Un associé unique personne physique lit partout que « la TUP évite la liquidation »,
 * et le dit à son conseil. L'alinéa 4 de l'article 1844-5 l'écarte : il n'y a pas de
 * marge d'interprétation, et l'expliquer une fois évite la discussion.
 */
export const TUP_RESERVEE_AUX_SOCIETES =
  "La dissolution sans liquidation n'est ouverte qu'aux sociétés dont l'associé unique est lui-même une société. Détenue par un particulier, même à cent pour cent, une société passe par un liquidateur et des comptes définitifs : l'alinéa 4 de l'article 1844-5 du code civil l'écarte expressément.";

/** Ce qu'on répond à qui veut fermer malgré ses dettes. */
export const CE_QUE_FAIT_UN_AVOCAT =
  "Un avocat vous accompagne devant le tribunal : il prépare la déclaration de cessation des paiements, réunit les pièces comptables qu'elle exige, et vous assiste à l'audience. Plus la déclaration est faite tôt, plus les issues restent ouvertes - une procédure de sauvegarde ou un redressement peuvent encore sauver l'activité.";
