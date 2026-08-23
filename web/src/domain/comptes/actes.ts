/**
 * Les actes que produit une approbation de comptes.
 *
 * Trois au plus, et jamais tous à la fois : le procès-verbal toujours, le rapport
 * spécial seulement quand la loi l'exige, la déclaration de confidentialité seulement
 * quand la société y a droit.
 *
 * Produire le rapport spécial quand il n'est pas dû encombrerait le dossier ; ne pas
 * le produire quand il l'est rend l'approbation irrégulière, puisque les associés
 * auraient statué sans le document sur lequel ils sont censés se prononcer.
 */

import { estUnipersonnelle } from "./regles";
import { confidentialitePossible, type CleExclusion, type Chiffres } from "./confidentialite";
import { regimeDesConventions } from "./conventions";

export interface ActeAProduire {
  titre: string;
  gabarit: string;
}

export function actesDesComptes(args: {
  forme: string | null | undefined;
  nombreDAssocies: number;
  avecCommissaire: boolean;
  nombreDeConventions: number;
  chiffres: Chiffres;
  exclusions: CleExclusion[];
  /** La confidentialité se demande, elle ne s'impose pas. */
  demandeLaConfidentialite: boolean;
}): ActeAProduire[] {
  const unipersonnelle = estUnipersonnelle(args.forme) || args.nombreDAssocies <= 1;

  const actes: ActeAProduire[] = [
    unipersonnelle
      ? {
          titre: "Décision de l'associé unique - approbation des comptes",
          gabarit: "comptes-pv-associe-unique.docx",
        }
      : {
          titre: "Procès-verbal d'assemblée générale ordinaire annuelle",
          gabarit: "comptes-pv-assemblee.docx",
        },
  ];

  /*
   * Le rapport spécial n'a de sens que s'il y a quelqu'un à qui le présenter.
   *
   * Dans une société unipersonnelle, la loi dispense du rapport et du vote : la
   * mention au registre suffit, et un rapport que l'associé unique s'adresserait à
   * lui-même n'aurait pas d'objet. Quand un commissaire aux comptes existe, c'est lui
   * qui l'établit - nous ne pouvons pas le rédiger à sa place.
   */
  const regime = regimeDesConventions({
    forme: args.forme,
    avecCommissaire: args.avecCommissaire,
  });
  if (
    regime.regime === "rapport-et-vote" &&
    !args.avecCommissaire &&
    args.nombreDeConventions > 0
  ) {
    actes.push({
      titre: "Rapport spécial sur les conventions réglementées",
      gabarit: "comptes-rapport-conventions.docx",
    });
  }

  if (args.demandeLaConfidentialite) {
    const verdict = confidentialitePossible({
      forme: args.forme,
      chiffres: args.chiffres,
      exclusions: args.exclusions,
    });

    if (verdict.modele === "micro") {
      actes.push({
        titre: "Déclaration de confidentialité des comptes annuels",
        gabarit: "comptes-confidentialite-micro.docx",
      });
    } else if (verdict.modele === "petite") {
      actes.push({
        titre: "Déclaration de confidentialité du compte de résultat",
        gabarit: "comptes-confidentialite-petite.docx",
      });
    }
  }

  return actes;
}
