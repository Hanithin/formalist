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
  /**
   * Appelé quand une proposition est retenue, pour remplir le CP et la ville.
   *
   * La voie est rendue une seconde fois, en troisième argument. Retenir une
   * proposition déclenche deux appels dans le même cycle - la voie, puis le couple
   * code postal et ville - et un écran qui compose son état à partir d'une valeur
   * capturée verrait le second effacer le premier. Recevoir la voie ici permet de
   * tout écrire en une fois. Les écrans qui mettent à jour par fonction peuvent
   * l'ignorer, comme avant.
   */
  surCompletion?: (codePostal: string, ville: string, voie: string) => void;
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

  /*
   * Le champ, pour savoir s'il a encore le focus quand la réponse arrive.
   *
   * La liste s'ouvrait au retour de la requête, trois cents millisecondes après la
   * frappe - c'est-à-dire souvent après qu'on a quitté le champ. Elle se rouvrait donc
   * sur un champ qu'on venait de laisser, et plus rien ne la refermait : le `blur` avait
   * déjà eu lieu. Elle recouvrait la ligne suivante du formulaire, et le clic qu'on
   * destinait au champ d'après tombait sur une proposition d'adresse.
   */
  const champ = useRef<HTMLInputElement>(null);

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
        /* Parti ailleurs entre-temps : on ne rouvre pas une liste qu'il ne regarde plus. */
        if (document.activeElement !== champ.current) return;
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
    surCompletion?.(proposition.codePostal, proposition.ville, proposition.voie);
    setOuvert(false);
    setPropositions([]);
  }

  return (
    <div className={styles.completion}>
      <input
        ref={champ}
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
 * Une adresse complète dans un seul champ.
 *
 * C'est la forme qu'un acte emploie : « demeurant 4 rue des Lilas, 95370
 * Montigny-lès-Cormeilles ». Le composant nu rend la voie d'un côté et le code postal
 * de l'autre, ce qui suppose deux champs pour les recevoir. Là où il n'y en a qu'un -
 * l'adresse d'un cessionnaire, le siège d'un associé personne morale, celle d'un
 * apporteur - le complément était jeté : on retenait une proposition entière et le
 * champ n'en gardait que la rue.
 *
 * Ces adresses-là partaient donc dans les actes sans code postal ni commune, ou
 * saisies à la main avec ce que cela suppose d'écarts entre les deux.
 */
export function AdresseUneLigne({
  id,
  valeur,
  surChangement,
  placeholder,
}: {
  id: string;
  valeur: string;
  surChangement: (adresse: string) => void;
  placeholder?: string;
}) {
  /*
   * La voie que l'on vient de retenir.
   *
   * Les deux rappels du composant nu se suivent dans le même cycle : quand la
   * complétion arrive, `valeur` porte encore l'adresse d'avant. On garde donc la voie
   * au passage plutôt que de la relire d'un état qui n'est pas à jour.
   */
  const derniereVoie = useRef(valeur);

  return (
    <Adresse
      id={id}
      valeur={valeur}
      placeholder={placeholder}
      surChangement={(voie) => {
        derniereVoie.current = voie;
        surChangement(voie);
      }}
      surCompletion={(codePostal, ville) => {
        const fin = [codePostal, ville].filter(Boolean).join(" ");
        surChangement([derniereVoie.current.trim(), fin].filter(Boolean).join(", "));
      }}
    />
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
  /**
   * Le code postal de la commune retenue, et son nom en second argument.
   *
   * Comme pour l'adresse : retenir une commune déclenche deux appels dans le même
   * cycle, et un écran qui compose son état à partir d'une valeur capturée voyait le
   * second effacer le premier - on choisissait « Villeurbanne », le code postal
   * arrivait, et le nom restait celui qu'on avait tapé à moitié.
   */
  surCompletion?: (codePostal: string, ville: string) => void;
}) {
  const [communes, setCommunes] = useState<{ nom: string; codePostal: string }[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const assezLong = valeur.trim().length >= MINIMUM;
  // Comme pour l'adresse : la liste ne s'ouvre que sur une frappe.
  const frappe = useRef(false);
  /* Et, comme pour l'adresse, seulement si le champ a encore le focus au retour. */
  const champ = useRef<HTMLInputElement>(null);

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
        if (document.activeElement !== champ.current) return;
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
        ref={champ}
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
                  if (c.codePostal) surCompletion?.(c.codePostal, c.nom);
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
