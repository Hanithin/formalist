/**
 * Les pièces que le greffe exige, et celles qui bloquent tout.
 *
 * Depuis le 1er octobre 2024, la radiation d'une société liquidée à l'amiable ne
 * s'obtient plus sans deux attestations : l'une de l'URSSAF, l'autre des impôts. Le
 * décret n° 2024-751 du 7 juillet 2024 les a ajoutées à l'article R. 237-7 du code de
 * commerce et à l'article 10 du décret n° 78-704 pour les sociétés civiles. Sans elles,
 * le dossier est refusé - et le refus arrive des semaines après le dépôt, alors que les
 * annonces sont parues et payées.
 *
 * Deux malentendus reviennent sans cesse, et l'écran doit les lever avant le dépôt :
 *
 *   - « nous n'avons pas de salarié, donc pas d'URSSAF ». L'attestation est due quand
 *     même. Une société sans salarié demande une attestation d'entreprise sans salarié,
 *     que le greffe accepte, et il n'existe pas d'attestation sur l'honneur qui la
 *     remplace ;
 *   - « c'est une SCI, ce n'est pas une société commerciale ». Le décret vise aussi les
 *     sociétés civiles : elles produisent les mêmes attestations.
 *
 * Ces deux pièces se demandent dès la dissolution, pas à la clôture : elles supposent
 * d'être à jour, et se mettre à jour prend du temps.
 */

export type QuandLaDemander = "des-la-dissolution" | "a-la-cloture";

export interface Piece {
  cle: string;
  intitule: string;
  /** Qui la délivre, et par quel chemin. */
  ou: string;
  /** Ce qu'elle atteste, et pourquoi le greffe la réclame. */
  aQuoiElleSert: string;
  fondement: string;
  quand: QuandLaDemander;
  /** Le cas particulier qui fait croire qu'on en est dispensé. */
  malentendu?: string;
}

export const ATTESTATION_SOCIALE: Piece = {
  cle: "vigilance",
  intitule: "Attestation de vigilance de l'URSSAF",
  ou: "Sur urssaf.fr, dans votre espace en ligne : rubrique « Documents », puis « Demander une attestation ». Sans compte, ou sans salarié, par téléphone au 3957 avec votre SIRET.",
  aQuoiElleSert:
    "Elle atteste que la société a déclaré et payé ses cotisations sociales. Le greffe la contrôle au dépôt : sans elle, la radiation est bloquée.",
  fondement: "Article L. 243-15 du code de la sécurité sociale",
  quand: "des-la-dissolution",
  malentendu:
    "Une société sans salarié doit quand même en produire une. Elle demande alors une « attestation d'entreprise sans salarié » : elle ne certifie pas que les cotisations sont à jour, mais le greffe l'accepte. Les sociétés civiles et les SCI y sont soumises comme les autres.",
};

export const ATTESTATION_FISCALE: Piece = {
  cle: "fiscale",
  intitule: "Attestation de régularité fiscale",
  ou: "Sur impots.gouv.fr, dans votre espace professionnel : « Mes services », puis « Attestation fiscale ». Elle s'obtient en général immédiatement.",
  aQuoiElleSert:
    "Elle atteste que la société est à jour de ses déclarations et de ses paiements d'impôt sur les sociétés et de TVA. Elle est refusée s'il reste une déclaration non déposée, même sans montant à payer.",
  fondement: "Article R. 2143-7 du code de la commande publique",
  quand: "des-la-dissolution",
  malentendu:
    "Une société qui n'a plus d'activité doit tout de même avoir déposé ses dernières déclarations, y compris à zéro. C'est le motif de refus le plus courant.",
};

/** Les pièces communes à toute fermeture amiable, dans l'ordre où on les réunit. */
export const PIECES_DE_LA_DISSOLUTION: Piece[] = [
  {
    cle: "pv-dissolution",
    intitule: "Décision de dissolution certifiée conforme",
    ou: "Nous la rédigeons ; le représentant légal la signe et la certifie conforme.",
    aQuoiElleSert:
      "Elle prononce la dissolution, nomme le liquidateur et fixe le siège de la liquidation. Elle se dépose en annexe au registre.",
    fondement: "Article R. 123-105 du code de commerce",
    quand: "des-la-dissolution",
  },
  {
    cle: "annonce-dissolution",
    intitule: "Attestation de parution de l'avis de dissolution",
    ou: "Le support d'annonces légales la délivre après publication.",
    aQuoiElleSert:
      "Elle prouve que les tiers ont été informés. Le support choisi ici devra être le même pour l'avis de clôture.",
    fondement: "Article R. 237-2 du code de commerce",
    quand: "des-la-dissolution",
  },
  {
    cle: "non-condamnation",
    intitule: "Déclaration de non-condamnation et de filiation du liquidateur",
    ou: "Nous la rédigeons ; le liquidateur la signe.",
    aQuoiElleSert:
      "Le liquidateur exerce une fonction de direction : le registre vérifie qu'aucune interdiction de gérer ne le frappe.",
    fondement: "Article R. 123-54 du code de commerce",
    quand: "des-la-dissolution",
  },
  {
    cle: "identite-liquidateur",
    intitule: "Pièce d'identité du liquidateur",
    ou: "Copie de la carte d'identité ou du passeport en cours de validité.",
    aQuoiElleSert: "Elle accompagne la déclaration de non-condamnation.",
    fondement: "Article R. 123-54 du code de commerce",
    quand: "des-la-dissolution",
  },
];

export const PIECES_DE_LA_CLOTURE: Piece[] = [
  {
    cle: "comptes-definitifs",
    intitule: "Comptes définitifs de liquidation",
    ou: "Nous les mettons en forme à partir de vos chiffres ; le liquidateur les certifie.",
    aQuoiElleSert:
      "Ils arrêtent ce que la liquidation a produit et ce qu'elle a payé, et font apparaître le boni ou le mali.",
    fondement: "Article L. 237-9 du code de commerce",
    quand: "a-la-cloture",
  },
  {
    cle: "pv-cloture",
    intitule: "Décision de clôture, approbation des comptes et quitus",
    ou: "Nous la rédigeons ; elle se signe après lecture des comptes définitifs.",
    aQuoiElleSert:
      "Elle approuve les comptes, donne quitus au liquidateur et constate la clôture. C'est elle qui met fin à la personnalité morale.",
    fondement: "Article L. 237-9 du code de commerce",
    quand: "a-la-cloture",
  },
  {
    cle: "annonce-cloture",
    intitule: "Attestation de parution de l'avis de clôture",
    ou: "Dans le même support que l'avis de dissolution.",
    aQuoiElleSert:
      "Elle informe les tiers que la liquidation est close. Publiée ailleurs que la première, elle est refusée.",
    fondement: "Article R. 237-7 du code de commerce",
    quand: "a-la-cloture",
  },
  ATTESTATION_SOCIALE,
  ATTESTATION_FISCALE,
];

/** Ce que la dissolution sans liquidation demande, qui est bien plus court. */
export const PIECES_DE_LA_TUP: Piece[] = [
  {
    cle: "decision-tup",
    intitule: "Décision de dissolution de l'associé unique, certifiée conforme",
    ou: "Nous la rédigeons ; le représentant légal de l'associé unique la signe.",
    aQuoiElleSert:
      "Elle prononce la dissolution sans liquidation et emporte transmission universelle du patrimoine.",
    fondement: "Article 1844-5 alinéa 3 du code civil",
    quand: "des-la-dissolution",
  },
  {
    cle: "existence-associe",
    intitule: "Extrait d'immatriculation de l'associé unique, de moins de trois mois",
    ou: "Sur monidenum.fr ou auprès du greffe dont dépend l'associé unique.",
    aQuoiElleSert:
      "Il justifie que l'associé unique est bien une personne morale existante : c'est la condition de la dissolution sans liquidation.",
    fondement: "Article 1844-5 alinéa 4 du code civil",
    quand: "des-la-dissolution",
  },
  {
    cle: "bodacc",
    intitule: "Publication de la dissolution au BODACC",
    ou: "Elle est faite par le greffe à l'inscription de la dissolution : rien à demander.",
    aQuoiElleSert:
      "C'est elle, depuis le 1er octobre 2024, qui fait courir les trente jours d'opposition des créanciers. La transmission n'est acquise qu'à leur terme.",
    fondement:
      "Décret n° 2024-751 du 7 juillet 2024, modifiant l'article R. 237-7 du code de commerce",
    quand: "des-la-dissolution",
  },
];

export function piecesDe(voie: "liquidation-amiable" | "tup", phase: "dissolution" | "cloture"): Piece[] {
  if (voie === "tup") {
    return phase === "dissolution" ? PIECES_DE_LA_TUP : [];
  }
  return phase === "dissolution" ? PIECES_DE_LA_DISSOLUTION : PIECES_DE_LA_CLOTURE;
}

/**
 * Les deux attestations, mises en avant à part.
 *
 * Elles sont les seules que le client doit aller chercher lui-même, et les seules qui
 * bloquent la radiation. Les noyer dans une liste de neuf pièces les ferait manquer.
 */
export const ATTESTATIONS = [ATTESTATION_SOCIALE, ATTESTATION_FISCALE];

export const POURQUOI_LES_ATTESTATIONS =
  "Ces deux attestations sont nées d'un usage détourné de la liquidation amiable : des sociétés se radiaient pour échapper à un contrôle fiscal ou social en cours. Depuis le 1er octobre 2024, le greffe vérifie donc la situation avant de radier. Demandez-les dès maintenant : si une déclaration manque ou si une cotisation reste due, il faut le temps de régulariser.";
