/**
 * Le dépôt d'un livrable du cabinet.
 *
 * Ce fichier portait aussi la carte de l'avancement annoncé au client : une frise de
 * cinq crans, avec le cran suivant et le précédent. Elle disait « Rien n'est encore
 * annoncé » sous la liste des étapes qui, elle, dit ce qu'il y a à faire pour que
 * quelque chose le soit. Les tâches marquent le dépôt et clôturent le dossier ; la
 * frise ne faisait que redire leur état dans d'autres mots.
 */
"use client";

/**
 * Déposer un document que le cabinet remet au client.
 *
 * Les deux livrables tenaient leur propre carte, sous l'avancement : « Récépissé de
 * dépôt » y attendait un fichier pendant que la tâche « Remettre récépissé de dépôt »
 * demandait la même chose vingt lignes plus haut. Le dépôt appartient à la tâche ; il
 * ne reste ici que le chemin vers le serveur.
 *
 * Rend le motif du refus, ou rien du tout quand c'est passé.
 */
export async function deposerUnLivrable(
  dossierId: number,
  type: "kbis" | "rbe",
  fichier: File
): Promise<string | null> {
  const corps = new FormData();
  corps.append("dossier", String(dossierId));
  corps.append("type", type);
  corps.append("fichier", fichier);

  const reponse = await fetch("/api/avocat/livrables", { method: "POST", body: corps });
  if (reponse.ok) return null;

  const donnees = await reponse.json().catch(() => ({}));
  return (donnees.error as string) ?? "Le dépôt n'a pas abouti.";
}
