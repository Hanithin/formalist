"use client";

import { useEffect, useRef, useState } from "react";
import type { PersonneMorale } from "@/domain/formalite/etat-civil";
import styles from "./Parcours.module.css";

/**
 * Recherche d'une société au registre, pour un associé personne morale.
 *
 * Deux sources, comme dans le formulaire d'origine :
 *
 *   - recherche-entreprises.api.gouv.fr donne le nom, le SIREN, le siège, la
 *     nature juridique et les dirigeants. Gratuite, sans clé, appelée depuis le
 *     navigateur - la CSP l'autorise.
 *   - le capital n'y figure pas : il vient de notre proxy INPI (/api/societe/:siren),
 *     qui exige un compte connecté pour ne pas devenir un relais gratuit.
 *
 * Recopier un SIREN, une adresse et un capital à la main dans des statuts est
 * exactement là où l'erreur se glisse, et elle se paie au greffe.
 */

/** Les codes de nature juridique de l'INSEE, tels que la page d'origine les traduisait. */
const FORMES_JURIDIQUES: Record<string, string> = {
  "5710": "SAS",
  "5720": "SASU",
  "5499": "SARL",
  "5498": "EURL",
  "5410": "SA",
  "5415": "SA",
  "5422": "SA",
  "5430": "SA",
  "5505": "SA",
  "5510": "SA",
  "5515": "SA",
  "5520": "SA",
  "5530": "SA",
  "5599": "SA",
  "6540": "SCI",
  "6533": "SCI",
  "6534": "SCI",
  "6532": "SCI",
  "6521": "SCPI",
  "6585": "SC",
  "6588": "SC",
  "5202": "SNC",
  "5306": "SCS",
  "5307": "SCA",
  "5385": "SELARL",
  "5470": "SELAFA",
  "5485": "SELAS",
  "5460": "SCP",
  "5480": "SELCA",
  "6220": "GIE",
  "5370": "SE",
};

const MINIMUM = 3;
const ATTENTE_MS = 280;

interface Dirigeant {
  nom?: string;
  prenoms?: string;
  qualite?: string;
  type_dirigeant?: string;
}

interface Resultat {
  siren?: string;
  nom_complet?: string;
  nom_raison_sociale?: string;
  nature_juridique?: string;
  dirigeants?: Dirigeant[];
  siege?: {
    siret?: string;
    adresse?: string;
    code_postal?: string;
    libelle_commune?: string;
  };
}

/**
 * Le représentant légal parmi les dirigeants publiés.
 *
 * On privilégie le président ou le gérant : c'est le représentant au sens
 * statutaire, et c'est lui qui signera pour la société.
 */
function representantDe(dirigeants: Dirigeant[] = []) {
  const physiques = dirigeants.filter((d) =>
    (d.type_dirigeant ?? "").toLowerCase().includes("physique")
  );
  const legal =
    physiques.find((d) => /pr[ée]sident|g[ée]rant|repr[ée]sentant\s+l[ée]gal/i.test(d.qualite ?? "")) ??
    physiques[0];

  if (!legal) return undefined;
  return { prenom: legal.prenoms?.trim(), nom: legal.nom?.trim() };
}

export function RechercheSociete({
  id,
  surSelection,
}: {
  id: string;
  surSelection: (societe: Partial<PersonneMorale>) => void;
}) {
  const [terme, setTerme] = useState("");
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const choisi = useRef(false);
  const assezLong = terme.trim().length >= MINIMUM;

  useEffect(() => {
    if (choisi.current) {
      choisi.current = false;
      return;
    }
    if (terme.trim().length < MINIMUM) return;

    const abandon = new AbortController();
    const minuteur = setTimeout(async () => {
      try {
        const reponse = await fetch(
          "https://recherche-entreprises.api.gouv.fr/search?q=" +
            encodeURIComponent(terme.trim()) +
            "&per_page=6&page=1",
          { signal: abandon.signal }
        );
        if (!reponse.ok) return;

        const donnees = (await reponse.json()) as { results?: Resultat[] };
        setResultats(donnees.results ?? []);
        setOuvert(true);
      } catch {
        // Registre injoignable : les champs restent saisissables à la main.
      }
    }, ATTENTE_MS);

    return () => {
      clearTimeout(minuteur);
      abandon.abort();
    };
  }, [terme]);

  async function retenir(resultat: Resultat) {
    choisi.current = true;
    const nom = resultat.nom_complet ?? resultat.nom_raison_sociale ?? "";
    const siege = resultat.siege ?? {};

    setTerme(nom);
    setOuvert(false);
    setResultats([]);
    setMessage(null);

    surSelection({
      denomination: nom,
      // La forme est réécrite même vide : sinon celle d'une société précédemment
      // choisie resterait affichée.
      forme: FORMES_JURIDIQUES[resultat.nature_juridique ?? ""] ?? "",
      siret: siege.siret ?? resultat.siren ?? "",
      numeroRcs: resultat.siren ?? "",
      adresse: siege.adresse ?? "",
      codePostal: siege.code_postal ?? "",
      ville: siege.libelle_commune ?? "",
      villeImmatriculation: siege.libelle_commune ?? "",
      capital: undefined,
      representant: representantDe(resultat.dirigeants),
    });

    // Le capital ne figure pas dans l'API publique : il vient du registre.
    if (!resultat.siren) return;
    try {
      const fiche = await fetch("/api/societe/" + encodeURIComponent(resultat.siren));
      if (!fiche.ok) {
        setMessage("Capital non récupéré : à saisir à la main.");
        return;
      }
      const donnees = (await fiche.json()) as { societe?: { capital?: number | null } };
      const capital = donnees.societe?.capital;
      if (typeof capital === "number") surSelection({ capital });
      else setMessage("Capital non publié au registre : à saisir à la main.");
    } catch {
      setMessage("Capital non récupéré : à saisir à la main.");
    }
  }

  return (
    <div className={styles.field}>
      <label htmlFor={id}>Rechercher la société au registre</label>

      <div className={styles.completion}>
        <input
          id={id}
          value={terme}
          autoComplete="off"
          placeholder="Nom ou SIREN de la société"
          role="combobox"
          aria-expanded={ouvert && assezLong && resultats.length > 0}
          aria-controls={id + "-resultats"}
          aria-autocomplete="list"
          onChange={(e) => setTerme(e.target.value)}
          onBlur={() => setOuvert(false)}
        />

        {ouvert && assezLong && resultats.length > 0 && (
          <ul className={styles.propositions} id={id + "-resultats"} role="listbox">
            {resultats.map((r, i) => (
              <li key={(r.siren ?? "") + i} role="option" aria-selected={false}>
                <button
                  type="button"
                  className={styles.proposition}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void retenir(r);
                  }}
                >
                  <span className={styles.resultatCorps}>
                    <span className={styles.resultatNom}>
                      {r.nom_complet ?? r.nom_raison_sociale}
                    </span>
                    <span className={styles.resultatDetail}>
                      {[r.siege?.libelle_commune, r.siren].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {message && <p className={styles.objetNote}>{message}</p>}
    </div>
  );
}
