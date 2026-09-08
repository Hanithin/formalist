/**
 * Ce que le registre national publie, tel qu'on peut le montrer.
 *
 * Une règle de lecture, non un accès au registre : elle vit dans le domaine parce
 * qu'elle se teste sans réseau - et parce qu'un écran en a besoin. Elle a d'abord été
 * écrite dans `infrastructure/inpi`, et l'importer depuis un composant client tirait
 * `node:module` dans le paquet du navigateur : la page ne se construisait plus du tout.
 */

/**
 * La nature d'un acte, telle qu'on peut la montrer.
 *
 * Le registre publie souvent le nom du fichier tel qu'il était sur la machine du
 * déposant : « 11PV_AG_modification_BLUE_SHARK_ADVISORY_2026-02-18T17-05-36-466Z ». On
 * l'affichait tel quel, et l'avocat devait déchiffrer un horodatage pour reconnaître
 * ses propres actes.
 *
 * Ce qu'on retire n'est jamais du sens : le numéro d'ordre en tête, l'horodatage en
 * queue, la dénomination de la société - elle est déjà en haut de l'écran - et les
 * soulignements qui tiennent lieu d'espaces. Ce qui reste est ce que le déposant avait
 * écrit. Quand il ne reste rien, on rend la nature d'origine plutôt qu'une chaîne vide.
 */
export function natureLisible(nature: string, denomination?: string | null): string {
  let texte = nature
    /* L'horodatage ISO que le greffe accole au nom, avec ou sans millisecondes. */
    .replace(/[_-]?\d{4}-\d{2}-\d{2}T[\d-]+Z?$/i, "")
    /* Le numéro d'ordre en tête : « 11PV_AG… », « 5Capital… ». */
    .replace(/^\d+/, "")
    .replace(/\.pdf$/i, "")
    .replace(/[_]+/g, " ")
    .trim();

  if (denomination) {
    /* La dénomination, sous la forme qu'un nom de fichier lui donne. */
    const motif = denomination.trim().replace(/[^a-zA-Z0-9]+/g, "[ _-]*");
    if (motif) texte = texte.replace(new RegExp(motif, "gi"), " ").replace(/\s{2,}/g, " ").trim();
  }

  texte = texte.replace(/^[\s-]+|[\s-]+$/g, "");
  if (!texte) return nature;

  return texte.charAt(0).toUpperCase() + texte.slice(1);
}
