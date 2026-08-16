"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Adresse } from "@/components/formulaire/Adresse";
import { Editeur } from "./Editeur";
import {
  MODIFICATIONS,
  champVisible,
  definitions,
  type ChampModification,
  type Valeurs,
} from "@/domain/modification/types";
import {
  verifierSociete,
  verifierChamps,
  verifierCoherence,
  type Societe,
} from "@/domain/modification/verification";
import {
  publicationsAPrevoir,
  piecesAFournir,
  obligationsParticulieres,
  statutsAMettreAJour,
} from "@/domain/modification/formalites";
import { devis, montantLisible, PRESTATIONS, DELAI } from "@/domain/modification/offre";
import type { Retouche, Zone } from "@/domain/modification/edition";
import styles from "./Modification.module.css";

/**
 * Le parcours de modification.
 *
 * Sept étapes : la société, ce qui change, les détails, l'assemblée, les statuts en
 * vigueur, les actes, le règlement. Le même cadre que la création et l'auto-entreprise
 * - fil d'ariane, fil d'étapes horizontal, carte centrée.
 *
 * L'état vit ici et part au serveur à chaque changement d'étape. Enregistrer à chaque
 * frappe ferait une requête par lettre ; n'enregistrer qu'à la fin perdrait tout sur
 * un onglet fermé.
 */

const ETAPES = [
  { numero: 1, titre: "La société", court: "Société" },
  { numero: 2, titre: "Ce que vous changez", court: "Changements" },
  { numero: 3, titre: "Les détails", court: "Détails" },
  { numero: 4, titre: "L'assemblée", court: "Assemblée" },
  { numero: 5, titre: "Les statuts en vigueur", court: "Statuts" },
  { numero: 6, titre: "Vos actes", court: "Actes" },
  { numero: 7, titre: "Récapitulatif et règlement", court: "Règlement" },
];

const FORMES = ["SAS", "SASU", "SARL", "EURL", "SCI", "SA", "SNC"];

interface Associe {
  civilite?: string | null;
  prenom?: string | null;
  nom?: string | null;
  parts?: number | null;
}

export interface EtatDuDossier {
  codes: string[];
  societe: Societe & { villeRcs?: string | null };
  valeurs: Valeurs;
  assemblee: { date?: string | null; associes?: Associe[] };
  statuts?: {
    source: "inpi" | "depot";
    nature?: string;
    deposeLe?: string | null;
    confirmeLe?: string;
    fichier?: string;
  };
  retouches?: Retouche[];
  statutsAJour?: boolean;
  paye?: boolean;
}

interface Props {
  dossier: number;
  initial: EtatDuDossier;
  societesConnues: { id: number; societe: string | null; forme: string | null }[];
  etapeInitiale: number;
  issueDuPaiement?: "regle" | "annule";
}

/* ------------------------------------------------------------------ Outils */

function jourFrancais(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

const TRAITS = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/* --------------------------------------------------------------- Composant */

export function Parcours({ dossier, initial, societesConnues, etapeInitiale, issueDuPaiement }: Props) {
  const [etape, setEtape] = useState(etapeInitiale);
  const [etat, setEtat] = useState<EtatDuDossier>(initial);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  const anomalies = [
    ...verifierChamps(etat.codes, etat.valeurs),
    ...verifierCoherence(etat.codes, etat.valeurs),
  ];
  const anomaliesSociete = verifierSociete(etat.societe);

  function changer(changement: Partial<EtatDuDossier>) {
    setEtat((precedent) => ({ ...precedent, ...changement }));
  }

  /** Enregistre puis avance : l'étape suivante lit ce que le serveur a retenu. */
  function aller(vers: number) {
    setErreur(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/modification", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dossier,
          codes: etat.codes,
          societe: etat.societe,
          valeurs: etat.valeurs,
          assemblee: etat.assemblee,
        }),
      });

      if (!reponse.ok) {
        const corps = await reponse.json().catch(() => ({}));
        setErreur(corps.error ?? "L'enregistrement n'a pas abouti");
        return;
      }

      setEtape(vers);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const definitionsChoisies = definitions(etat.codes);

  return (
    <div className={styles.parcours}>
      {issueDuPaiement && <FinDePaiement issue={issueDuPaiement} dossier={dossier} />}

      <Frise etape={etape} />

      <div className={styles.contenu}>
        <p className={styles.avancement}>
          Étape {etape} sur {ETAPES.length}
        </p>
        <h2>{ETAPES[etape - 1].titre}</h2>

        {etape === 1 && (
          <EtapeSociete
            etat={etat}
            connues={societesConnues}
            anomalies={anomaliesSociete}
            changer={changer}
          />
        )}

        {etape === 2 && <EtapeChangements etat={etat} changer={changer} />}

        {etape === 3 && <EtapeDetails etat={etat} anomalies={anomalies} changer={changer} />}

        {etape === 4 && <EtapeAssemblee etat={etat} changer={changer} />}

        {etape === 5 && <EtapeStatuts dossier={dossier} etat={etat} changer={changer} />}

        {etape === 6 && <EtapeActes dossier={dossier} etat={etat} changer={changer} />}

        {etape === 7 && <EtapeReglement dossier={dossier} etat={etat} anomalies={anomalies} />}

        {erreur && <p role="alert">{erreur}</p>}

        <div className={styles.actions}>
          {etape > 1 && (
            <button type="button" onClick={() => aller(etape - 1)} disabled={enCours}>
              Retour
            </button>
          )}
          {etape < ETAPES.length && (
            <button
              type="button"
              className={styles.principal}
              onClick={() => aller(etape + 1)}
              disabled={enCours || (etape === 2 && etat.codes.length === 0)}
            >
              {enCours ? "Enregistrement" : "Continuer"}
            </button>
          )}
          {etape === ETAPES.length && !etat.paye && (
            <button
              type="button"
              className={styles.principal}
              onClick={() => router.refresh()}
              disabled={enCours}
            >
              Actualiser
            </button>
          )}
        </div>
      </div>

      {definitionsChoisies.length > 0 && etape >= 2 && etape <= 4 && (
        <Obligations codes={etat.codes} valeurs={etat.valeurs} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------- Le fil */

function Frise({ etape }: { etape: number }) {
  return (
    <ol className={styles.stepper}>
      {ETAPES.map((e, rang) => (
        <li key={e.numero} style={{ display: "contents" }}>
          {rang > 0 && (
            <span
              className={
                e.numero <= etape ? `${styles.stepSegment} ${styles.done}` : styles.stepSegment
              }
              aria-hidden="true"
            />
          )}
          <span
            className={
              e.numero === etape
                ? `${styles.step} ${styles.active}`
                : e.numero < etape
                  ? `${styles.step} ${styles.done}`
                  : styles.step
            }
          >
            <span className={styles.stepCircle}>
              {e.numero < etape ? (
                <svg viewBox="0 0 24 24" {...TRAITS} aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                e.numero
              )}
            </span>
            <span className={styles.stepLabel}>{e.court}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------- 1. La société */

interface ResultatRecherche {
  siren?: string;
  nom_complet?: string;
  nom_raison_sociale?: string;
  nature_juridique?: string;
  siege?: { adresse?: string; code_postal?: string; libelle_commune?: string };
}

const FORMES_JURIDIQUES: Record<string, string> = {
  "5710": "SAS",
  "5720": "SASU",
  "5499": "SARL",
  "5498": "EURL",
  "5410": "SA",
  "6540": "SCI",
  "6533": "SCI",
  "6534": "SCI",
  "6532": "SCI",
  "5202": "SNC",
};

function EtapeSociete({
  etat,
  connues,
  anomalies,
  changer,
}: {
  etat: EtatDuDossier;
  connues: { id: number; societe: string | null; forme: string | null }[];
  anomalies: { champ: string; message: string }[];
  changer: (c: Partial<EtatDuDossier>) => void;
}) {
  const [terme, setTerme] = useState("");
  const [resultats, setResultats] = useState<ResultatRecherche[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const frappe = useRef(false);

  /*
   * La recherche interroge l'annuaire public des entreprises : gratuit, sans clé,
   * appelé depuis le navigateur. Le capital n'y figure pas - il vient du registre
   * national, par notre relais, qui exige un compte connecté.
   */
  useEffect(() => {
    if (!frappe.current) return;
    frappe.current = false;
    if (terme.trim().length < 3) return;

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
        const donnees = (await reponse.json()) as { results?: ResultatRecherche[] };
        setResultats(donnees.results ?? []);
        setOuvert(true);
      } catch {
        // Annuaire injoignable : les champs restent saisissables à la main.
      }
    }, 280);

    return () => {
      clearTimeout(minuteur);
      abandon.abort();
    };
  }, [terme]);

  async function retenir(resultat: ResultatRecherche) {
    const nom = resultat.nom_complet ?? resultat.nom_raison_sociale ?? "";
    const siege = resultat.siege ?? {};

    setTerme(nom);
    setOuvert(false);
    setResultats([]);
    setMessage(null);

    changer({
      societe: {
        ...etat.societe,
        denomination: nom,
        forme: FORMES_JURIDIQUES[resultat.nature_juridique ?? ""] ?? etat.societe.forme ?? "",
        siren: resultat.siren ?? "",
        adresse: siege.adresse ?? "",
        codePostal: siege.code_postal ?? "",
        ville: siege.libelle_commune ?? "",
      },
    });

    if (!resultat.siren) return;
    try {
      const fiche = await fetch("/api/societe/" + encodeURIComponent(resultat.siren));
      if (!fiche.ok) {
        setMessage("Capital non récupéré : à saisir à la main.");
        return;
      }
      const donnees = (await fiche.json()) as { societe?: { capital?: number | null } };
      const capital = donnees.societe?.capital;
      if (typeof capital === "number") {
        changer({ societe: { ...etat.societe, denomination: nom, siren: resultat.siren, capital } });
      } else {
        setMessage("Capital non publié au registre : à saisir à la main.");
      }
    } catch {
      setMessage("Capital non récupéré : à saisir à la main.");
    }
  }

  function champSociete(cle: keyof Societe, valeur: string | number | null) {
    changer({ societe: { ...etat.societe, [cle]: valeur } });
  }

  const refus = (champ: string) => anomalies.find((a) => a.champ === champ)?.message;

  return (
    <>
      <p className={styles.description}>
        Cherchez la société au registre : sa dénomination, son SIREN, son siège et son
        capital se remplissent seuls. Tout reste modifiable - le registre peut être en
        retard sur vous.
      </p>

      <div className={styles.recherche}>
        <label htmlFor="recherche-societe">Nom ou SIREN de la société</label>
        <input
          id="recherche-societe"
          value={terme}
          autoComplete="off"
          placeholder="Ex : ACME CONSEIL, ou 123456789"
          onChange={(e) => {
            frappe.current = true;
            setTerme(e.target.value);
          }}
          onBlur={() => setTimeout(() => setOuvert(false), 150)}
        />

        {ouvert && resultats.length > 0 && (
          <ul className={styles.resultats}>
            {resultats.map((r) => (
              <li key={r.siren}>
                <button type="button" className={styles.resultat} onMouseDown={() => retenir(r)}>
                  <span className={styles.resultatNom}>
                    {r.nom_complet ?? r.nom_raison_sociale}
                  </span>
                  <span className={styles.resultatDetail}>
                    {r.siren} - {r.siege?.libelle_commune ?? ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {connues.length > 0 && (
        <p className={styles.description}>
          Ou reprenez une société déjà chez nous :{" "}
          {connues.map((c, rang) => (
            <span key={c.id}>
              {rang > 0 && ", "}
              <button
                type="button"
                className={styles.resultat}
                style={{ display: "inline", padding: 0, textDecoration: "underline" }}
                onClick={() =>
                  changer({
                    societe: {
                      ...etat.societe,
                      denomination: c.societe ?? "",
                      forme: c.forme ?? "",
                    },
                  })
                }
              >
                {c.societe}
              </button>
            </span>
          ))}
        </p>
      )}

      {message && <p className={styles.description}>{message}</p>}

      <div className={styles.champs}>
        <div className={styles.champ}>
          <label htmlFor="societe-denomination">Dénomination sociale</label>
          <input
            id="societe-denomination"
            value={etat.societe.denomination ?? ""}
            onChange={(e) => champSociete("denomination", e.target.value)}
          />
          {refus("denomination") && <p role="alert">{refus("denomination")}</p>}
        </div>

        <div className={styles.champ}>
          <label htmlFor="societe-forme">Forme juridique</label>
          <select
            id="societe-forme"
            value={etat.societe.forme ?? ""}
            onChange={(e) => champSociete("forme", e.target.value)}
          >
            <option value="">Choisir</option>
            {FORMES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          {refus("forme") && <p role="alert">{refus("forme")}</p>}
        </div>

        <div className={styles.champ}>
          <label htmlFor="societe-siren">SIREN</label>
          <input
            id="societe-siren"
            value={etat.societe.siren ?? ""}
            inputMode="numeric"
            onChange={(e) => champSociete("siren", e.target.value)}
          />
          {refus("siren") && <p role="alert">{refus("siren")}</p>}
        </div>

        <div className={styles.champ}>
          <label htmlFor="societe-capital">Capital social, en euros</label>
          <input
            id="societe-capital"
            type="number"
            min={0}
            value={etat.societe.capital ?? ""}
            onChange={(e) =>
              champSociete("capital", e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </div>

        <div className={`${styles.champ} ${styles.pleineLargeur}`}>
          <label htmlFor="societe-adresse">Adresse du siège</label>
          <Adresse
            id="societe-adresse"
            valeur={etat.societe.adresse ?? ""}
            surChangement={(voie) => changer({ societe: { ...etat.societe, adresse: voie } })}
            surCompletion={(codePostal, ville) =>
              changer({ societe: { ...etat.societe, codePostal, ville } })
            }
          />
          {refus("adresse") && <p role="alert">{refus("adresse")}</p>}
        </div>

        <div className={styles.champ}>
          <label htmlFor="societe-cp">Code postal</label>
          <input
            id="societe-cp"
            value={etat.societe.codePostal ?? ""}
            inputMode="numeric"
            onChange={(e) => champSociete("codePostal", e.target.value)}
          />
          {refus("codePostal") && <p role="alert">{refus("codePostal")}</p>}
        </div>

        <div className={styles.champ}>
          <label htmlFor="societe-ville">Ville</label>
          <input
            id="societe-ville"
            value={etat.societe.ville ?? ""}
            onChange={(e) => champSociete("ville", e.target.value)}
          />
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------- 2. Les changements */

function EtapeChangements({
  etat,
  changer,
}: {
  etat: EtatDuDossier;
  changer: (c: Partial<EtatDuDossier>) => void;
}) {
  function basculer(code: string) {
    const codes = etat.codes.includes(code)
      ? etat.codes.filter((c) => c !== code)
      : [...etat.codes, code];
    changer({ codes });
  }

  const chiffrage = devis({
    codes: etat.codes,
    ressortActuel: etat.societe.ville ?? "",
    ressortNouveau: typeof etat.valeurs.nouvelleVille === "string" ? etat.valeurs.nouvelleVille : "",
    depotDesStatuts: statutsAMettreAJour(etat.codes),
  });

  return (
    <>
      <p className={styles.description}>
        Cochez tout ce qui est décidé. Une même assemblée peut en décider plusieurs :
        c&apos;est alors un seul procès-verbal, une seule annonce, un seul dépôt - et les
        modifications suivantes coûtent moins cher.
      </p>

      <ul className={styles.changements}>
        {MODIFICATIONS.map((m) => (
          <li key={m.code}>
            <label
              className={
                etat.codes.includes(m.code)
                  ? `${styles.changement} ${styles.changementChoisi}`
                  : styles.changement
              }
            >
              <input
                type="checkbox"
                checked={etat.codes.includes(m.code)}
                onChange={() => basculer(m.code)}
              />
              <span className={styles.changementTitre}>{m.libelle}</span>
              <span className={styles.changementDesc}>{m.description}</span>
            </label>
          </li>
        ))}
      </ul>

      {etat.codes.length > 0 && <Devis chiffrage={chiffrage} />}
    </>
  );
}

function Devis({ chiffrage }: { chiffrage: ReturnType<typeof devis> }) {
  return (
    <>
      <div className={styles.devis}>
        <div className={styles.devisBloc}>
          <h3 className={styles.devisTitre}>Nos honoraires</h3>
          <p className={styles.devisNote}>
            Rédaction des actes, vérification par un avocat, dépôt et suivi.
          </p>
          <ul className={styles.devisLignes}>
            {chiffrage.honoraires.map((ligne, rang) => (
              <li key={rang} className={styles.devisLigne}>
                <span className={styles.devisLibelle}>
                  {ligne.libelle}
                  {ligne.precision && (
                    <span className={styles.devisPrecision}>{ligne.precision}</span>
                  )}
                </span>
                <span className={styles.devisMontant}>
                  {montantLisible(ligne.centimes)} HT
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.devisBloc}>
          <h3 className={styles.devisTitre}>Frais à avancer</h3>
          <p className={styles.devisNote}>
            Refacturés à l&apos;euro, sans marge. Tarifs 2026, susceptibles d&apos;évoluer.
          </p>
          <ul className={styles.devisLignes}>
            {chiffrage.frais.map((ligne, rang) => (
              <li key={rang} className={styles.devisLigne}>
                <span className={styles.devisLibelle}>
                  {ligne.libelle}
                  {ligne.precision && (
                    <span className={styles.devisPrecision}>{ligne.precision}</span>
                  )}
                </span>
                <span className={styles.devisMontant}>
                  {montantLisible(ligne.centimes)} {ligne.horsTaxes ? "HT" : "TTC"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={styles.devisTotal}>
        <span className={styles.devisTotalLibelle}>
          Total, honoraires et frais compris
        </span>
        <span className={styles.devisTotalMontant}>{montantLisible(chiffrage.totalTTC)} TTC</span>
      </div>
    </>
  );
}

/* --------------------------------------------------------- 3. Les détails */

function EtapeDetails({
  etat,
  anomalies,
  changer,
}: {
  etat: EtatDuDossier;
  anomalies: { champ: string; message: string }[];
  changer: (c: Partial<EtatDuDossier>) => void;
}) {
  function valeur(identifiant: string, v: string | number) {
    changer({ valeurs: { ...etat.valeurs, [identifiant]: v } });
  }

  if (etat.codes.length === 0) {
    return <p className={styles.description}>Revenez à l&apos;étape précédente pour choisir ce qui change.</p>;
  }

  return (
    <>
      {definitions(etat.codes).map((definition) => (
        <section key={definition.code} style={{ marginBottom: 32 }}>
          <h3>{definition.libelle}</h3>
          <div className={styles.champs}>
            {definition.champs
              .filter((champ) => champVisible(champ, etat.valeurs))
              .map((champ) => (
                <Champ
                  key={champ.identifiant}
                  champ={champ}
                  valeur={etat.valeurs[champ.identifiant]}
                  refus={anomalies.find((a) => a.champ === champ.identifiant)?.message}
                  surChangement={valeur}
                  surAdresse={(voie, complements) => {
                    const suite: Valeurs = { ...etat.valeurs };
                    // Une complétion ne renvoie que le code postal et la ville : la
                    // voie reste celle qui vient d'être posée par surChangement.
                    if (voie) suite[champ.identifiant] = voie;

                    // L'adresse du nouveau siège remplit aussi ses deux compagnons :
                    // les retaper serait la meilleure façon d'y glisser un écart.
                    if (champ.identifiant === "nouvelleAdresse" && complements) {
                      if (complements.codePostal) suite.nouveauCodePostal = complements.codePostal;
                      if (complements.ville) suite.nouvelleVille = complements.ville;
                    }
                    changer({ valeurs: suite });
                  }}
                />
              ))}
          </div>
        </section>
      ))}
    </>
  );
}

function Champ({
  champ,
  valeur,
  refus,
  surChangement,
  surAdresse,
}: {
  champ: ChampModification;
  valeur: string | number | undefined;
  refus?: string;
  surChangement: (identifiant: string, valeur: string | number) => void;
  surAdresse: (adresse: string, complements?: { codePostal?: string; ville?: string }) => void;
}) {
  const classe = champ.pleineLargeur ? `${styles.champ} ${styles.pleineLargeur}` : styles.champ;
  const id = "champ-" + champ.identifiant;

  if (champ.type === "adresse") {
    return (
      <div className={classe}>
        <label htmlFor={id}>{champ.libelle}</label>
        <Adresse
          id={id}
          valeur={typeof valeur === "string" ? valeur : ""}
          surChangement={(voie) => surAdresse(voie)}
          surCompletion={(codePostal, ville) => surAdresse("", { codePostal, ville })}
        />
        {champ.aide && <p className={styles.devisPrecision}>{champ.aide}</p>}
        {refus && <p role="alert">{refus}</p>}
      </div>
    );
  }

  return (
    <div className={classe}>
      <label htmlFor={id}>
        {champ.libelle}
        {champ.indication && <span className={styles.devisPrecision}>{champ.indication}</span>}
      </label>

      {champ.type === "choix" ? (
        <select
          id={id}
          value={typeof valeur === "string" ? valeur : ""}
          onChange={(e) => surChangement(champ.identifiant, e.target.value)}
        >
          <option value="">Choisir</option>
          {(champ.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : champ.type === "long" ? (
        <textarea
          id={id}
          rows={4}
          value={typeof valeur === "string" ? valeur : ""}
          onChange={(e) => surChangement(champ.identifiant, e.target.value)}
        />
      ) : (
        <input
          id={id}
          type={champ.type === "nombre" ? "number" : champ.type === "date" ? "date" : "text"}
          value={valeur ?? ""}
          onChange={(e) =>
            surChangement(
              champ.identifiant,
              champ.type === "nombre" && e.target.value !== ""
                ? Number(e.target.value)
                : e.target.value
            )
          }
        />
      )}

      {champ.aide && <p className={styles.devisPrecision}>{champ.aide}</p>}
      {refus && <p role="alert">{refus}</p>}
    </div>
  );
}

/* ------------------------------------------------------- 4. L'assemblée */

function EtapeAssemblee({
  etat,
  changer,
}: {
  etat: EtatDuDossier;
  changer: (c: Partial<EtatDuDossier>) => void;
}) {
  const associes = etat.assemblee.associes ?? [];

  function modifierAssocie(rang: number, changement: Partial<Associe>) {
    const suite = associes.map((a, i) => (i === rang ? { ...a, ...changement } : a));
    changer({ assemblee: { ...etat.assemblee, associes: suite } });
  }

  return (
    <>
      <p className={styles.description}>
        Le procès-verbal nomme qui décide et combien de parts chacun détient. Ce sont ces
        noms qui figureront au bas de l&apos;acte, sous les signatures.
      </p>

      <div className={styles.champs}>
        <div className={styles.champ}>
          <label htmlFor="assemblee-date">Date de l&apos;assemblée</label>
          <input
            id="assemblee-date"
            type="date"
            value={etat.assemblee.date ?? ""}
            onChange={(e) => changer({ assemblee: { ...etat.assemblee, date: e.target.value } })}
          />
        </div>
      </div>

      {associes.map((associe, rang) => (
        <fieldset key={rang} className={styles.personne}>
          <legend>Associé {rang + 1}</legend>
          <div className={styles.champs}>
            <div className={styles.champ}>
              <label htmlFor={"associe-civilite-" + rang}>Civilité</label>
              <select
                id={"associe-civilite-" + rang}
                value={associe.civilite ?? ""}
                onChange={(e) => modifierAssocie(rang, { civilite: e.target.value })}
              >
                <option value="">Choisir</option>
                <option value="Monsieur">Monsieur</option>
                <option value="Madame">Madame</option>
              </select>
            </div>
            <div className={styles.champ}>
              <label htmlFor={"associe-parts-" + rang}>Parts détenues</label>
              <input
                id={"associe-parts-" + rang}
                type="number"
                min={0}
                value={associe.parts ?? ""}
                onChange={(e) =>
                  modifierAssocie(rang, {
                    parts: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div className={styles.champ}>
              <label htmlFor={"associe-prenom-" + rang}>Prénom</label>
              <input
                id={"associe-prenom-" + rang}
                value={associe.prenom ?? ""}
                onChange={(e) => modifierAssocie(rang, { prenom: e.target.value })}
              />
            </div>
            <div className={styles.champ}>
              <label htmlFor={"associe-nom-" + rang}>Nom</label>
              <input
                id={"associe-nom-" + rang}
                value={associe.nom ?? ""}
                onChange={(e) => modifierAssocie(rang, { nom: e.target.value })}
              />
            </div>
          </div>
        </fieldset>
      ))}

      <div className={styles.actions}>
        <button
          type="button"
          onClick={() =>
            changer({
              assemblee: { ...etat.assemblee, associes: [...associes, {}] },
            })
          }
        >
          + Ajouter un associé
        </button>
        {associes.length > 0 && (
          <button
            type="button"
            onClick={() =>
              changer({
                assemblee: { ...etat.assemblee, associes: associes.slice(0, -1) },
              })
            }
          >
            Retirer le dernier
          </button>
        )}
      </div>
    </>
  );
}

/* ---------------------------------------------------------- 5. Les statuts */

interface ActeDuRegistre {
  id: string;
  nature: string;
  deposeLe: string | null;
}

function EtapeStatuts({
  dossier,
  etat,
  changer,
}: {
  dossier: number;
  etat: EtatDuDossier;
  changer: (c: Partial<EtatDuDossier>) => void;
}) {
  // Un dossier qui porte déjà ses statuts n'a pas à consulter le registre : l'état
  // part chargé, plutôt qu'un effet ne le corrige au rendu suivant.
  const [charge, setCharge] = useState(!!etat.statuts);
  const [acte, setActe] = useState<ActeDuRegistre | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [depotDemande, setDepotDemande] = useState(false);
  const [enCours, demarrer] = useTransition();

  useEffect(() => {
    if (etat.statuts) return;

    let vivant = true;
    (async () => {
      try {
        const reponse = await fetch("/api/formalites/modification/statuts?dossier=" + dossier);
        const corps = await reponse.json().catch(() => ({}));
        if (!vivant) return;

        if (!reponse.ok) setRefus(corps.error ?? "Le registre n'a pas répondu");
        else setActe(corps.statuts ?? null);
      } catch {
        if (vivant) setRefus("Le registre n'a pas répondu");
      } finally {
        if (vivant) setCharge(true);
      }
    })();

    return () => {
      vivant = false;
    };
  }, [dossier, etat.statuts]);

  function confirmer() {
    if (!acte) return;
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/modification/statuts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier, acte: acte.id }),
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setRefus(corps.error ?? "L'acte n'a pas pu être récupéré");
        return;
      }
      changer({
        statuts: {
          source: "inpi",
          nature: acte.nature,
          deposeLe: acte.deposeLe,
          confirmeLe: new Date().toISOString(),
        },
      });
    });
  }

  function deposer(fichier: File) {
    demarrer(async () => {
      const corps = new FormData();
      corps.append("dossier", String(dossier));
      corps.append("fichier", fichier);

      const reponse = await fetch("/api/formalites/modification/statuts/depot", {
        method: "POST",
        body: corps,
      });
      const retour = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setRefus(retour.error ?? "Le dépôt a été refusé");
        return;
      }
      changer({
        statuts: { source: "depot", fichier: fichier.name, confirmeLe: new Date().toISOString() },
        retouches: [],
        statutsAJour: false,
      });
    });
  }

  if (etat.statuts) {
    return (
      <>
        <p className={styles.description}>
          Ces statuts serviront de base à la mise à jour : c&apos;est sur eux que les
          articles modifiés seront retouchés, à l&apos;étape suivante.
        </p>
        <div className={styles.statutsConfirme}>
          <span>
            {etat.statuts.source === "inpi"
              ? etat.statuts.nature +
                (etat.statuts.deposeLe ? ", déposés au registre le " + jourFrancais(etat.statuts.deposeLe) : "")
              : "Vos statuts : " + (etat.statuts.fichier ?? "document déposé")}
          </span>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={() => changer({ statuts: undefined, retouches: [] })}>
            Changer de document
          </button>
        </div>
      </>
    );
  }

  if (!charge) {
    return <p className={styles.description}>Consultation du registre national…</p>;
  }

  return (
    <>
      <p className={styles.description}>
        Les statuts en vigueur viennent du registre national, qui diffuse les actes publics
        d&apos;une société. Vous n&apos;avez rien à retrouver.
      </p>

      {acte ? (
        <div className={styles.statuts}>
          <div className={styles.statutsTrouves}>
            <span>
              <span className={styles.statutsNature}>{acte.nature}</span>
              <span className={styles.statutsDate}>
                Dernier dépôt au registre{acte.deposeLe ? " le " + jourFrancais(acte.deposeLe) : ""}
              </span>
            </span>
          </div>

          {/*
            La date de dépôt ne prouve pas que les statuts sont à jour : une
            modification décidée et jamais déposée les périme. C'est donc au client
            d'affirmer, et son affirmation est datée dans le dossier.
          */}
          <p className={styles.statutsQuestion}>
            Est-ce bien la dernière version à jour de vos statuts ?
          </p>
          <div className={styles.statutsReponses}>
            <button
              type="button"
              className={styles.principal}
              style={{ marginLeft: 0, padding: "12px 20px", borderRadius: 10, fontWeight: 600 }}
              onClick={confirmer}
              disabled={enCours}
            >
              {enCours ? "Récupération" : "Oui, ce sont mes statuts en vigueur"}
            </button>
            <button
              type="button"
              style={{ padding: "12px 20px", border: "1px solid #e5e5e7", borderRadius: 10, background: "#fff", fontWeight: 600, cursor: "pointer" }}
              onClick={() => setDepotDemande(true)}
            >
              Non, j&apos;ai une version plus récente
            </button>
          </div>
        </div>
      ) : (
        <p className={styles.description}>
          {refus ??
            "Le registre ne publie aucun acte de statuts pour ce SIREN. Déposez vos statuts en vigueur."}
        </p>
      )}

      {(depotDemande || !acte) && (
        <div className={styles.zoneDepot}>
          <p>Déposez vos statuts à jour, au format PDF.</p>
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              if (fichier) deposer(fichier);
            }}
          />
        </div>
      )}

      {refus && acte && <p role="alert">{refus}</p>}
    </>
  );
}

/* ------------------------------------------------------------ 6. Les actes */

function EtapeActes({
  dossier,
  etat,
  changer,
}: {
  dossier: number;
  etat: EtatDuDossier;
  changer: (c: Partial<EtatDuDossier>) => void;
}) {
  const [documents, setDocuments] = useState<{ id: number; titre: string }[]>([]);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const [pages, setPages] = useState<{ numero: number; largeur: number; hauteur: number }[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [retouches, setRetouches] = useState<Retouche[]>(etat.retouches ?? []);
  const [reconnus, setReconnus] = useState(false);
  const [editeurOuvert, setEditeurOuvert] = useState(false);

  function produire() {
    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/modification/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier }),
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setRefus(corps.error ?? "Les actes n'ont pas pu être produits");
        return;
      }
      setDocuments(corps.documents ?? []);
    });
  }

  function ouvrirLEditeur() {
    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/modification/retouches?dossier=" + dossier);
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setRefus(corps.error ?? "Les statuts n'ont pas pu être lus");
        return;
      }
      setPages(corps.pages ?? []);
      setZones(corps.zones ?? []);
      setRetouches(corps.retouches ?? []);
      setReconnus(corps.reconnus === true);
      setEditeurOuvert(true);
    });
  }

  function appliquer() {
    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/modification/retouches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier, retouches }),
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setRefus(corps.error ?? "Les retouches n'ont pas pu être appliquées");
        return;
      }
      changer({ retouches, statutsAJour: true });
      setEditeurOuvert(false);
    });
  }

  return (
    <>
      <p className={styles.description}>
        Le procès-verbal porte toutes vos résolutions, numérotées dans l&apos;ordre. Les
        statuts, eux, se retouchent article par article sur le document d&apos;origine : le
        reste ne bouge pas d&apos;un point.
      </p>

      <div className={styles.actions}>
        <button type="button" className={styles.principal} onClick={produire} disabled={enCours}>
          {enCours ? "Production" : "Produire les actes"}
        </button>
      </div>

      {documents.length > 0 && (
        <ul className={styles.devisLignes} style={{ marginTop: 20 }}>
          {documents.map((d) => (
            <li key={d.id} className={styles.devisLigne}>
              <span className={styles.devisLibelle}>{d.titre}</span>
            </li>
          ))}
        </ul>
      )}

      {statutsAMettreAJour(etat.codes) && (
        <section style={{ marginTop: 32 }}>
          <h3>Les statuts à jour</h3>

          {!etat.statuts ? (
            <p className={styles.description}>
              Revenez à l&apos;étape précédente : les statuts en vigueur ne sont pas encore
              au dossier.
            </p>
          ) : !editeurOuvert ? (
            <>
              <p className={styles.description}>
                {etat.statutsAJour
                  ? "Vos statuts à jour sont au dossier. Vous pouvez reprendre les retouches."
                  : "Nous repérons dans vos statuts les passages que vos décisions changent, et nous vous les proposons."}
              </p>
              <div className={styles.actions}>
                <button type="button" onClick={ouvrirLEditeur} disabled={enCours}>
                  {enCours ? "Lecture des statuts" : "Retoucher les statuts"}
                </button>
              </div>
            </>
          ) : (
            <>
              <Editeur
                dossier={dossier}
                pages={pages}
                zones={zones}
                retouches={retouches}
                reconnus={reconnus}
                surChangement={setRetouches}
              />
              <div className={styles.actions}>
                <button type="button" onClick={() => setEditeurOuvert(false)}>
                  Fermer
                </button>
                <button
                  type="button"
                  className={styles.principal}
                  onClick={appliquer}
                  disabled={enCours}
                >
                  {enCours ? "Application" : "Appliquer et produire les statuts à jour"}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {refus && <p role="alert">{refus}</p>}
    </>
  );
}

/* -------------------------------------------------------- 7. Le règlement */

function EtapeReglement({
  dossier,
  etat,
  anomalies,
}: {
  dossier: number;
  etat: EtatDuDossier;
  anomalies: { champ: string; message: string }[];
}) {
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const chiffrage = devis({
    codes: etat.codes,
    ressortActuel: etat.societe.ville ?? "",
    ressortNouveau: typeof etat.valeurs.nouvelleVille === "string" ? etat.valeurs.nouvelleVille : "",
    depotDesStatuts: statutsAMettreAJour(etat.codes),
  });

  const publications = publicationsAPrevoir({
    codes: etat.codes,
    ressortActuel: etat.societe.ville ?? "",
    ressortNouveau: typeof etat.valeurs.nouvelleVille === "string" ? etat.valeurs.nouvelleVille : "",
  });

  const pieces = piecesAFournir(etat.codes, etat.valeurs);

  function payer() {
    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/modification/paiement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier }),
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok || !corps.adresse) {
        setRefus(corps.error ?? "Le règlement n'a pas pu être ouvert");
        return;
      }
      window.location.href = corps.adresse;
    });
  }

  if (etat.paye) {
    return (
      <>
        <div className={styles.statutsConfirme}>
          <span>
            Votre dossier est réglé et confié à un avocat. Vous serez prévenu à chaque étape.
          </span>
        </div>
        <p className={styles.description}>{DELAI}</p>
      </>
    );
  }

  return (
    <>
      <section className={styles.recap}>
        <h3>Ce que vous changez</h3>
        <ul className={styles.devisLignes}>
          {definitions(etat.codes).map((d) => (
            <li key={d.code} className={styles.devisLigne}>
              <span className={styles.devisLibelle}>{d.libelle}</span>
            </li>
          ))}
        </ul>

        <h3>La société</h3>
        <ul className={styles.devisLignes}>
          <li className={styles.devisLigne}>
            <span className={styles.devisLibelle}>Dénomination</span>
            <span className={styles.devisMontant}>{etat.societe.denomination}</span>
          </li>
          <li className={styles.devisLigne}>
            <span className={styles.devisLibelle}>SIREN</span>
            <span className={styles.devisMontant}>{etat.societe.siren}</span>
          </li>
          <li className={styles.devisLigne}>
            <span className={styles.devisLibelle}>Siège</span>
            <span className={styles.devisMontant}>
              {etat.societe.adresse}, {etat.societe.codePostal} {etat.societe.ville}
            </span>
          </li>
        </ul>

        <h3>Les statuts</h3>
        <p className={styles.description}>
          {etat.statuts
            ? etat.statuts.source === "inpi"
              ? "Repris au registre national" +
                (etat.statuts.deposeLe ? ", dépôt du " + jourFrancais(etat.statuts.deposeLe) : "") +
                (etat.statutsAJour ? ", retouchés et joints au dossier." : ".")
              : "Déposés par vos soins" + (etat.statutsAJour ? ", retouchés et joints." : ".")
            : "Non renseignés : l'avocat vous les demandera."}
        </p>

        <h3>Publication</h3>
        <ul className={styles.devisLignes}>
          {publications.map((p, rang) => (
            <li key={rang} className={styles.devisLigne}>
              <span className={styles.devisLibelle}>{p.ressort}</span>
              <span className={styles.devisPrecision}>{p.motif}</span>
            </li>
          ))}
          {publications.length === 0 && (
            <li className={styles.devisLigne}>
              <span className={styles.devisLibelle}>
                Aucune annonce légale n&apos;est requise pour ce changement.
              </span>
            </li>
          )}
        </ul>

        {pieces.length > 0 && (
          <>
            <h3>Justificatifs à fournir</h3>
            <ul className={styles.devisLignes}>
              {pieces.map((piece) => (
                <li key={piece.identifiant} className={styles.devisLigne}>
                  <span className={styles.devisLibelle}>
                    {piece.titre}
                    <span className={styles.devisPrecision}>{piece.explication}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <h3>Ce que comprend la prestation</h3>
      <ul className={styles.prestations}>
        {PRESTATIONS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>

      <Devis chiffrage={chiffrage} />

      {anomalies.length > 0 && (
        <p role="alert">
          Il manque {anomalies.length === 1 ? "une information" : anomalies.length + " informations"}{" "}
          avant de pouvoir régler : {anomalies.map((a) => a.message).join(", ")}.
        </p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.principal}
          onClick={payer}
          disabled={enCours || anomalies.length > 0}
        >
          {enCours ? "Ouverture du paiement" : "Régler " + montantLisible(chiffrage.totalTTC)}
        </button>
      </div>

      <p className={styles.description}>{DELAI}</p>
      {refus && <p role="alert">{refus}</p>}
    </>
  );
}

/* ------------------------------------------------------- Les obligations */

function Obligations({ codes, valeurs }: { codes: string[]; valeurs: Valeurs }) {
  const dites = obligationsParticulieres(codes, valeurs);
  if (dites.length === 0) return null;

  return (
    <div className={styles.obligations}>
      <ul>
        {dites.map((dite) => (
          <li key={dite}>{dite}</li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------ Retour de paiement */

/**
 * Ce qu'on voit en revenant de la banque.
 *
 * Un règlement abouti ou abandonné doit se dire tout de suite : revenir sur la page
 * du devis sans un mot laisse croire que rien ne s'est passé, et fait payer deux fois.
 */
function FinDePaiement({ issue, dossier }: { issue: "regle" | "annule"; dossier: number }) {
  const [visible, setVisible] = useState(true);
  const router = useRouter();

  if (!visible) return null;

  return (
    <div className={styles.voile}>
      <div className={styles.confirmation}>
        <span className={styles.cercle} aria-hidden="true">
          {issue === "regle" ? "✓" : "!"}
        </span>
        <h2>{issue === "regle" ? "Paiement effectué" : "Paiement interrompu"}</h2>
        <p className={styles.confirmationDetail}>
          {issue === "regle"
            ? "Votre dossier est confié à un avocat. Vous serez prévenu à chaque étape, jusqu'à l'extrait à jour."
            : "Rien n'a été débité. Votre dossier est conservé en l'état, vous pouvez reprendre le règlement quand vous voulez."}
        </p>
        <button
          type="button"
          className={styles.principal}
          onClick={() => {
            setVisible(false);
            if (issue === "regle") router.push("/formalites");
            else router.replace("/modification?dossier=" + dossier + "&etape=7");
          }}
        >
          {issue === "regle" ? "Voir mes formalités" : "Revenir au dossier"}
        </button>
      </div>
    </div>
  );
}
