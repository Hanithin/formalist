"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  JOURS,
  RACCOURCIS,
  DUREES_CRENEAU,
  parJournee,
} from "@/domain/consultation/disponibilites";
import { recouvre, type Periode } from "@/domain/consultation/absences";
import { CalendrierDePlage, aujourdHui } from "./CalendrierDePlage";
import styles from "./Disponibilites.module.css";

export interface PlagePubliee {
  id: number;
  jourSemaine: number;
  debut: string;
  fin: string;
  dureeCreneauMinutes: number;
}

export interface AbsencePubliee {
  id: number;
  debut: string;
  fin: string;
  motif: string | null;
}

function Poubelle() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    </svg>
  );
}

function Croix() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="20"
      height="20"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function dateLisible(jour: string): string {
  const d = new Date(jour + "T00:00:00");
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

/**
 * Les disponibilités de l'avocat : ses plages hebdomadaires et ses absences.
 *
 * Ce sont elles qui font exister les créneaux proposés au client. Un avocat qui n'a
 * rien publié n'apparaît nulle part dans la prise de rendez-vous - c'est volontaire,
 * mais cela veut dire que cette page est le seul endroit d'où il devient visible.
 */
export function Disponibilites({
  plages,
  absences,
}: {
  plages: PlagePubliee[];
  absences: AbsencePubliee[];
}) {
  const router = useRouter();
  const [fenetre, setFenetre] = useState<"plage" | "absence" | null>(null);
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  // Formulaire des plages
  const [joursChoisis, setJoursChoisis] = useState<number[]>([1]);
  const [debut, setDebut] = useState("09:00");
  const [fin, setFin] = useState("18:00");
  const [duree, setDuree] = useState(30);

  // Formulaire des absences
  const [periode, setPeriode] = useState<Periode | null>(null);
  const [motif, setMotif] = useState("");

  const posees: Periode[] = absences.map((a) => ({ debut: a.debut, fin: a.fin }));

  const journees = parJournee(plages);

  function ouvrir(quoi: "plage" | "absence") {
    setErreur(null);
    setFenetre(quoi);
  }

  async function envoyer(corps: unknown): Promise<string | null> {
    const reponse = await fetch("/api/avocat/disponibilites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
    if (reponse.ok) return null;

    const donnees = await reponse.json().catch(() => ({}));
    return (donnees.error as string) ?? "L'enregistrement n'a pas abouti.";
  }

  function ajouterPlages() {
    if (joursChoisis.length === 0) {
      setErreur("Choisissez au moins un jour.");
      return;
    }

    demarrer(async () => {
      setErreur(null);
      /*
       * Les jours partent un par un, et le premier refus arrête tout : ajouter
       * partiellement en signalant une erreur laisserait l'avocat sans savoir ce qui
       * a été publié et ce qui ne l'a pas été.
       */
      for (const jour of joursChoisis) {
        const message = await envoyer({
          quoi: "plage",
          jourSemaine: jour,
          debut,
          fin,
          dureeCreneauMinutes: duree,
        });
        if (message) {
          setErreur(message);
          router.refresh();
          return;
        }
      }
      setFenetre(null);
      router.refresh();
    });
  }

  function ajouterAbsence() {
    if (!periode) {
      setErreur("Choisissez une période dans le calendrier.");
      return;
    }
    if (recouvre(periode, posees)) {
      /*
       * Deux absences superposées bloquent les mêmes journées sans dommage, mais la
       * liste devient illisible et on ne sait plus laquelle retirer pour redevenir
       * disponible.
       */
      setErreur("Cette période en recouvre une déjà posée.");
      return;
    }

    demarrer(async () => {
      setErreur(null);
      const message = await envoyer({
        quoi: "absence",
        debut: periode.debut,
        fin: periode.fin,
        motif: motif.trim() || undefined,
      });
      if (message) {
        setErreur(message);
        return;
      }
      setFenetre(null);
      setPeriode(null);
      setMotif("");
      router.refresh();
    });
  }

  function retirer(quoi: "plage" | "absence", identifiant: number) {
    demarrer(async () => {
      await fetch("/api/avocat/disponibilites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoi, identifiant }),
      });
      router.refresh();
    });
  }

  return (
    <>
      <div className={styles.grille}>
        <section className={styles.colonne}>
          <div className={styles.colonneTete}>
            <h2>Créneaux hebdomadaires</h2>
            <p>
              Définissez vos heures de présence par jour de la semaine. Les clients réservent dans
              ces créneaux, et vous n&apos;apparaissez pas tant qu&apos;aucun n&apos;est publié.
            </p>
          </div>

          {journees.length === 0 ? (
            <div className={styles.vide}>
              Aucun créneau défini.
              <span className={styles.videSous}>Ajoutez vos heures de présence par jour.</span>
            </div>
          ) : (
            journees.map((journee) => (
              <div className={styles.groupeJour} key={journee.jour}>
                <div className={styles.nomJour}>{journee.nom}</div>
                {journee.plages.map((p) => (
                  <div className={styles.plage} key={p.id}>
                    <span>
                      <span className={styles.heures}>
                        {p.debut} - {p.fin}
                      </span>
                      <span className={styles.detail}>Créneaux de {p.dureeCreneauMinutes} min</span>
                    </span>
                    <button
                      type="button"
                      className={styles.supprimer}
                      onClick={() => retirer("plage", p.id)}
                      disabled={enCours}
                      aria-label={"Supprimer le créneau du " + journee.nom + " " + p.debut}
                    >
                      <Poubelle />
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}

          <button type="button" className={styles.ajouter} onClick={() => ouvrir("plage")}>
            + Ajouter un créneau
          </button>
        </section>

        <section className={styles.colonne}>
          <div className={styles.colonneTete}>
            <h2>Vacances et absences</h2>
            <p>Bloquez les périodes pendant lesquelles vous n&apos;êtes pas disponible.</p>
          </div>

          {absences.length === 0 ? (
            <div className={styles.vide}>Aucune absence programmée.</div>
          ) : (
            absences.map((a) => (
              <div className={styles.absence} key={a.id}>
                <span>
                  <span className={styles.dates}>
                    {dateLisible(a.debut)}
                    {a.debut !== a.fin ? " → " + dateLisible(a.fin) : ""}
                  </span>
                  {a.motif && <span className={styles.motif}>{a.motif}</span>}
                </span>
                <button
                  type="button"
                  className={styles.supprimer}
                  onClick={() => retirer("absence", a.id)}
                  disabled={enCours}
                  aria-label={"Supprimer l'absence du " + dateLisible(a.debut)}
                >
                  <Poubelle />
                </button>
              </div>
            ))
          )}

          <button type="button" className={styles.ajouter} onClick={() => ouvrir("absence")}>
            + Ajouter une absence
          </button>
        </section>
      </div>

      {fenetre === "plage" && (
        <div
          className={styles.voile}
          onClick={(e) => {
            if (e.target === e.currentTarget) setFenetre(null);
          }}
        >
          <div
            className={styles.fenetre}
            role="dialog"
            aria-modal="true"
            aria-label="Ajouter un créneau"
          >
            <div className={styles.fenetreTete}>
              <h2>Ajouter un créneau</h2>
              <button
                type="button"
                className={styles.fermer}
                onClick={() => setFenetre(null)}
                aria-label="Fermer"
              >
                <Croix />
              </button>
            </div>

            <div className={styles.fenetreCorps}>
              <div>
                <span className={styles.champLabel}>Jours concernés</span>
                <div className={styles.raccourcis}>
                  {RACCOURCIS.map((r) => (
                    <button
                      type="button"
                      key={r.cle}
                      className={styles.raccourci}
                      onClick={() => setJoursChoisis(r.jours)}
                    >
                      {r.libelle}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={styles.raccourci + " " + styles.effacer}
                    onClick={() => setJoursChoisis([])}
                  >
                    Effacer
                  </button>
                </div>

                <div className={styles.jours}>
                  {JOURS.map((j) => (
                    <button
                      type="button"
                      key={j.valeur}
                      className={
                        styles.jourPastille +
                        (joursChoisis.includes(j.valeur) ? " " + styles.jourChoisi : "")
                      }
                      aria-pressed={joursChoisis.includes(j.valeur)}
                      onClick={() =>
                        setJoursChoisis(
                          joursChoisis.includes(j.valeur)
                            ? joursChoisis.filter((v) => v !== j.valeur)
                            : [...joursChoisis, j.valeur]
                        )
                      }
                    >
                      {j.court}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.deuxChamps}>
                <div>
                  <label className={styles.champLabel} htmlFor="debut">
                    Début
                  </label>
                  <input
                    id="debut"
                    type="time"
                    className={styles.champ}
                    value={debut}
                    onChange={(e) => setDebut(e.target.value)}
                  />
                </div>
                <div>
                  <label className={styles.champLabel} htmlFor="fin">
                    Fin
                  </label>
                  <input
                    id="fin"
                    type="time"
                    className={styles.champ}
                    value={fin}
                    onChange={(e) => setFin(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className={styles.champLabel} htmlFor="duree">
                  Durée d&apos;un créneau
                </label>
                <select
                  id="duree"
                  className={styles.champ}
                  value={duree}
                  onChange={(e) => setDuree(Number(e.target.value))}
                >
                  {DUREES_CRENEAU.map((d) => (
                    <option key={d} value={d}>
                      {d} minutes
                    </option>
                  ))}
                </select>
              </div>

              {erreur && (
                <p role="alert" className={styles.erreur}>
                  {erreur}
                </p>
              )}
            </div>

            <div className={styles.fenetrePied}>
              <button
                type="button"
                className={styles.action + " " + styles.actionSecondaire}
                onClick={() => setFenetre(null)}
                disabled={enCours}
              >
                Annuler
              </button>
              <button
                type="button"
                className={styles.action + " " + styles.actionPrincipale}
                onClick={ajouterPlages}
                disabled={enCours}
              >
                {enCours ? "Ajout en cours" : "Ajouter"}
              </button>
            </div>
          </div>
        </div>
      )}

      {fenetre === "absence" && (
        <div
          className={styles.voile}
          onClick={(e) => {
            if (e.target === e.currentTarget) setFenetre(null);
          }}
        >
          <div
            className={styles.fenetre}
            role="dialog"
            aria-modal="true"
            aria-label="Ajouter une absence"
          >
            <div className={styles.fenetreTete}>
              <h2>Ajouter une absence</h2>
              <button
                type="button"
                className={styles.fermer}
                onClick={() => setFenetre(null)}
                aria-label="Fermer"
              >
                <Croix />
              </button>
            </div>

            <div className={styles.fenetreCorps}>
              <CalendrierDePlage
                periode={periode}
                onChange={setPeriode}
                absences={posees}
                aujourdHui={aujourdHui()}
              />

              <div>
                <label className={styles.champLabel} htmlFor="motif">
                  Motif (facultatif)
                </label>
                <input
                  id="motif"
                  type="text"
                  className={styles.champ}
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  placeholder="Congés, formation…"
                  maxLength={200}
                />
              </div>

              {erreur && (
                <p role="alert" className={styles.erreur}>
                  {erreur}
                </p>
              )}
            </div>

            <div className={styles.fenetrePied}>
              <button
                type="button"
                className={styles.action + " " + styles.actionSecondaire}
                onClick={() => setFenetre(null)}
                disabled={enCours}
              >
                Annuler
              </button>
              <button
                type="button"
                className={styles.action + " " + styles.actionPrincipale}
                onClick={ajouterAbsence}
                disabled={enCours}
              >
                {enCours ? "Ajout en cours" : "Ajouter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
