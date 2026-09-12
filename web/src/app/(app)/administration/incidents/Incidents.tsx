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
      {/*
        Ce qu'on sait de l'ensemble, puis de quoi changer de vue.

        La page ouvrait sur deux pilules posées sous le titre, et rien d'autre : ni
        combien il y en a, ni depuis quand. Le résumé tient en une ligne et répond aux
        deux questions qu'on se pose en arrivant.
      */}
      <div className={styles.incidentsBarre}>
        <p className={styles.incidentsResume}>{resume(incidents, resolus)}</p>

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
      </div>

      {incidents.length === 0 ? (
        <div className={styles.incidentsVide}>
          <div className={styles.incidentsVideIcone} aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h2 className={styles.incidentsVideTitre}>
            {resolus ? "Rien de classé pour l'instant" : "Rien à signaler"}
          </h2>
          <p className={styles.incidentsVideTexte}>
            {resolus
              ? "Les pannes que vous marquerez réglées viendront ici, avec leur compteur - c'est lui qui dira si la correction a tenu."
              : "Aucune erreur rapportée par le serveur. Les pannes arrivent ici d'elles-mêmes, groupées par cause."}
          </p>
        </div>
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
                  {/* Le chemin prend la ligne : serré en colonne, il se coupait au
                      milieu d'un mot - « /statuts/d epot ». */}
                  <p className={styles.incidentChemin}>
                    {incident.methode ? incident.methode + " " : ""}
                    {incident.chemin ?? "-"}
                  </p>

                  <dl className={styles.incidentFaits}>
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

/**
 * Ce qu'on veut savoir avant de lire la liste.
 *
 * Combien, et depuis quand : deux questions, une ligne. Le décompte des occurrences
 * compte davantage que celui des lignes - trois pannes vues deux mille fois ne sont pas
 * trois incidents isolés.
 */
function resume(incidents: IncidentAffiche[], resolus: boolean): string {
  if (incidents.length === 0) return resolus ? "Aucune panne classée" : "Aucune panne ouverte";

  const pannes = incidents.length === 1 ? "1 panne" : incidents.length + " pannes";
  const fois = incidents.reduce((total, i) => total + i.occurrences, 0);
  const compte = fois === incidents.length ? "" : ", " + fois + " occurrences";

  if (resolus) return pannes + compte + " - classées";
  return pannes + compte + " - la plus récente " + depuis(incidents[0].derniereLe);
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
