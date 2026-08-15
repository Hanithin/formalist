"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Adresse.module.css";

/**
 * Autocomplétion d'adresse sur la Base Adresse Nationale.
 *
 * api-adresse.data.gouv.fr : gratuite, sans clé, dédiée aux adresses françaises.
 * C'est le service que le formulaire d'origine appelait déjà (custom-controls.js) ;
 * la CSP l'autorise dans connect-src.
 *
 * Choisir une proposition remplit aussi le code postal et la ville : le siège
 * social est rejeté au greffe pour une commune qui ne correspond pas au code
 * postal, et le recopier à la main est justement là où l'erreur se glisse.
 */

interface Proposition {
  label: string;
  /** La voie seule : « 12 rue des Lilas », sans le code postal ni la commune. */
  voie: string;
  codePostal: string;
  ville: string;
}

const MINIMUM = 3;
const ATTENTE_MS = 250;

interface Props {
  id: string;
  valeur: string;
  surChangement: (voie: string) => void;
  /** Appelé quand une proposition est retenue, pour remplir le CP et la ville. */
  surCompletion?: (codePostal: string, ville: string) => void;
  placeholder?: string;
}

export function Adresse({ id, valeur, surChangement, surCompletion, placeholder }: Props) {
  const [propositions, setPropositions] = useState<Proposition[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [survole, setSurvole] = useState(-1);
  // Sous le seuil, la liste disparaît sans qu'on ait à la vider : l'état suit la
  // saisie plutôt que d'être remis à zéro depuis un effet.
  const assezLong = valeur.trim().length >= MINIMUM;

  /**
   * L'autocomplétion suit la frappe, jamais une valeur posée par le code.
   *
   * Sans cette distinction, remplir l'adresse depuis ailleurs - la recherche au
   * registre, ou le choix d'une proposition - rouvrait aussitôt la liste sur la
   * valeur qu'on venait d'écrire.
   */
  const frappe = useRef(false);

  useEffect(() => {
    if (!frappe.current) return;
    frappe.current = false;

    const terme = valeur.trim();
    if (terme.length < MINIMUM) return;

    // Une frappe par lettre ferait une requête par lettre : on attend la pause.
    const abandon = new AbortController();
    const minuteur = setTimeout(async () => {
      try {
        const reponse = await fetch(
          "https://api-adresse.data.gouv.fr/search/?q=" +
            encodeURIComponent(terme) +
            "&limit=6&autocomplete=1",
          { signal: abandon.signal }
        );
        if (!reponse.ok) return;

        const donnees: unknown = await reponse.json();
        const traits = (donnees as { features?: unknown[] }).features ?? [];

        setPropositions(
          traits.slice(0, 6).map((trait) => {
            const p = (trait as { properties?: Record<string, string> }).properties ?? {};
            const voie =
              p.name ?? [p.housenumber, p.street].filter(Boolean).join(" ");
            return {
              label: p.label ?? "",
              voie: voie || (p.label ?? ""),
              codePostal: p.postcode ?? "",
              ville: p.city ?? "",
            };
          })
        );
        setOuvert(true);
        setSurvole(-1);
      } catch {
        // Le service peut être indisponible : la saisie manuelle reste possible,
        // et un message d'erreur ici n'apporterait rien à qui tape son adresse.
      }
    }, ATTENTE_MS);

    return () => {
      clearTimeout(minuteur);
      abandon.abort();
    };
  }, [valeur]);

  function retenir(proposition: Proposition) {
    surChangement(proposition.voie);
    surCompletion?.(proposition.codePostal, proposition.ville);
    setOuvert(false);
    setPropositions([]);
  }

  return (
    <div className={styles.completion}>
      <input
        id={id}
        value={valeur}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={ouvert && assezLong && propositions.length > 0}
        aria-controls={id + "-propositions"}
        aria-autocomplete="list"
        onChange={(e) => {
          frappe.current = true;
          surChangement(e.target.value);
        }}
        onBlur={() => setOuvert(false)}
        onKeyDown={(e) => {
          if (!ouvert || !assezLong || propositions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSurvole((r) => (r + 1) % propositions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSurvole((r) => (r <= 0 ? propositions.length - 1 : r - 1));
          } else if (e.key === "Enter" && survole >= 0) {
            e.preventDefault();
            retenir(propositions[survole]);
          } else if (e.key === "Escape") {
            setOuvert(false);
          }
        }}
      />

      {ouvert && assezLong && propositions.length > 0 && (
        <ul className={styles.propositions} id={id + "-propositions"} role="listbox">
          {propositions.map((p, i) => (
            <li key={p.label + i} role="option" aria-selected={i === survole}>
              <button
                type="button"
                className={i === survole ? styles.propositionActive : styles.proposition}
                /* mousedown et non click : le blur du champ fermerait la liste
                   avant que le clic n'aboutisse. */
                onMouseDown={(e) => {
                  e.preventDefault();
                  retenir(p);
                }}
                onMouseEnter={() => setSurvole(i)}
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Autocomplétion de commune, sur l'API Découpage administratif.
 *
 * Elle sert quand on part de la ville plutôt que de l'adresse : le code postal
 * suit. Deux communes peuvent partager un nom, la liste montre donc le code.
 */
export function Ville({
  id,
  valeur,
  surChangement,
  surCompletion,
}: {
  id: string;
  valeur: string;
  surChangement: (ville: string) => void;
  surCompletion?: (codePostal: string) => void;
}) {
  const [communes, setCommunes] = useState<{ nom: string; codePostal: string }[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const assezLong = valeur.trim().length >= MINIMUM;
  // Comme pour l'adresse : la liste ne s'ouvre que sur une frappe.
  const frappe = useRef(false);

  useEffect(() => {
    if (!frappe.current) return;
    frappe.current = false;

    const terme = valeur.trim();
    if (terme.length < MINIMUM) return;

    const abandon = new AbortController();
    const minuteur = setTimeout(async () => {
      try {
        const reponse = await fetch(
          "https://geo.api.gouv.fr/communes?nom=" +
            encodeURIComponent(terme) +
            "&fields=nom,codesPostaux&limit=6",
          { signal: abandon.signal }
        );
        if (!reponse.ok) return;

        const donnees = (await reponse.json()) as { nom: string; codesPostaux?: string[] }[];
        setCommunes(
          donnees.map((c) => ({ nom: c.nom, codePostal: c.codesPostaux?.[0] ?? "" }))
        );
        setOuvert(true);
      } catch {
        // Service indisponible : la saisie manuelle reste possible.
      }
    }, ATTENTE_MS);

    return () => {
      clearTimeout(minuteur);
      abandon.abort();
    };
  }, [valeur]);

  return (
    <div className={styles.completion}>
      <input
        id={id}
        value={valeur}
        autoComplete="off"
        role="combobox"
        aria-expanded={ouvert && assezLong && communes.length > 0}
        aria-controls={id + "-communes"}
        aria-autocomplete="list"
        onChange={(e) => {
          frappe.current = true;
          surChangement(e.target.value);
        }}
        onBlur={() => setOuvert(false)}
      />

      {ouvert && assezLong && communes.length > 0 && (
        <ul className={styles.propositions} id={id + "-communes"} role="listbox">
          {communes.map((c, i) => (
            <li key={c.nom + i} role="option" aria-selected={false}>
              <button
                type="button"
                className={styles.proposition}
                onMouseDown={(e) => {
                  e.preventDefault();
                  surChangement(c.nom);
                  if (c.codePostal) surCompletion?.(c.codePostal);
                  setOuvert(false);
                  setCommunes([]);
                }}
              >
                {c.nom}
                {c.codePostal && <span className={styles.propositionCode}>{c.codePostal}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
