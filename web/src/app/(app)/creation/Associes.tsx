"use client";

import { useState } from "react";
import {
  CIVILITES,
  nomDeLaPartie,
  type Conjoint,
  type PersonneMorale,
  type PersonnePhysique,
} from "@/domain/formalite/etat-civil";
import type { Associe } from "@/domain/formalite/parcours";
import { Adresse } from "./Adresse";
import { Choix } from "./Choix";
import { Champ, EtatCivil } from "./EtatCivil";
import { RechercheSociete } from "./RechercheSociete";
import styles from "./Parcours.module.css";

/**
 * Les associés, en onglets.
 *
 * Reprise du bloc de public/creation.html : un onglet par associé, une pastille
 * verte quand il est renseigné, une croix au survol pour le retirer, et un bouton
 * en pointillés pour en ajouter. Un seul panneau à la fois - l'état civil complet
 * fait une quinzaine de champs, les empiler rendait l'étape illisible.
 *
 * L'état civil lui-même vit dans EtatCivil, partagé avec les dirigeants.
 */

interface Props {
  associes: Associe[];
  surChangement: (associes: Associe[]) => void;
  anomalies: Record<string, string>;
  /** « Actionnaire » pour une société par actions, « Associé » sinon. */
  mot: string;
}

export function Associes({ associes, surChangement, anomalies, mot }: Props) {
  const [actif, setActif] = useState(0);
  const rang = Math.min(actif, Math.max(associes.length - 1, 0));
  const associe = associes[rang];

  function remplacer(index: number, valeurs: Partial<Associe>) {
    surChangement(associes.map((a, i) => (i === index ? { ...a, ...valeurs } : a)));
  }

  function modifierPersonne(index: number, valeurs: Partial<PersonnePhysique>) {
    surChangement(
      associes.map((a, i) => (i === index ? { ...a, personne: { ...a.personne, ...valeurs } } : a))
    );
  }

  function modifierConjoint(index: number, valeurs: Partial<Conjoint>) {
    surChangement(
      associes.map((a, i) =>
        i === index
          ? { ...a, personne: { ...a.personne, conjoint: { ...a.personne?.conjoint, ...valeurs } } }
          : a
      )
    );
  }

  function modifierSociete(index: number, valeurs: Partial<PersonneMorale>) {
    surChangement(
      associes.map((a, i) => (i === index ? { ...a, societe: { ...a.societe, ...valeurs } } : a))
    );
  }

  function ajouter() {
    surChangement([...associes, { type: "physique", personne: {} }]);
    setActif(associes.length);
  }

  function retirer(index: number) {
    surChangement(associes.filter((_, i) => i !== index));
    setActif((r) => (r >= index && r > 0 ? r - 1 : r));
  }

  /** Un associé est « renseigné » dès qu'il porte un nom : la pastille le dit. */
  function renseigne(a: Associe): boolean {
    return nomDeLaPartie(a).trim().length > 0;
  }

  return (
    <div className={styles.full}>
      <div className={styles.onglets} role="tablist" aria-label={mot + "s"}>
        {associes.map((a, i) => (
          <span key={i} className={styles.ongletEnveloppe}>
            <button
              type="button"
              role="tab"
              id={"onglet-associe-" + i}
              aria-selected={i === rang}
              aria-controls={"panneau-associe-" + i}
              className={i === rang ? `${styles.onglet} ${styles.actif}` : styles.onglet}
              onClick={() => setActif(i)}
            >
              {renseigne(a) && <span className={styles.ongletPastille} aria-hidden="true" />}
              {nomDeLaPartie(a) || mot + " " + (i + 1)}
            </button>

            {/* Le dernier ne se retire pas : la société en exige au moins un. */}
            {associes.length > 1 && (
              <button
                type="button"
                className={styles.ongletFermer}
                aria-label={"Retirer " + (nomDeLaPartie(a) || "l'" + mot.toLowerCase() + " " + (i + 1))}
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
            )}
          </span>
        ))}

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
          Ajouter un {mot.toLowerCase()}
        </button>
      </div>

      {anomalies.associes && <p role="alert">{anomalies.associes}</p>}

      {associe && (
        <div
          className={styles.panneau}
          id={"panneau-associe-" + rang}
          role="tabpanel"
          aria-labelledby={"onglet-associe-" + rang}
        >
          <div className={styles.formGrid}>
            <Champ id={"type-" + rang} libelle="Type d'actionnaire">
              <Choix
                id={"type-" + rang}
                valeur={associe.type ?? "physique"}
                options={[
                  { valeur: "physique", libelle: "Personne physique" },
                  { valeur: "morale", libelle: "Personne morale" },
                ]}
                surChangement={(v) => remplacer(rang, { type: v as "physique" | "morale" })}
              />
            </Champ>

            {associe.type === "morale" ? (
              <Morale
                rang={rang}
                societe={associe.societe ?? {}}
                surChangement={(v) => modifierSociete(rang, v)}
                anomalie={anomalies["associes." + rang]}
              />
            ) : (
              <EtatCivil
                rang={rang}
                personne={associe.personne ?? {}}
                surChangement={(v) => modifierPersonne(rang, v)}
                surConjoint={(v) => modifierConjoint(rang, v)}
                anomalies={anomalies}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- L'associé personne morale ---------- */

function Morale({
  rang,
  societe,
  surChangement,
  anomalie,
}: {
  rang: number;
  societe: PersonneMorale;
  surChangement: (valeurs: Partial<PersonneMorale>) => void;
  anomalie?: string;
}) {
  return (
    <>
      {/* La recherche au registre remplit la fiche : recopier un SIREN et une
          adresse à la main est là où l'erreur se glisse. */}
      <div className={styles.full}>
        <RechercheSociete
          id={"recherche-" + rang}
          surSelection={(trouvee) => surChangement(trouvee)}
        />
      </div>

      <Champ
        id={"denomination-" + rang}
        libelle="Nom de la société"
        requis
        anomalie={anomalie}
      >
        <input
          id={"denomination-" + rang}
          value={societe.denomination ?? ""}
          onChange={(e) => surChangement({ denomination: e.target.value })}
        />
      </Champ>

      <Champ id={"formeMorale-" + rang} libelle="Type d'entreprise">
        <input
          id={"formeMorale-" + rang}
          placeholder="SAS, SARL..."
          value={societe.forme ?? ""}
          onChange={(e) => surChangement({ forme: e.target.value })}
        />
      </Champ>

      <Champ id={"siegeMorale-" + rang} libelle="Siège social" pleineLargeur>
        <Adresse
          id={"siegeMorale-" + rang}
          valeur={societe.adresse ?? ""}
          surChangement={(v) => surChangement({ adresse: v })}
          surCompletion={(codePostal, ville) => surChangement({ codePostal, ville })}
          placeholder="Adresse du siège"
        />
      </Champ>

      <Champ id={"capitalMorale-" + rang} libelle="Capital social">
        <span className={styles.suffix}>
          <input
            id={"capitalMorale-" + rang}
            inputMode="decimal"
            value={societe.capital ?? ""}
            onChange={(e) => surChangement({ capital: Number(e.target.value) || undefined })}
          />
          <span>€</span>
        </span>
      </Champ>

      <Champ id={"rcs-" + rang} libelle="Numéro RCS">
        <input
          id={"rcs-" + rang}
          value={societe.numeroRcs ?? ""}
          onChange={(e) => surChangement({ numeroRcs: e.target.value })}
        />
      </Champ>

      <Champ id={"villeRcs-" + rang} libelle="Ville d'immatriculation">
        <input
          id={"villeRcs-" + rang}
          value={societe.villeImmatriculation ?? ""}
          onChange={(e) => surChangement({ villeImmatriculation: e.target.value })}
        />
      </Champ>

      <Champ id={"siret-" + rang} libelle="Numéro SIRET">
        <input
          id={"siret-" + rang}
          inputMode="numeric"
          value={societe.siret ?? ""}
          onChange={(e) => surChangement({ siret: e.target.value.replace(/\s/g, "") })}
        />
      </Champ>

      <div className={`${styles.full} ${styles.conjoint}`}>
        <h3 className={styles.conjointTitre}>Représentant légal</h3>

        <div className={styles.formGrid}>
          <Champ id={"repCivilite-" + rang} libelle="Civilité">
            <Choix
              id={"repCivilite-" + rang}
              valeur={societe.representant?.civilite ?? ""}
              options={CIVILITES.map((c) => ({ valeur: c, libelle: c }))}
              surChangement={(v) =>
                surChangement({
                  representant: {
                    ...societe.representant,
                    civilite: (v || undefined) as PersonnePhysique["civilite"],
                  },
                })
              }
            />
          </Champ>

          <Champ id={"repPrenom-" + rang} libelle="Prénom">
            <input
              id={"repPrenom-" + rang}
              value={societe.representant?.prenom ?? ""}
              onChange={(e) =>
                surChangement({
                  representant: { ...societe.representant, prenom: e.target.value },
                })
              }
            />
          </Champ>

          <Champ id={"repNom-" + rang} libelle="Nom">
            <input
              id={"repNom-" + rang}
              value={societe.representant?.nom ?? ""}
              onChange={(e) =>
                surChangement({
                  representant: { ...societe.representant, nom: e.target.value },
                })
              }
            />
          </Champ>
        </div>
      </div>
    </>
  );
}
