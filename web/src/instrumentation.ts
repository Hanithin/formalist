import type { Instrumentation } from "next";

/**
 * Ce qui casse en production, et que personne ne regardait.
 *
 * Deux chemins mènent ici, parce qu'une erreur serveur peut se perdre de deux façons.
 *
 * `onRequestError` est le point que Next offre pour toutes celles qu'il voit passer :
 * le rendu d'une page, une action, un gestionnaire que rien n'entoure. Les routes de
 * l'API, elles, rattrapent les leurs pour répondre proprement - Next n'en sait donc
 * jamais rien, et c'est `register` qui va leur brancher le même rapporteur.
 *
 * Chaque import du dépôt est enfermé dans un `if (NEXT_RUNTIME === "nodejs")`, et non
 * précédé d'un retour anticipé. La différence n'est pas cosmétique : Next remplace cette
 * variable par une constante à la compilation, et n'élimine la branche - avec l'import
 * qu'elle contient - que si elle englobe le code. Écrit autrement, le bundle du runtime
 * edge, qui sert le proxy, embarquait le client de base de données et refusait de
 * compiler : « A Node.js module is loaded ('node:url') which is not supported in the
 * Edge Runtime ». L'application entière tombait alors sur une page d'interruption.
 *
 * Les imports sont dynamiques pour une seconde raison : ce module est chargé au
 * démarrage du serveur, avant tout le reste, et y attacher le client de base de données
 * ferait payer la connexion même à un serveur qui ne connaîtra pas une seule panne.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { brancherLeRapporteur } = await import("@/lib/reponses");
    const { consignerIncident } = await import("@/infrastructure/db/depots/incidents");

    brancherLeRapporteur((erreur, requete) =>
      consignerIncident(erreur, {
        chemin: requete ? new URL(requete.url).pathname : null,
        methode: requete?.method ?? null,
        origine: "route",
      })
    );
  }
}

export const onRequestError: Instrumentation.onRequestError = async (erreur, requete, contexte) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { consignerIncident } = await import("@/infrastructure/db/depots/incidents");
      await consignerIncident(erreur, {
        chemin: requete.path,
        methode: requete.method,
        origine: contexte.routeType,
      });
    } catch {
      /* Le journal de sortie garde la trace : Next y a déjà écrit l'erreur d'origine. */
    }
  }
};
