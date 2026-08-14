/**
 * Les pièces jointes à une consultation.
 *
 * Elles sont stockées dans une seule colonne de texte, en JSON : c'est la forme
 * qu'avait documents_json et il n'y a pas de raison d'ouvrir une table pour une
 * liste de deux ou trois noms. La contrepartie est qu'on relit du texte libre, qui
 * peut avoir été écrit par une version antérieure ou tronqué : la lecture ne fait
 * donc jamais confiance à ce qu'elle trouve.
 *
 * Le nom d'origine est conservé à côté du nom de stockage. Le dépôt nomme les
 * fichiers par un tirage aléatoire, pour qu'un nom ne renseigne pas sur son contenu ;
 * une liste de quatre empreintes hexadécimales est illisible, et c'est ce que la page
 * d'origine affichait à l'avocat.
 */

export interface PieceJointe {
  /** Nom sous lequel le fichier est stocké, et par lequel il se demande. */
  fichier: string;
  /** Nom que le client a vu sur sa machine. */
  nom: string;
}

/** Au-delà, ce n'est plus une pièce jointe mais un dossier : il passe par la messagerie. */
export const PIECES_MAXIMUM = 10;

function pieceValide(valeur: unknown): PieceJointe | null {
  if (typeof valeur !== "object" || valeur === null) return null;

  const brut = valeur as Record<string, unknown>;
  const fichier = typeof brut.fichier === "string" ? brut.fichier : null;
  if (!fichier) return null;

  // Le nom d'origine peut manquer : une pièce déposée avant qu'on le conserve reste
  // lisible, sous son nom de stockage plutôt que sous rien.
  const nom = typeof brut.nom === "string" && brut.nom.trim() ? brut.nom : fichier;
  return { fichier, nom };
}

/**
 * Relit la colonne. Tout ce qui n'a pas la forme attendue est écarté en silence :
 * une pièce illisible ne doit pas empêcher d'afficher la consultation.
 */
export function lirePieces(json: string | null | undefined): PieceJointe[] {
  if (!json) return [];

  let brut: unknown;
  try {
    brut = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(brut)) return [];

  return brut
    .map((valeur) =>
      // Les anciennes versions n'écrivaient que le nom de stockage, en chaîne.
      typeof valeur === "string" ? { fichier: valeur, nom: valeur } : pieceValide(valeur)
    )
    .filter((p): p is PieceJointe => p !== null)
    .slice(0, PIECES_MAXIMUM);
}

export function ecrirePieces(pieces: PieceJointe[]): string | null {
  const retenues = pieces.slice(0, PIECES_MAXIMUM);
  // Une colonne vide plutôt que « [] » : rien à joindre se lit comme rien.
  return retenues.length === 0 ? null : JSON.stringify(retenues);
}
