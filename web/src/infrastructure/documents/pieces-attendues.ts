import { piecesAttendues } from "@/domain/formalite/documents";
import { piecesDeclaration } from "@/domain/auto-entrepreneur/declaration";
import { piecesAFournir } from "@/domain/modification/formalites";
import { piecesDesComptes } from "@/domain/comptes/pieces";
import { lireModification } from "@/infrastructure/db/depots/modifications";
import { lireComptes } from "@/infrastructure/db/depots/comptes";
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
 * La fermeture et la cessation n'attendent aucun justificatif à téléverser : leur
 * liste est vide, et c'est la bonne réponse - non l'absence de réponse qui faisait
 * retomber ces dossiers sur la liste de la création. Le dépôt des comptes en attend
 * un, et un seul : le rapport du commissaire aux comptes, que nous n'écrivons pas.
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

  /*
   * Un dépôt des comptes ne réclame qu'une pièce, et seulement dans un cas.
   *
   * Le rapport spécial sur les conventions réglementées est de la main du commissaire
   * aux comptes quand la société en a un : le cabinet ne l'écrit pas, et le
   * procès-verbal atteste pourtant que l'assemblée en a pris connaissance.
   */
  if (dossier.type === "comptes") {
    const comptes = lireComptes(dossier.data_json);
    return piecesDesComptes({
      forme: comptes.societe.forme,
      avecCommissaire: comptes.valeurs.commissaireAuxComptes === "Oui",
      commissaireNom: typeof comptes.valeurs.commissaireNom === "string"
        ? comptes.valeurs.commissaireNom
        : null,
      nombreDeConventions: comptes.conventions.length,
    }).map((p) => ({ identifiant: p.identifiant, titre: p.titre, obligatoire: p.obligatoire }));
  }

  if (dossier.type === "fermeture" || dossier.type === "cessation") {
    return [];
  }

  return piecesAttendues(dossier.forme).map((p) => ({
    identifiant: p.identifiant,
    titre: p.titre,
    obligatoire: true,
  }));
}
