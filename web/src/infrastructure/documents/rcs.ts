import { createRequire } from "node:module";

/**
 * La ville du RCS d'un siège social.
 *
 * Le tribunal de commerce compétent n'est pas celui de la commune mais celui du
 * département, avec des exceptions par code postal : Sainte-Foy-lès-Lyon (69110)
 * relève du RCS de Lyon, et un acte qui écrirait « RCS de Sainte-Foy-lès-Lyon »
 * serait rejeté au greffe.
 *
 * La table vit dans rcs.cjs, partagée avec le serveur d'origine. Elle n'est pas
 * recopiée ici : deux copies d'une centaine de communes finiraient par diverger, et
 * c'est le genre d'écart qui ne se voit qu'au refus du greffe.
 */
const requerir = createRequire(import.meta.url);

interface ModuleRcs {
  resolveRcsCity: (codePostal: string, defaut?: string) => string | null;
  validateRcsCity: (
    codePostal: string,
    ville: string
  ) => { ok: boolean; expected: string | null; message?: string };
}

let module_: ModuleRcs | null = null;

function charger(): ModuleRcs {
  if (!module_) module_ = requerir("./rcs.cjs") as ModuleRcs;
  return module_;
}

/** La ville du RCS, ou la commune à défaut. */
export function villeDuRcs(
  codePostal: string | null | undefined,
  commune: string | null | undefined
): string {
  if (!codePostal?.trim()) return commune?.trim() ?? "";
  return charger().resolveRcsCity(codePostal.trim(), commune?.trim() ?? "") ?? "";
}

/** Ce qu'il faudrait écrire, quand la commune saisie n'est pas le bon RCS. */
export function verifierVilleDuRcs(codePostal: string, ville: string) {
  return charger().validateRcsCity(codePostal, ville);
}
