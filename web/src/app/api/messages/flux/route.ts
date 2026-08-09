import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { messagesDepuis } from "@/infrastructure/db/depots/messages";
import { validerParametres, schemas } from "@/lib/valider";
import { journal } from "@/lib/journal";

/**
 * Flux temps réel des messages d'un dossier.
 *
 * Le serveur d'origine tient la liste des abonnés en mémoire (lib/sse.js). C'est
 * plus direct, mais une liste en mémoire ne survit pas à un redémarrage et ne
 * traverse pas deux instances - or permettre plusieurs instances est justement
 * l'objet de la migration. On interroge donc la base.
 *
 * Le pas de deux secondes est un compromis assumé : la latence est imperceptible
 * dans une conversation, et la charge reste une requête indexée par abonné. Si
 * elle devenait sensible, l'étape suivante est LISTEN/NOTIFY de Postgres, qui
 * supprime l'attente sans revenir à un état en mémoire.
 */
const PAS_MS = 2000;
const DUREE_MAXIMALE_MS = 5 * 60 * 1000;

const SCHEMA = z.object({ dossier: schemas.identifiant, depuis: schemas.identifiant.optional() });

export async function GET(requete: Request) {
  const utilisateur = await exigerUtilisateur();
  const { dossier, depuis } = validerParametres(SCHEMA, new URL(requete.url));

  // Premier appel : on lève d'abord l'accès, pour refuser tout de suite plutôt
  // que d'ouvrir un flux qui ne renverra jamais rien.
  let dernier = depuis ?? 0;
  await messagesDepuis(utilisateur, dossier, dernier);

  const encodeur = new TextEncoder();
  const debut = Date.now();

  // `ouvert` est partagé entre start et cancel : c'est cancel que le cadre
  // appelle quand le navigateur se détache, et lui seul le sait de façon fiable.
  let ouvert = true;

  const flux = new ReadableStream({
    cancel() {
      ouvert = false;
    },

    async start(controleur) {
      // Le navigateur peut fermer l'onglet à tout moment : écrire dans un flux
      // déjà refermé lève, et remplirait le journal d'erreurs sans objet.
      const envoyer = (evenement: string, donnees: unknown) => {
        if (!ouvert || requete.signal.aborted) return;
        try {
          controleur.enqueue(
            encodeur.encode("event: " + evenement + "\ndata: " + JSON.stringify(donnees) + "\n\n")
          );
        } catch {
          ouvert = false;
        }
      };

      requete.signal.addEventListener("abort", () => {
        ouvert = false;
      });

      envoyer("ouvert", { dossier });

      try {
        while (ouvert && Date.now() - debut < DUREE_MAXIMALE_MS) {
          if (requete.signal.aborted) break;

          const nouveaux = await messagesDepuis(utilisateur, dossier, dernier);
          if (nouveaux.length) {
            dernier = nouveaux[nouveaux.length - 1].id;
            envoyer("messages", nouveaux);
          }

          await new Promise((r) => setTimeout(r, PAS_MS));
        }
        // Fin de vie du flux : le navigateur rouvre de lui-même.
        envoyer("fin", { raison: "duree" });
      } catch (e) {
        journal.error({ err: e, dossier }, "Flux de messages interrompu");
      } finally {
        try {
          controleur.close();
        } catch {
          // flux déjà refermé par le navigateur
        }
      }
    },
  });

  return new Response(flux, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
