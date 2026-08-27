import { createRequire } from "node:module";
import { natureDeLaForme } from "@/domain/formalite/formes";

/**
 * Texte d'annonce légale.
 *
 * annonce.cjs est repris du serveur d'origine sans réécriture : variantes de
 * noms de champs héritées de versions successives du formulaire, résolution du
 * tribunal de commerce depuis le code postal. On l'appelle, on ne le refait pas.
 */
const requerir = createRequire(import.meta.url);

interface ModuleAnnonce {
  generateAnnonceText: (formalite: {
    type: string | null;
    forme: string | null;
    societe: string | null;
    capital: number | null;
    data_json: string | null;
    /** Le titre du dirigeant : le module ne le déduit plus, il le reçoit. */
    titreDirigeant: string;
  }) => string;
}

let module_: ModuleAnnonce | null = null;

export function texteAnnonce(formalite: {
  type: string | null;
  forme: string | null;
  societe: string | null;
  capital: number | null;
  data_json: string | null;
}): string {
  module_ ??= requerir("./annonce.cjs") as ModuleAnnonce;
  /*
   * Le module déduisait le titre d'une liste de cinq formes, et publiait « Représentant
   * légal » pour toutes les autres - un titre qui n'existe chez personne. On le lui
   * donne, depuis la table qui le déclare.
   */
  return module_.generateAnnonceText({
    ...formalite,
    titreDirigeant: natureDeLaForme(formalite.forme).titreDirigeant,
  });
}
