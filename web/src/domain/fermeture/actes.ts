/**
 * Les actes que produit une fermeture, et le moment où chacun se produit.
 *
 * Ils ne sortent pas tous ensemble. La dissolution en produit trois ; la clôture, trois
 * autres, des mois plus tard. Les produire tous à la dissolution donnerait au client des
 * comptes de liquidation vides et un quitus signé avant la moindre opération - c'est-à-dire
 * des actes antidatés.
 *
 * Un seul gabarit par acte, quelle que soit la forme sociale. Ce qui change d'une SARL à
 * une SAS - l'organe qui décide, la majorité, le quorum - est une phrase, pas un document :
 * elle est calculée puis passée au gabarit. Sept fichiers pour sept formes divergeraient
 * dès la première correction portée à un seul.
 */

export interface ActeAProduire {
  titre: string;
  gabarit: string;
}

export interface ContexteActes {
  voie: "liquidation-amiable" | "tup";
  phase: "dissolution" | "cloture";
  /** Un associé unique décide seul : l'acte n'est pas un procès-verbal d'assemblée. */
  unipersonnelle: boolean;
  /** Le délai d'opposition est-il écoulé ? L'attestation de TUP en dépend. */
  oppositionEcoulee?: boolean;
}

export function actesDeLaFermeture(contexte: ContexteActes): ActeAProduire[] {
  if (contexte.voie === "tup") return actesDeLaTup(contexte);

  if (contexte.phase === "dissolution") {
    return [
      contexte.unipersonnelle
        ? {
            titre: "Décision de l'associé unique - dissolution et nomination du liquidateur",
            gabarit: "fermeture-decision-dissolution.docx",
          }
        : {
            titre: "Procès-verbal d'assemblée générale extraordinaire - dissolution",
            gabarit: "fermeture-pv-dissolution.docx",
          },
      {
        titre: "Déclaration de non-condamnation et de filiation du liquidateur",
        gabarit: "fermeture-declaration-liquidateur.docx",
      },
      {
        titre: "Pouvoir pour les formalités de dissolution",
        gabarit: "fermeture-pouvoir.docx",
      },
    ];
  }

  /*
   * L'ordre compte à la clôture.
   *
   * Les comptes définitifs viennent d'abord, le rapport ensuite, la décision en dernier :
   * c'est l'ordre dans lequel ils se lisent, et celui dans lequel ils se signent. Une
   * décision qui approuve des comptes établis après elle ne prouve rien.
   */
  return [
    {
      titre: "Comptes définitifs de liquidation",
      gabarit: "fermeture-comptes-de-liquidation.docx",
    },
    {
      titre: "Rapport du liquidateur",
      gabarit: "fermeture-rapport-liquidateur.docx",
    },
    contexte.unipersonnelle
      ? {
          titre: "Décision de l'associé unique - clôture de la liquidation",
          gabarit: "fermeture-decision-cloture.docx",
        }
      : {
          titre: "Procès-verbal d'assemblée générale - clôture de la liquidation",
          gabarit: "fermeture-pv-cloture.docx",
        },
  ];
}

/**
 * La dissolution sans liquidation : deux actes, séparés par trente jours.
 *
 * La décision se prend et se publie. L'attestation qui constate l'absence d'opposition
 * ne peut être établie qu'après le délai : signée avant, elle atteste d'un fait qui
 * n'est pas encore arrivé, et le greffe la refuse.
 */
function actesDeLaTup(contexte: ContexteActes): ActeAProduire[] {
  const actes: ActeAProduire[] = [
    {
      titre: "Décision de dissolution sans liquidation de l'associé unique",
      gabarit: "fermeture-tup-decision.docx",
    },
    {
      titre: "Pouvoir pour les formalités de dissolution",
      gabarit: "fermeture-pouvoir.docx",
    },
  ];

  if (contexte.oppositionEcoulee) {
    actes.push({
      titre: "Attestation de non-opposition et de transmission universelle du patrimoine",
      gabarit: "fermeture-tup-attestation.docx",
    });
  }

  return actes;
}

/** Tous les gabarits de la fermeture, pour que les tests vérifient qu'ils existent. */
export const GABARITS_DE_FERMETURE = [
  "fermeture-pv-dissolution.docx",
  "fermeture-decision-dissolution.docx",
  "fermeture-declaration-liquidateur.docx",
  "fermeture-pouvoir.docx",
  "fermeture-comptes-de-liquidation.docx",
  "fermeture-rapport-liquidateur.docx",
  "fermeture-pv-cloture.docx",
  "fermeture-decision-cloture.docx",
  "fermeture-tup-decision.docx",
  "fermeture-tup-attestation.docx",
];
