import { createRequire } from "node:module";
import { natureDeLaForme } from "@/domain/formalite/formes";
import { dirigeantDeLAnnonce, siegeComplet } from "@/domain/formalite/gabarit";
import type { Brouillon } from "@/domain/formalite/parcours";

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

/** Le brouillon, ou rien : un JSON illisible ne doit pas faire échouer un texte. */
function lireLeBrouillon(json: string | null): Brouillon {
  try {
    const lu: unknown = JSON.parse(json ?? "{}");
    return lu && typeof lu === "object" ? (lu as Brouillon) : {};
  } catch {
    return {};
  }
}

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
  /*
   * Le dirigeant se compose, il ne se cherche pas dans d'anciennes clés.
   *
   * Le module lit `dirigeant_nom` et `GERANT_ADRESSE`, héritées d'un formulaire que
   * plus rien n'écrit : chaque avis de constitution sortait avec « Président : [NOM DU
   * DIRIGEANT], demeurant [ADRESSE DU DIRIGEANT] », prêt à partir tel quel au journal.
   * On les lui donne, depuis le domaine qui nomme déjà le dirigeant dans tous les
   * actes - comme on lui donne déjà son titre.
   */
  const donnees = lireLeBrouillon(formalite.data_json);
  const dirigeant = dirigeantDeLAnnonce(donnees);

  return module_.generateAnnonceText({
    ...formalite,
    data_json: JSON.stringify({
      ...donnees,
      PRESIDENT_NOM: dirigeant.nom || undefined,
      GERANT_ADRESSE: dirigeant.adresse || undefined,
      /* Et le siège en entier : « 12 rue de la Paix » sans commune ne vaut rien. */
      ADRESSE_SIEGE: siegeComplet(donnees) || undefined,
    }),
    titreDirigeant: natureDeLaForme(formalite.forme).titreDirigeant,
  });
}
