import { it, expect } from "vitest";
import {
  compteDeLaSession,
  enProduction,
  hoteDuGuichet,
  ouvrirUneSession,
} from "@/infrastructure/guichet/transport";
import { compteDeLaReponse, listerLesDepots } from "@/infrastructure/guichet/formalites";

/**
 * La liaison avec le guichet unique, contre le service réel.
 *
 * Quatre choses qu'aucun test hors ligne ne peut prouver, et qui coûtent une demi-heure
 * à démêler quand on les découvre au milieu d'un dépôt :
 *
 *   1. le compte e-procedures existe et le mot de passe est le bon ;
 *   2. ses conditions particulières d'utilisation ont été validées - cela se fait une
 *      fois, par l'interface web, et l'API refuse la connexion tant que ce n'est pas
 *      fait, sans que le message le dise ;
 *   3. l'hôte visé est celui qu'on croit - la démonstration et la production ont des
 *      comptes distincts, et se tromper d'hôte ressemble à un mauvais mot de passe ;
 *   4. le jeton passe dans l'en-tête, et la liste des dépôts répond.
 *
 * Hors de la suite, donc : elle appelle un tiers.  `npm run guichet:ping`
 */
it("le guichet répond, et sait qui nous sommes", async () => {
  const hote = hoteDuGuichet();
  console.log("Hôte    : " + hote + (enProduction() ? "  (PRODUCTION)" : "  (démonstration)"));

  try {
    await ouvrirUneSession(true);
  } catch (e) {
    const erreur = e as { message?: string; statutHttp?: number; corps?: unknown };
    console.error(
      "\nÉchec de la connexion." +
        (erreur.statutHttp ? "  Réponse du guichet : " + erreur.statutHttp : "") +
        "\n" +
        JSON.stringify(erreur.corps ?? erreur.message ?? e) +
        "\n\nÀ vérifier, dans cet ordre :" +
        "\n  - GUICHET_USERNAME et GUICHET_PASSWORD dans le .env ;" +
        "\n  - une première connexion sur https://procedures" +
        (enProduction() ? "" : "-demo") +
        ".inpi.fr, qui valide les conditions particulières d'utilisation ;" +
        "\n  - que le compte appartient à cet environnement : la démonstration et la" +
        "\n    production n'en partagent aucun."
    );
    throw e;
  }

  const compte = compteDeLaReponse(compteDeLaSession());
  const qui = [compte.prenom, compte.nom].filter(Boolean).join(" ") || "sans nom";
  console.log("Compte  : " + qui + (compte.societe ? " - " + compte.societe : ""));
  console.log("Rôles   : " + (compte.roles.join(", ") || "aucun"));

  /* Une liste vide est une réponse : un compte de démonstration neuf n'a rien déposé. */
  const depots = await listerLesDepots({ parPage: 5 });
  if (depots.length === 0) {
    console.log("Dépôts  : aucun - ce n'est pas une panne, ce compte n'a rien déposé.");
  } else {
    console.log("Dépôts  : " + depots.length + " (les plus récents)");
    for (const d of depots) {
      console.log(
        "  #" + d.id + "  " + (d.statut ?? "?").padEnd(26) + " " + (d.reference ?? d.companyName ?? "")
      );
    }
  }

  expect(Array.isArray(depots)).toBe(true);
});
