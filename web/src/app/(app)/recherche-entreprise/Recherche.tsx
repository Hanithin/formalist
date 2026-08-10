"use client";

import { useState, useTransition } from "react";
import styles from "./Recherche.module.css";

interface Societe {
  siren: string;
  denomination: string | null;
  forme: string | null;
  capital: number | null;
  representants: unknown[];
}

interface Representant {
  nom?: string;
  prenoms?: string;
  qualite?: string;
}

export function Recherche() {
  const [societe, setSociete] = useState<Societe | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function chercher(donnees: FormData) {
    const siren = String(donnees.get("siren") ?? "").replace(/\s/g, "");
    setErreur(null);
    setSociete(null);

    demarrer(async () => {
      const reponse = await fetch("/api/societe/" + encodeURIComponent(siren));
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setErreur(corps.error ?? "La consultation n'a pas abouti");
        return;
      }
      setSociete(corps.societe);
    });
  }

  return (
    <>
      <form action={chercher} className={styles.formulaire}>
        <label htmlFor="siren">Numéro SIREN</label>
        <input
          id="siren"
          name="siren"
          inputMode="numeric"
          placeholder="9 chiffres"
          maxLength={11}
          required
        />
        <button type="submit" disabled={enCours}>
          {enCours ? "Consultation" : "Consulter"}
        </button>
      </form>

      {erreur && (
        <p role="alert" className={styles.erreur}>
          {erreur}
        </p>
      )}

      {societe && (
        <section className={styles.fiche}>
          <h2>{societe.denomination ?? "Société " + societe.siren}</h2>

          <dl className={styles.champs}>
            <div>
              <dt>SIREN</dt>
              <dd>{societe.siren}</dd>
            </div>
            <div>
              <dt>Forme juridique</dt>
              <dd>{societe.forme ?? "Non communiquée"}</dd>
            </div>
            <div>
              <dt>Capital social</dt>
              <dd>
                {societe.capital !== null
                  ? societe.capital.toLocaleString("fr-FR") + " euros"
                  : "Non communiqué"}
              </dd>
            </div>
          </dl>

          <h3>
            {societe.representants.length === 0
              ? "Aucun représentant communiqué"
              : societe.representants.length === 1
                ? "1 représentant"
                : societe.representants.length + " représentants"}
          </h3>

          {societe.representants.length > 0 && (
            <ul className={styles.representants}>
              {(societe.representants as Representant[]).map((r, i) => (
                <li key={i}>
                  <strong>
                    {[r.prenoms, r.nom].filter(Boolean).join(" ") || "Nom non communiqué"}
                  </strong>
                  {r.qualite && <span>{r.qualite}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
