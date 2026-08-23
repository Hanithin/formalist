/**
 * Qui décide la dissolution, et à quelle majorité.
 *
 * C'est ce que les modèles trouvés en ligne écrivent le plus mal. Ils recopient tous
 * « à la majorité des trois quarts », qui n'est juste que pour une partie des SARL, et
 * l'acte porte alors une règle de vote qui n'est pas celle de la société. Le greffe ne
 * le voit pas ; un associé mécontent, si.
 *
 * Trois familles :
 *
 *   - la loi fixe la majorité (SARL, SA, SNC) ;
 *   - la loi renvoie aux statuts (SAS, sociétés civiles) ;
 *   - il n'y a personne à convaincre (associé unique).
 *
 * Pour les SARL, la règle a changé le 4 août 2005 : les sociétés constituées avant
 * gardent les trois quarts des parts, celles d'après votent aux deux tiers des parts
 * des associés présents ou représentés, sous condition de quorum. La loi laisse aussi
 * les anciennes SARL adopter les nouvelles règles à l'unanimité - c'est pourquoi
 * l'écran demande la date d'immatriculation plutôt que de la déduire.
 */

export interface Decision {
  /** L'organe qui décide, tel que l'acte le nomme. */
  organe: string;
  /** La majorité, écrite comme l'acte l'écrit. */
  majorite: string;
  /** Le quorum, quand la loi en pose un. */
  quorum?: string;
  /**
   * Le texte applicable, rédigé pour suivre « conformément à ».
   *
   * D'où le « l'article » en tête, et le singulier : l'acte écrit « conformément à
   * l'article L. 223-30 », non « conformément à Article L. 223-30 » - qui est ce que
   * donnait une chaîne capitalisée réutilisée telle quelle dans une phrase.
   */
  fondement: string;
  /** La loi renvoie-t-elle aux statuts ? L'écran doit alors demander. */
  auxStatuts: boolean;
  /** Ce qu'on explique au dirigeant avant qu'il signe. */
  explication: string;
}

export interface ContexteDecision {
  forme?: string | null;
  /** Un seul associé : il décide seul, quelle que soit la forme. */
  unipersonnelle: boolean;
  /**
   * La SARL a-t-elle été immatriculée avant le 4 août 2005 ?
   *
   * Indéfini tant que la question n'a pas été posée : on ne devine pas une règle de
   * majorité, on la demande.
   */
  avantAout2005?: boolean;
  /** Ce que les statuts prévoient, quand la loi leur renvoie. */
  majoriteStatutaire?: string;
}

/*
 * « à l'unanimité », non « à l'unanimité des associés ».
 *
 * La phrase se lit « La collectivité des associés, statuant à l'unanimité » : répéter
 * le mot une seconde fois dans la même proposition alourdit sans rien préciser.
 */
const UNANIMITE = "à l'unanimité";

export function decisionDeDissolution(contexte: ContexteDecision): Decision {
  const forme = (contexte.forme ?? "").trim().toUpperCase();

  if (contexte.unipersonnelle) {
    return {
      organe: "L'associé unique",
      majorite: "par décision de l'associé unique",
      fondement:
        forme === "EURL" || forme === "SARL"
          ? "l'article L. 223-1 du code de commerce"
          : "l'article L. 227-1 du code de commerce",
      auxStatuts: false,
      explication:
        "Vous êtes seul associé : votre décision vaut décision collective. Elle se consigne par écrit et se reporte au registre des décisions.",
    };
  }

  if (forme === "SARL") {
    if (contexte.avantAout2005) {
      return {
        organe: "L'assemblée générale extraordinaire",
        majorite: "à la majorité des associés représentant au moins les trois quarts des parts sociales",
        fondement: "l'article L. 223-30 du code de commerce, dans sa rédaction antérieure au 4 août 2005",
        auxStatuts: false,
        explication:
          "Votre SARL a été immatriculée avant le 4 août 2005 : elle garde l'ancienne règle, qui exige les trois quarts des parts, et non des seules parts présentes. Aucun quorum n'est requis.",
      };
    }
    return {
      organe: "L'assemblée générale extraordinaire",
      majorite: "à la majorité des deux tiers des parts détenues par les associés présents ou représentés",
      quorum:
        "le quart des parts sur première convocation, le cinquième sur seconde convocation",
      fondement: "l'article L. 223-30 du code de commerce",
      auxStatuts: false,
      explication:
        "Votre SARL suit la règle issue de la loi du 2 août 2005 : deux tiers des parts des présents ou représentés, à condition qu'un quart des parts soit réuni en première convocation.",
    };
  }

  if (forme === "SA") {
    return {
      organe: "L'assemblée générale extraordinaire",
      majorite: "à la majorité des deux tiers des voix des actionnaires présents ou représentés",
      quorum: "le quart des actions sur première convocation, le cinquième sur seconde convocation",
      fondement: "l'article L. 225-96 du code de commerce",
      auxStatuts: false,
      explication:
        "La dissolution modifie les statuts : elle relève de l'assemblée générale extraordinaire, aux deux tiers des voix, avec le quorum du quart des actions en première convocation.",
    };
  }

  if (forme === "SNC") {
    return {
      organe: "La collectivité des associés",
      majorite: UNANIMITE,
      fondement: "l'article L. 221-6 du code de commerce",
      auxStatuts: false,
      explication:
        "En société en nom collectif, les associés répondent des dettes sur leur patrimoine : la dissolution se décide à l'unanimité, sauf clause statutaire contraire.",
    };
  }

  if (forme === "SAS" || forme === "SASU") {
    return {
      organe: "La collectivité des associés",
      majorite: contexte.majoriteStatutaire?.trim() || UNANIMITE,
      fondement: "l'article L. 227-9 du code de commerce et aux statuts de la société",
      auxStatuts: true,
      explication:
        "La loi impose que la dissolution soit décidée collectivement, mais laisse vos statuts en fixer la majorité. Reprenez ce qu'ils disent : à défaut de clause, l'unanimité s'impose.",
    };
  }

  /*
   * Les sociétés civiles.
   *
   * L'article 1852 pose l'unanimité pour tout ce que les statuts n'ont pas réglé. Les
   * statuts de SCI prévoient presque toujours autre chose - c'est pourquoi on demande
   * plutôt que de supposer.
   */
  return {
    /*
     * « La collectivité des associés », et non « Les associés ».
     *
     * Le verbe qui suit est au singulier dans tous les gabarits - « décide », « nomme »,
     * « confère ». Un organe au pluriel donnait « Les associés décide », dans un acte
     * déposé au greffe.
     */
    organe: "La collectivité des associés",
    majorite: contexte.majoriteStatutaire?.trim() || UNANIMITE,
    fondement: "l'article 1852 du code civil, auquel renvoie l'article 1844-7 4°, et aux statuts de la société",
    auxStatuts: true,
    explication:
      "En société civile, la majorité est celle que fixent vos statuts. À défaut de clause, le code civil impose l'unanimité des associés.",
  };
}

/**
 * Qui peut être liquidateur.
 *
 * Presque n'importe qui, et c'est bien le problème : le dirigeant sortant est nommé
 * neuf fois sur dix sans que personne ne lui dise ce qu'il endosse. Le liquidateur
 * répond de ses fautes envers la société et envers les tiers, et il reste tenu de
 * publier, de déclarer et de rendre des comptes pendant toute la durée du mandat.
 */
export const CE_QUE_FAIT_LE_LIQUIDATEUR =
  "Le liquidateur remplace le dirigeant. Il réalise l'actif, paie les créanciers, établit les comptes définitifs et convoque les associés pour les faire approuver. Il répond de ses fautes, comme un dirigeant : payer un associé avant un créancier, ou clôturer en laissant une dette, l'expose personnellement.";

/** La durée du mandat, que l'acte doit dire. */
export const DUREE_DU_MANDAT =
  "Le mandat du liquidateur ne peut excéder trois ans. Il est renouvelable par décision de justice, mais une liquidation qui dépasse ce terme sans renouvellement est irrégulière.";
