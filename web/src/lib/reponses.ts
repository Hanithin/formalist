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
      return reponseErreur(e);
    }
  };
}
