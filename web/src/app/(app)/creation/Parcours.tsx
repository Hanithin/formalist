"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  verifierEtape,
  avancementParcours,
  type Brouillon,
  type Etape,
} from "@/domain/formalite/parcours";
import { FORMES_PROPOSEES, FORMES, regle } from "@/domain/formalite/formes";
import { piecesAttendues } from "@/domain/formalite/documents";
import { Pieces } from "./Pieces";
import styles from "./Parcours.module.css";

interface Props {
  dossierId: number;
  etapes: Etape[];
  etapeCourante: number;
  brouillonInitial: Brouillon;
  piecesDeposees: { type: string | null; nom: string }[];
}

/** La coche des étapes franchies. */
function Coche() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/** Un champ : son libellé, sa saisie, et son refus juste dessous. */
function Champ({
  id,
  libelle,
  requis = false,
  pleineLargeur = false,
  anomalie,
  children,
}: {
  id: string;
  libelle: string;
  requis?: boolean;
  pleineLargeur?: boolean;
  anomalie?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={pleineLargeur ? `${styles.field} ${styles.full}` : styles.field}>
      {/* L'astérisque est posée par le style, pas écrite dans le libellé : dans
          le texte, elle ferait partie du nom du champ. */}
      <label htmlFor={id} className={requis ? styles.requis : undefined}>
        {libelle}
      </label>
      {children}
      {anomalie && <p role="alert">{anomalie}</p>}
    </div>
  );
}

export function Parcours({
  dossierId,
  etapes,
  etapeCourante,
  brouillonInitial,
  piecesDeposees,
}: Props) {
  const [brouillon, setBrouillon] = useState(brouillonInitial);
  const [anomalies, setAnomalies] = useState<Record<string, string>>({});
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  const etape = etapes.find((e) => e.numero === etapeCourante) ?? etapes[0];
  const avancement = avancementParcours(brouillon);

  function modifier(champ: keyof Brouillon, valeur: unknown) {
    setBrouillon((actuel) => ({ ...actuel, [champ]: valeur }));
  }

  async function enregistrer(suite: number) {
    // Les règles sont vérifiées ici pour l'affichage immédiat, et à nouveau côté
    // serveur : ce qui arrive du navigateur n'est jamais cru sur parole.
    const manques = verifierEtape(etape.numero, brouillon);
    if (manques.length > 0 && suite > etape.numero) {
      setAnomalies(Object.fromEntries(manques.map((a) => [a.champ, a.message])));
      return;
    }
    setAnomalies({});

    demarrer(async () => {
      await fetch("/api/formalites/brouillon", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier: dossierId, modifications: brouillon }),
      });
      router.push("/creation?dossier=" + dossierId + "&etape=" + suite);
      router.refresh();
    });
  }

  const titreDirigeant = regle(brouillon.forme)?.titreDirigeant ?? "Dirigeant";

  return (
    <>
      {/* Les segments sont des frères des étapes, pas leurs enfants : c'est eux
          qui absorbent la largeur restante entre deux pastilles. */}
      <nav className={styles.stepper} aria-label="Étapes du parcours">
        {etapes.map((e, i) => {
          const franchie = e.numero < etape.numero;
          const courante = e.numero === etape.numero;
          const ton = courante ? styles.active : franchie ? styles.done : "";

          return (
            <Fragment key={e.numero}>
              <div className={`${styles.step} ${ton}`} aria-current={courante ? "step" : undefined}>
                <span className={styles.stepCircle}>{franchie ? <Coche /> : e.numero}</span>
                <span className={styles.stepLabel}>{e.titre}</span>
              </div>
              {i < etapes.length - 1 && (
                <span
                  className={franchie ? `${styles.stepSegment} ${styles.done}` : styles.stepSegment}
                  aria-hidden="true"
                />
              )}
            </Fragment>
          );
        })}
      </nav>

      <section className={styles.formCard}>
        <p className={styles.avancement}>{avancement}% renseigné</p>
        <h2>{etape.titre}</h2>
        <p className={styles.formDesc}>{etape.description}</p>

        <div className={styles.formGrid}>
          {etape.identifiant === "societe" && (
            <>
              <Champ id="forme" libelle="Forme juridique" requis anomalie={anomalies.forme}>
                <select
                  id="forme"
                  value={brouillon.forme ?? ""}
                  onChange={(e) => modifier("forme", e.target.value)}
                >
                  <option value="">Choisissez une forme</option>
                  {FORMES_PROPOSEES.map((f) => (
                    <option key={f} value={f}>
                      {FORMES[f].libelle} - {FORMES[f].description}
                    </option>
                  ))}
                </select>
              </Champ>

              <Champ
                id="denomination"
                libelle="Nom de la société"
                requis
                anomalie={anomalies.denomination}
              >
                <input
                  id="denomination"
                  value={brouillon.denomination ?? ""}
                  onChange={(e) => modifier("denomination", e.target.value)}
                />
              </Champ>

              <Champ
                id="activite"
                libelle="Activité"
                requis
                pleineLargeur
                anomalie={anomalies.activite}
              >
                <textarea
                  id="activite"
                  rows={3}
                  value={brouillon.activite ?? ""}
                  onChange={(e) => modifier("activite", e.target.value)}
                />
              </Champ>

              <Champ
                id="adresse"
                libelle="Adresse du siège"
                requis
                pleineLargeur
                anomalie={anomalies.adresse}
              >
                <input
                  id="adresse"
                  value={brouillon.adresse ?? ""}
                  onChange={(e) => modifier("adresse", e.target.value)}
                />
              </Champ>

              <Champ id="codePostal" libelle="Code postal" requis anomalie={anomalies.codePostal}>
                <input
                  id="codePostal"
                  inputMode="numeric"
                  maxLength={5}
                  value={brouillon.codePostal ?? ""}
                  onChange={(e) => modifier("codePostal", e.target.value.replace(/\D/g, ""))}
                />
              </Champ>

              <Champ id="ville" libelle="Ville" requis anomalie={anomalies.ville}>
                <input
                  id="ville"
                  value={brouillon.ville ?? ""}
                  onChange={(e) => modifier("ville", e.target.value)}
                />
              </Champ>
            </>
          )}

          {etape.identifiant === "associes" && (
            <Personnes
              libelle="Associé"
              avecApport
              personnes={brouillon.associes ?? []}
              surChangement={(v) => modifier("associes", v)}
              anomalies={anomalies}
            />
          )}

          {etape.identifiant === "dirigeants" && (
            <Personnes
              libelle={titreDirigeant}
              personnes={brouillon.dirigeants ?? []}
              surChangement={(v) => modifier("dirigeants", v)}
              anomalies={anomalies}
            />
          )}

          {etape.identifiant === "capital" && (
            <>
              <Champ id="capital" libelle="Capital social" requis anomalie={anomalies.capital}>
                <span className={styles.suffix}>
                  <input
                    id="capital"
                    inputMode="decimal"
                    value={brouillon.capital ?? ""}
                    onChange={(e) => modifier("capital", Number(e.target.value) || 0)}
                  />
                  <span>€</span>
                </span>
              </Champ>

              <Champ
                id="capitalLibere"
                libelle="Montant libéré à la constitution"
                requis
                anomalie={anomalies.libere}
              >
                <span className={styles.suffix}>
                  <input
                    id="capitalLibere"
                    inputMode="decimal"
                    value={brouillon.capitalLibere ?? ""}
                    onChange={(e) => modifier("capitalLibere", Number(e.target.value) || 0)}
                  />
                  <span>€</span>
                </span>
              </Champ>

              {anomalies.repartition && (
                <div className={`${styles.field} ${styles.full}`}>
                  <p role="alert">{anomalies.repartition}</p>
                </div>
              )}
            </>
          )}

          {etape.identifiant === "pieces" && (
            <div className={styles.full}>
              <Pieces
                dossierId={dossierId}
                pieces={piecesAttendues(brouillon.forme)}
                deposees={piecesDeposees}
              />
            </div>
          )}

          {etape.identifiant === "offre" && (
            <Champ id="offre" libelle="Offre" requis pleineLargeur anomalie={anomalies.offre}>
              <select
                id="offre"
                value={brouillon.offre ?? ""}
                onChange={(e) => modifier("offre", e.target.value)}
              >
                <option value="">Choisissez une offre</option>
                <option value="starter">Essentiel - documents générés et déposés</option>
                <option value="business">Accompagné - relecture par un avocat</option>
              </select>
            </Champ>
          )}
        </div>

        <div className={styles.formActions}>
          {etape.numero > 1 && (
            <button
              type="button"
              className={styles.btnBack}
              onClick={() => enregistrer(etape.numero - 1)}
              disabled={enCours}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Étape précédente
            </button>
          )}
          {etape.numero < etapes.length && (
            <button
              type="button"
              className={styles.btnNext}
              onClick={() => enregistrer(etape.numero + 1)}
              disabled={enCours}
            >
              {enCours ? "Enregistrement" : "Continuer"}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
        </div>
      </section>
    </>
  );
}

interface Personne {
  prenom?: string;
  nom?: string;
  apport?: number;
}

function Personnes({
  libelle,
  personnes,
  surChangement,
  anomalies,
  avecApport = false,
}: {
  libelle: string;
  personnes: Personne[];
  surChangement: (p: Personne[]) => void;
  anomalies: Record<string, string>;
  avecApport?: boolean;
}) {
  function modifier(index: number, champ: keyof Personne, valeur: string | number) {
    surChangement(personnes.map((p, i) => (i === index ? { ...p, [champ]: valeur } : p)));
  }

  return (
    <>
      {personnes.map((p, i) => (
        <fieldset key={i} className={styles.personne}>
          <legend>
            {libelle} {i + 1}
          </legend>

          <div className={styles.personneGrille}>
            <Champ id={"prenom-" + i} libelle="Prénom" requis>
              <input
                id={"prenom-" + i}
                value={p.prenom ?? ""}
                onChange={(e) => modifier(i, "prenom", e.target.value)}
              />
            </Champ>

            <Champ id={"nom-" + i} libelle="Nom" requis>
              <input
                id={"nom-" + i}
                value={p.nom ?? ""}
                onChange={(e) => modifier(i, "nom", e.target.value)}
              />
            </Champ>

            {avecApport && (
              <Champ id={"apport-" + i} libelle="Apport" requis>
                <span className={styles.suffix}>
                  <input
                    id={"apport-" + i}
                    inputMode="decimal"
                    value={p.apport ?? ""}
                    onChange={(e) => modifier(i, "apport", Number(e.target.value) || 0)}
                  />
                  <span>€</span>
                </span>
              </Champ>
            )}
          </div>

          <button
            type="button"
            className={styles.retirer}
            onClick={() => surChangement(personnes.filter((_, j) => j !== i))}
          >
            Retirer
          </button>

          {anomalies[(avecApport ? "associes." : "dirigeants.") + i] && (
            <p role="alert">{anomalies[(avecApport ? "associes." : "dirigeants.") + i]}</p>
          )}
        </fieldset>
      ))}

      {(anomalies.associes || anomalies.dirigeants) && (
        <div className={styles.full}>
          <p role="alert">{anomalies.associes ?? anomalies.dirigeants}</p>
        </div>
      )}

      <button
        type="button"
        className={styles.ajouter}
        onClick={() => surChangement([...personnes, {}])}
      >
        Ajouter un {libelle.toLowerCase()}
      </button>
    </>
  );
}
