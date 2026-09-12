"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "../Administration.module.css";

export interface IncidentAffiche {
  id: number;
  type: string;
  message: string;
  chemin: string | null;
  methode: string | null;
  origine: string | null;
  pile: string | null;
  occurrences: number;
  premiereLe: string;
  derniereLe: string;
  resoluLe: string | null;
}

/**
 * Le journal des pannes, tel qu'on le relit.
 *
 * Ce qu'on cherche en ouvrant cette page tient en trois questions : est-ce que ça dure,
 * est-ce que ça touche beaucoup de monde, et où est-ce que ça casse. Le compteur, la
 * dernière apparition et le chemin y répondent sur une ligne ; la pile, qui ne sert
 * qu'une fois qu'on a choisi laquelle regarder, attend qu'on la déplie.
 */
export function Incidents({
  incidents,
  resolus,
}: {
  incidents: IncidentAffiche[];
  resolus: boolean;
}) {
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function marquer(id: number, action: "resoudre" | "rouvrir") {
    demarrer(async () => {
      const reponse = await fetch("/api/administration/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incident: id, action }),
      });
      if (reponse.ok) router.refresh();
    });
  }

  return (
    <>
      <div className={styles.incidentsOnglets}>
        <Link
          href="/administration/incidents"
          className={resolus ? styles.incidentsOnglet : styles.incidentsOngletActif}
        >
          À regarder
        </Link>
        <Link
          href="/administration/incidents?voir=resolus"
          className={resolus ? styles.incidentsOngletActif : styles.incidentsOnglet}
        >
          Réglés
        </Link>
      </div>

      {incidents.length === 0 ? (
        <p className={styles.incidentsVide}>
          {resolus
            ? "Rien n'a encore été marqué réglé."
            : "Aucun incident. Le serveur n'a rien signalé depuis la dernière remise à zéro."}
        </p>
      ) : (
        <ul className={styles.incidents}>
          {incidents.map((incident) => (
            <li key={incident.id} className={styles.incident}>
              <div className={styles.incidentLigne}>
                <button
                  type="button"
                  className={styles.incidentTitre}
                  aria-expanded={ouvert === incident.id}
                  onClick={() => setOuvert(ouvert === incident.id ? null : incident.id)}
                >
                  <span className={styles.incidentType}>{incident.type}</span>
                  <span className={styles.incidentMessage}>{incident.message}</span>
                </button>

                <span className={styles.incidentCompte} title="Nombre d'occurrences">
                  {incident.occurrences === 1 ? "1 fois" : incident.occurrences + " fois"}
                </span>

                <span className={styles.incidentQuand}>{depuis(incident.derniereLe)}</span>

                <button
                  type="button"
                  className={styles.incidentGeste}
                  disabled={enCours}
                  onClick={() => marquer(incident.id, resolus ? "rouvrir" : "resoudre")}
                >
                  {resolus ? "Rouvrir" : "Marquer réglé"}
                </button>
              </div>

              {ouvert === incident.id && (
                <div className={styles.incidentDetail}>
                  <dl className={styles.incidentFaits}>
                    <div>
                      <dt>Chemin</dt>
                      <dd>
                        {incident.methode ? incident.methode + " " : ""}
                        {incident.chemin ?? "-"}
                      </dd>
                    </div>
                    <div>
                      <dt>Contexte</dt>
                      <dd>{incident.origine ?? "-"}</dd>
                    </div>
                    <div>
                      <dt>Première fois</dt>
                      <dd>{quand(incident.premiereLe)}</dd>
                    </div>
                    <div>
                      <dt>Dernière fois</dt>
                      <dd>{quand(incident.derniereLe)}</dd>
                    </div>
                  </dl>

                  {incident.pile ? (
                    <pre className={styles.incidentPile}>{incident.pile}</pre>
                  ) : (
                    <p className={styles.incidentSansPile}>
                      Aucune pile : la valeur lancée n&apos;était pas une erreur.
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** « il y a 3 h » : ce qu'on veut savoir d'abord, c'est si c'est encore vivant. */
function depuis(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return "il y a " + minutes + " min";
  const heures = Math.round(minutes / 60);
  if (heures < 24) return "il y a " + heures + " h";
  const jours = Math.round(heures / 24);
  return jours === 1 ? "hier" : "il y a " + jours + " j";
}

function quand(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(iso)
  );
}
