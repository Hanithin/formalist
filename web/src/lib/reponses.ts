import { NextResponse } from "next/server";
import { journal } from "./journal";

/**
 * Traduction des erreurs en réponses HTTP.
 *
 * Les erreurs métier portent leur statut ; tout le reste devient un 500 dont le
 * détail reste dans le journal. Une trace d'exécution renvoyée au navigateur
 * renseigne sur la structure du code et parfois sur le contenu de la base.
 */

interface ErreurPortantUnStatut {
  statut: number;
  message: string;
  details?: Record<string, string[]>;
}

function porteUnStatut(e: unknown): e is ErreurPortantUnStatut {
  return (
    typeof e === "object" &&
    e !== null &&
    "statut" in e &&
    typeof (e as { statut: unknown }).statut === "number"
  );
}

export function reponseErreur(e: unknown): NextResponse {
  if (porteUnStatut(e)) {
    return NextResponse.json(
      e.details ? { error: e.message, details: e.details } : { error: e.message },
      { status: e.statut }
    );
  }

  journal.error({ err: e }, "Erreur non prévue");
  return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
}

/**
 * Ce que le serveur a rattrapé n'arrive jamais jusqu'à Next.
 *
 * `onRequestError` reçoit les erreurs que Next voit passer ; celles-ci n'en font pas
 * partie, puisque la route les transforme en réponse 500 avant de rendre la main. Sans
 * cette ligne, la moitié des pannes - celles de l'API, c'est-à-dire les plus
 * nombreuses - resteraient invisibles.
 *
 * Le journal des incidents vit dans l'infrastructure, que ce module n'a pas le droit
 * d'atteindre - et c'est une bonne règle : `reponses.ts` est tiré par toutes les
 * routes, y compris celles qui ne touchent jamais la base. C'est donc le démarrage du
 * serveur qui vient brancher le rapporteur ici, et non l'inverse.
 */
type Rapporteur = (e: unknown, requete: Request | undefined) => Promise<void> | void;

/*
 * Le rapporteur se pose sur globalThis, et non dans une variable de ce module.
 *
 * Next compile l'instrumentation et les routes en deux graphes distincts : le module
 * `reponses` chargé au démarrage n'est pas celui qu'exécutent les routes, et une
 * variable de module posée dans l'un reste nulle dans l'autre. On l'a vérifié - les
 * erreurs de rendu arrivaient au journal, celles de l'API non.
 *
 * `Symbol.for` donne la même clé dans tous les registres du processus, ce qui est
 * exactement ce dont on a besoin : un point de rendez-vous, sans import qui
 * traverserait la frontière entre `lib` et l'infrastructure.
 */
const RAPPORTEUR = Symbol.for("formalist.rapporteurDIncident");

type Hote = Record<symbol, unknown>;

export function brancherLeRapporteur(fonction: Rapporteur): void {
  (globalThis as unknown as Hote)[RAPPORTEUR] = fonction;
}

async function consigner(e: unknown, requete: Request | undefined) {
  const rapporteur = (globalThis as unknown as Hote)[RAPPORTEUR];
  if (typeof rapporteur !== "function") return;
  try {
    await (rapporteur as Rapporteur)(e, requete);
  } catch {
    /* Le journal de sortie porte déjà l'erreur d'origine, écrite juste au-dessus. */
  }
}

/**
 * Enveloppe un gestionnaire de route.
 *
 * Sans elle, chaque route devrait entourer son corps d'un try/catch, et celle qui
 * l'oublierait renverrait 500 là où il faut 401 - en laissant fuir la trace.
 */
export function route<T extends unknown[]>(
  gestionnaire: (...args: T) => Promise<NextResponse>
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      return await gestionnaire(...args);
    } catch (e) {
      /* Les erreurs métier portent un statut : un 401 ou un 409 est une réponse, non une
         panne, et remplirait le journal de ce qui fonctionne comme prévu. */
      if (!porteUnStatut(e)) {
        const requete = args.find((a): a is Request => a instanceof Request);
        await consigner(e, requete);
      }
      return reponseErreur(e);
    }
  };
}
