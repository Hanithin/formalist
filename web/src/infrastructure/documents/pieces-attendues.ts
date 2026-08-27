import { piecesAttendues } from "@/domain/formalite/documents";
import { piecesDeclaration } from "@/domain/auto-entrepreneur/declaration";
import { piecesAFournir } from "@/domain/modification/formalites";
import { lireModification } from "@/infrastructure/db/depots/modifications";
import { lireDeclaration } from "@/infrastructure/db/depots/auto-entrepreneur";
import type { PieceAttendueUnifiee } from "@/domain/formalite/pieces";

/**
 * Ce qu'un dossier réclame, quel que soit son parcours.
 *
 * Chaque parcours déclare ses pièces avec ses propres mots - `piecesAFournir` pour une
 * modification, `piecesAttendues` pour une création, `piecesDeclaration` pour une
 * auto-entreprise - et trois écrans faisaient chacun leur propre traduction. La route
 * de dépôt en avait déjà une, l'écran du cabinet n'en avait aucune, et c'est ainsi
 * qu'un dossier incomplet pouvait paraître complet.
 *
 * Le dépôt des comptes, la fermeture et la cessation n'attendent aucun justificatif à
 * téléverser : leur liste est vide, et c'est la bonne réponse - non l'absence de
 * réponse qui faisait retomber ces dossiers sur la liste de la création.
 */
export function piecesAttenduesDuDossier(dossier: {
  type: string | null;
  data_json: string | null;
  forme?: string | null;
}): PieceAttendueUnifiee[] {
  if (dossier.type === "auto-entrepreneur") {
    return piecesDeclaration(lireDeclaration(dossier.data_json)).map((p) => ({
      identifiant: p.identifiant,
      titre: p.titre,
      /* Le parcours de l'auto-entreprise ne demande que l'indispensable. */
      obligatoire: true,
    }));
  }

  if (dossier.type === "modification") {
    const modification = lireModification(dossier.data_json);
    return piecesAFournir(modification.codes ?? [], modification.valeurs ?? {}).map((p) => ({
      identifiant: p.identifiant,
      titre: p.titre,
      obligatoire: p.obligatoire,
    }));
  }

  if (dossier.type === "comptes" || dossier.type === "fermeture" || dossier.type === "cessation") {
    return [];
  }

  return piecesAttendues(dossier.forme).map((p) => ({
    identifiant: p.identifiant,
    titre: p.titre,
    obligatoire: true,
  }));
}
