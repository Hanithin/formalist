"use client";

import { useState } from "react";
import { nomComplet, nomDeLaPartie, type Conjoint, type PersonnePhysique } from "@/domain/formalite/etat-civil";
import {
  associesProposables,
  REGIMES_SOCIAUX,
  REMUNERATIONS,
  type Associe,
  type Dirigeant,
} from "@/domain/formalite/parcours";
import { Choix } from "./Choix";
import { Champ, EtatCivil } from "./EtatCivil";
import styles from "./Parcours.module.css";

/**
 * Les dirigeants, en onglets comme les associés.
 *
 * Le premier champ reprend le select du formulaire d'origine : la liste des
 * associés déjà saisis, puis « Autre personne ». Reprendre un associé évite de
 * retaper quinze champs d'état civil, et garantit surtout que les deux actes -
 * statuts et procès-verbal de nomination - portent le même état civil.
 *
 * Un associé déjà désigné disparaît de la liste des autres dirigeants : la même
 * personne ne peut pas être à la fois présidente et directrice générale. C'est la
 * règle que refreshDirigeantSelects() appliquait dans dirigeants.js.
 */

interface Props {
  /** Le mot juste selon la forme : « Président », « Gérant ». */
  libelle: string;
  dirigeants: Dirigeant[];
  associes: Associe[];
  surChangement: (dirigeants: Dirigeant[]) => void;
  anomalies: Record<string, string>;
}

const AUTRE = "autre";

export function Dirigeants({ libelle, dirigeants, associes, surChangement, anomalies }: Props) {
  const [actif, setActif] = useState(0);
  const rang = Math.min(actif, Math.max(dirigeants.length - 1, 0));
  const dirigeant = dirigeants[rang];

  /** Le nom affiché d'un dirigeant : le sien, ou celui de l'associé repris. */
  function nomDu(d: Dirigeant): string {
    if (d.associe !== undefined) {
      const associe = associes[d.associe];
      return associe ? nomDeLaPartie(associe) : "";
    }
    return nomComplet(d.personne ?? {});
  }

  function remplacer(index: number, valeurs: Partial<Dirigeant>) {
    surChangement(dirigeants.map((d, i) => (i === index ? { ...d, ...valeurs } : d)));
  }

  function modifierPersonne(index: number, valeurs: Partial<PersonnePhysique>) {
    surChangement(
      dirigeants.map((d, i) =>
        i === index ? { ...d, personne: { ...d.personne, ...valeurs } } : d
      )
    );
  }

  function modifierConjoint(index: number, valeurs: Partial<Conjoint>) {
    surChangement(
      dirigeants.map((d, i) =>
        i === index
          ? { ...d, personne: { ...d.personne, conjoint: { ...d.personne?.conjoint, ...valeurs } } }
          : d
      )
    );
  }

  /**
   * Le choix d'origine du dirigeant courant.
   *
   * Passer d'un associé à « Autre personne » efface le rang mais garde l'état
   * civil déjà saisi, s'il y en avait : on ne perd pas une saisie sur un
   * changement de menu.
   */
  function choisir(index: number, valeur: string) {
    if (valeur === AUTRE) {
      remplacer(index, { associe: undefined });
      return;
    }
    if (valeur === "") {
      remplacer(index, { associe: undefined, personne: {} });
      return;
    }
    remplacer(index, { associe: Number(valeur) });
  }

  function ajouter() {
    surChangement([...dirigeants, { personne: {} }]);
    setActif(dirigeants.length);
  }

  function retirer(index: number) {
    surChangement(dirigeants.filter((_, i) => i !== index));
    setActif((r) => (r >= index && r > 0 ? r - 1 : r));
  }

  return (
    <div className={styles.full}>
      <div className={styles.onglets} role="tablist" aria-label={libelle + "s"}>
        {dirigeants.map((d, i) => {
          const nom = nomDu(d);

          return (
            <span key={i} className={styles.ongletEnveloppe}>
              <button
                type="button"
                role="tab"
                id={"onglet-dirigeant-" + i}
                aria-selected={i === rang}
                aria-controls={"panneau-dirigeant-" + i}
                className={i === rang ? `${styles.onglet} ${styles.actif}` : styles.onglet}
                onClick={() => setActif(i)}
              >
                {nom && <span className={styles.ongletPastille} aria-hidden="true" />}
                {nom || libelle + " " + (i + 1)}
              </button>

              <button
                type="button"
                className={styles.ongletFermer}
                aria-label={"Retirer " + (nom || libelle.toLowerCase() + " " + (i + 1))}
                onClick={() => retirer(i)}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          );
        })}

        <button type="button" className={styles.ongletAjouter} onClick={ajouter}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Ajouter un {libelle.toLowerCase()}
        </button>
      </div>

      {anomalies.dirigeants && <p role="alert">{anomalies.dirigeants}</p>}

      {dirigeant && (
        <div
          className={styles.panneau}
          id={"panneau-dirigeant-" + rang}
          role="tabpanel"
          aria-labelledby={"onglet-dirigeant-" + rang}
        >
          <div className={styles.formGrid}>
            <Champ
              id={"choix-dirigeant-" + rang}
              libelle={"Qui est " + libelle.toLowerCase() + " ?"}
              requis
              anomalie={anomalies["dirigeants." + rang]}
            >
              <Choix
                id={"choix-dirigeant-" + rang}
                valeur={dirigeant.associe !== undefined ? String(dirigeant.associe) : AUTRE}
                placeholder="Sélectionner..."
                options={[
                  ...associesProposables(associes, dirigeants, rang).map((a) => ({
                    valeur: String(a.rang),
                    libelle: a.nom,
                  })),
                  { valeur: AUTRE, libelle: "Autre personne" },
                ]}
                surChangement={(v) => choisir(rang, v)}
              />
            </Champ>

            {/* Un associé repris n'a pas d'état civil à saisir : il est rappelé,
                et se corrige à l'étape « Société ». */}
            {dirigeant.associe !== undefined && (
              <div className={`${styles.full} ${styles.rappel}`}>
                <p>
                  L&apos;état civil de <strong>{nomDu(dirigeant) || "cet associé"}</strong> est
                  celui saisi à l&apos;étape « Société ». Modifiez-le là-bas pour qu&apos;il change
                  partout.
                </p>
              </div>
            )}

            {dirigeant.associe === undefined && (
              <EtatCivil
                rang={rang}
                personne={dirigeant.personne ?? {}}
                surChangement={(v) => modifierPersonne(rang, v)}
                surConjoint={(v) => modifierConjoint(rang, v)}
                anomalies={anomalies}
                prefixe={"dirigeants." + rang}
              />
            )}

            <Champ id={"remuneration-" + rang} libelle="Rémunération">
              <Choix
                id={"remuneration-" + rang}
                valeur={dirigeant.remuneration ?? ""}
                options={REMUNERATIONS.map((r) => ({ valeur: r, libelle: r }))}
                surChangement={(v) =>
                  remplacer(rang, { remuneration: (v || undefined) as Dirigeant["remuneration"] })
                }
              />
            </Champ>

            <Champ id={"regimeSocial-" + rang} libelle="Régime social">
              <Choix
                id={"regimeSocial-" + rang}
                valeur={dirigeant.regimeSocial ?? ""}
                options={REGIMES_SOCIAUX.map((r) => ({ valeur: r, libelle: r }))}
                surChangement={(v) =>
                  remplacer(rang, { regimeSocial: (v || undefined) as Dirigeant["regimeSocial"] })
                }
              />
            </Champ>
          </div>
        </div>
      )}
    </div>
  );
}
