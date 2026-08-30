/**
 * Ce qui manque, dit en une phrase.
 *
 * Quatre écrans de règlement assemblaient la même ligne de la même façon :
 *
 *     anomalies.map((a) => a.message).join(", ") + "."
 *
 * Les messages ne sont pas tous des fragments. « Le nom est requis » se met bout à
 * bout sans peine, mais « Une résolution qui l'ignore est nulle (article L. 232-10 du
 * code de commerce). » porte déjà son point, et le client lisait :
 *
 *     2 informations manquent : L'affectation ne tombe pas juste : il reste
 *     10 000,00 € à répartir., La dotation à la réserve légale est inférieure au
 *     minimum légal. Une résolution qui l'ignore est nulle (article L. 232-10 du
 *     code de commerce)..
 *
 * Une virgule après un point, un point doublé à la fin, et deux phrases entières
 * cousues comme des morceaux de liste. Ce qui retient un règlement mérite de se lire.
 */

/** Le point final d'un message, qui redoublerait celui de la phrase. */
function sansPointFinal(message: string): string {
  return message.trim().replace(/\s*\.+$/, "");
}

/**
 * Les messages enchaînés, ponctués une seule fois.
 *
 * Le point-virgule sépare des propositions qui se tiennent debout seules, là où la
 * virgule prétendrait n'énumérer que des mots.
 */
export function phraseDesAnomalies(messages: string[]): string {
  const propres = messages.map(sansPointFinal).filter(Boolean);
  if (propres.length === 0) return "";
  return propres.join(" ; ") + ".";
}
