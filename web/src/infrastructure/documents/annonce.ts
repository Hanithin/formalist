import { createRequire } from "node:module";

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
  return module_.generateAnnonceText(formalite);
}
