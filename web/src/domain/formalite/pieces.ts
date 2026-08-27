/**
 * Ce qui manque au dossier, dit une fois pour toutes.
 *
 * Chaque parcours déclare ses pièces à sa façon - `piecesAFournir` pour une
 * modification, `piecesAttendues` pour une création, `piecesDeclaration` pour une
 * auto-entreprise - et chaque écran comptait les siennes comme il pouvait. Le résultat
 * se voyait des deux côtés.
 *
 * Côté cabinet, la tâche « Vérifier les pièces justificatives » se cochait dès qu'il
 * n'y avait rien en attente de vérification. Or ce compte ne portait que sur les pièces
 * *déposées* : une pièce obligatoire jamais fournie valait zéro, et la tâche
 * s'affichait faite sur un dossier incomplet. Pire, après un refus, le document
 * quittait la file d'attente et la tâche redevenait faite pendant qu'on attendait son
 * remplacement. L'écran des pièces, lui, ne listait que les documents présents : rien
 * n'y disait qu'il en manquait un.
 *
 * Côté client, l'écran de saisie retenait bien le règlement tant qu'un justificatif
 * manquait, mais la route de paiement ne vérifiait rien : le contrôle vivait dans la
 * page, et une page se contourne.
 *
 * Une seule fonction compare donc l'attendu au déposé, et les trois usages la lisent.
 */

/** Ce que le parcours réclame, quelle que soit la forme de sa déclaration. */
export interface PieceAttendueUnifiee {
  identifiant: string;
  titre: string;
  /** Une pièce facultative ne retient ni le règlement ni la relecture. */
  obligatoire: boolean;
}

/** Un document du dossier, tel que la base le porte. */
export interface DocumentDuDossier {
  type: string | null;
  status: string | null;
  rejection_reason?: string | null;
}

export interface EtatDesPieces {
  /** Attendues, obligatoires, et jamais reçues - ou reçues puis refusées sans suite. */
  manquantes: PieceAttendueUnifiee[];
  /** Reçues, refusées, et pas encore remplacées. */
  refusees: PieceAttendueUnifiee[];
  /** Reçues et en attente du regard de l'avocat. */
  aVerifier: PieceAttendueUnifiee[];
  /** Reçues et validées. */
  validees: PieceAttendueUnifiee[];
  /**
   * Le dossier est-il en état de partir ?
   *
   * Rien ne manque, rien n'a été refusé sans suite. Les pièces encore à vérifier ne
   * l'empêchent pas : c'est le travail de l'avocat, non une carence du client.
   */
  complet: boolean;
}

/** Un document refusé attend son remplacement : il ne compte pas comme remis. */
function refuse(document: DocumentDuDossier): boolean {
  return !!document.rejection_reason?.trim();
}

/**
 * L'état de chaque pièce attendue, et le verdict d'ensemble.
 *
 * Une pièce peut avoir plusieurs documents : un dépôt refusé, puis son remplacement.
 * C'est le meilleur qui compte - un remplacement accepté efface le refus qui le
 * précède, sans quoi un dossier corrigé resterait éternellement incomplet.
 */
export function etatDesPieces(
  attendues: PieceAttendueUnifiee[],
  documents: DocumentDuDossier[]
): EtatDesPieces {
  const manquantes: PieceAttendueUnifiee[] = [];
  const refusees: PieceAttendueUnifiee[] = [];
  const aVerifier: PieceAttendueUnifiee[] = [];
  const validees: PieceAttendueUnifiee[] = [];

  for (const piece of attendues) {
    const siennes = documents.filter((d) => d.type === piece.identifiant);

    if (siennes.some((d) => !refuse(d) && d.status === "verified")) {
      validees.push(piece);
      continue;
    }
    if (siennes.some((d) => !refuse(d) && d.status === "uploaded")) {
      aVerifier.push(piece);
      continue;
    }
    if (siennes.some((d) => !refuse(d))) {
      /* Déposée, ni refusée ni encore regardée : elle attend le cabinet. */
      aVerifier.push(piece);
      continue;
    }
    if (siennes.length > 0) {
      refusees.push(piece);
      continue;
    }
    if (piece.obligatoire) manquantes.push(piece);
  }

  return {
    manquantes,
    refusees,
    aVerifier,
    validees,
    complet: manquantes.length === 0 && refusees.length === 0,
  };
}

/**
 * Ce qu'on dit au client, en une phrase.
 *
 * « Il manque une pièce » sans dire laquelle renvoie à une devinette, et un dossier
 * complet mérite qu'on le dise aussi : c'est ce qui permet d'attendre sans s'inquiéter.
 */
export function phraseDesPieces(etat: EtatDesPieces): string {
  const nommer = (pieces: PieceAttendueUnifiee[]) =>
    pieces.map((p) => p.titre.toLowerCase()).join(", ");

  if (etat.refusees.length > 0) {
    return etat.refusees.length === 1
      ? "Une pièce doit être remplacée : " + nommer(etat.refusees) + "."
      : etat.refusees.length + " pièces doivent être remplacées : " + nommer(etat.refusees) + ".";
  }
  if (etat.manquantes.length > 0) {
    return etat.manquantes.length === 1
      ? "Il manque une pièce : " + nommer(etat.manquantes) + "."
      : "Il manque " + etat.manquantes.length + " pièces : " + nommer(etat.manquantes) + ".";
  }
  if (etat.aVerifier.length > 0) {
    return etat.aVerifier.length === 1
      ? "Une pièce est en cours de vérification."
      : etat.aVerifier.length + " pièces sont en cours de vérification.";
  }
  return "Toutes les pièces attendues sont au dossier.";
}
