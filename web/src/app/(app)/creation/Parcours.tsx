"use client";

import { useState, useTransition } from "react";
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
    <div className={styles.parcours}>
      <ol className={styles.etapes}>
        {etapes.map((e) => (
          <li
            key={e.numero}
            className={e.numero === etape.numero ? styles.etapeActive : styles.etape}
            aria-current={e.numero === etape.numero ? "step" : undefined}
          >
            <span className={styles.numero}>{e.numero}</span>
            {e.titre}
          </li>
        ))}
      </ol>

      <section className={styles.contenu}>
        <p className={styles.avancement}>{avancement}% renseigné</p>
        <h2>{etape.titre}</h2>
        <p className={styles.description}>{etape.description}</p>

        {etape.identifiant === "societe" && (
          <div className={styles.champs}>
            <label htmlFor="forme">Forme juridique</label>
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
            {anomalies.forme && <p role="alert">{anomalies.forme}</p>}

            <label htmlFor="denomination">Nom de la société</label>
            <input
              id="denomination"
              value={brouillon.denomination ?? ""}
              onChange={(e) => modifier("denomination", e.target.value)}
            />
            {anomalies.denomination && <p role="alert">{anomalies.denomination}</p>}

            <label htmlFor="activite">Activité</label>
            <textarea
              id="activite"
              rows={3}
              value={brouillon.activite ?? ""}
              onChange={(e) => modifier("activite", e.target.value)}
            />
            {anomalies.activite && <p role="alert">{anomalies.activite}</p>}

            <label htmlFor="adresse">Adresse du siège</label>
            <input
              id="adresse"
              value={brouillon.adresse ?? ""}
              onChange={(e) => modifier("adresse", e.target.value)}
            />
            {anomalies.adresse && <p role="alert">{anomalies.adresse}</p>}

            <label htmlFor="codePostal">Code postal</label>
            <input
              id="codePostal"
              inputMode="numeric"
              maxLength={5}
              value={brouillon.codePostal ?? ""}
              onChange={(e) => modifier("codePostal", e.target.value.replace(/\D/g, ""))}
            />
            {anomalies.codePostal && <p role="alert">{anomalies.codePostal}</p>}

            <label htmlFor="ville">Ville</label>
            <input
              id="ville"
              value={brouillon.ville ?? ""}
              onChange={(e) => modifier("ville", e.target.value)}
            />
            {anomalies.ville && <p role="alert">{anomalies.ville}</p>}
          </div>
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
          <div className={styles.champs}>
            <label htmlFor="capital">Capital social, en euros</label>
            <input
              id="capital"
              inputMode="decimal"
              value={brouillon.capital ?? ""}
              onChange={(e) => modifier("capital", Number(e.target.value) || 0)}
            />
            {anomalies.capital && <p role="alert">{anomalies.capital}</p>}

            <label htmlFor="capitalLibere">Montant libéré à la constitution</label>
            <input
              id="capitalLibere"
              inputMode="decimal"
              value={brouillon.capitalLibere ?? ""}
              onChange={(e) => modifier("capitalLibere", Number(e.target.value) || 0)}
            />
            {anomalies.libere && <p role="alert">{anomalies.libere}</p>}
            {anomalies.repartition && <p role="alert">{anomalies.repartition}</p>}
          </div>
        )}

        {etape.identifiant === "pieces" && (
          <Pieces
            dossierId={dossierId}
            pieces={piecesAttendues(brouillon.forme)}
            deposees={piecesDeposees}
          />
        )}

        {etape.identifiant === "offre" && (
          <div className={styles.champs}>
            <label htmlFor="offre">Offre</label>
            <select
              id="offre"
              value={brouillon.offre ?? ""}
              onChange={(e) => modifier("offre", e.target.value)}
            >
              <option value="">Choisissez une offre</option>
              <option value="starter">Essentiel - documents générés et déposés</option>
              <option value="business">Accompagné - relecture par un avocat</option>
            </select>
            {anomalies.offre && <p role="alert">{anomalies.offre}</p>}
          </div>
        )}

        <div className={styles.actions}>
          {etape.numero > 1 && (
            <button type="button" onClick={() => enregistrer(etape.numero - 1)} disabled={enCours}>
              Étape précédente
            </button>
          )}
          {etape.numero < etapes.length && (
            <button
              type="button"
              className={styles.principal}
              onClick={() => enregistrer(etape.numero + 1)}
              disabled={enCours}
            >
              {enCours ? "Enregistrement" : "Continuer"}
            </button>
          )}
        </div>
      </section>
    </div>
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
    <div className={styles.champs}>
      {personnes.map((p, i) => (
        <fieldset key={i} className={styles.personne}>
          <legend>
            {libelle} {i + 1}
          </legend>

          <label htmlFor={"prenom-" + i}>{personnes.length > 1 ? "Prénom " + (i + 1) : "Prénom"}</label>
          <input
            id={"prenom-" + i}
            value={p.prenom ?? ""}
            onChange={(e) => modifier(i, "prenom", e.target.value)}
          />

          <label htmlFor={"nom-" + i}>{personnes.length > 1 ? "Nom " + (i + 1) : "Nom"}</label>
          <input
            id={"nom-" + i}
            value={p.nom ?? ""}
            onChange={(e) => modifier(i, "nom", e.target.value)}
          />

          {avecApport && (
            <>
              <label htmlFor={"apport-" + i}>
                {personnes.length > 1 ? "Apport " + (i + 1) + ", en euros" : "Apport, en euros"}
              </label>
              <input
                id={"apport-" + i}
                inputMode="decimal"
                value={p.apport ?? ""}
                onChange={(e) => modifier(i, "apport", Number(e.target.value) || 0)}
              />
            </>
          )}

          <button
            type="button"
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
        <p role="alert">{anomalies.associes ?? anomalies.dirigeants}</p>
      )}

      <button type="button" onClick={() => surChangement([...personnes, {}])}>
        Ajouter un {libelle.toLowerCase()}
      </button>
    </div>
  );
}
