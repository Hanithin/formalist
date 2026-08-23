"use client";

import {
  Fragment,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Adresse, AdresseUneLigne } from "@/components/formulaire/Adresse";
import { ChampDate } from "@/components/formulaire/ChampDate";
import { ChampNombre } from "@/components/formulaire/ChampNombre";
import { DepotFichier } from "@/components/formulaire/DepotFichier";
import { Cessions } from "./Cessions";
import { verifierCessions, type Cession } from "@/domain/modification/cession";
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
import type { ActeProduit } from "@/domain/document/publication";
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

/** Les champs que l'étape « La société » porte : ils s'y corrigent, et nulle part ailleurs. */
const CHAMPS_DE_SOCIETE = ["denomination", "forme", "siren", "adresse", "codePostal", "ville"];

interface Associe {
  /** Personne physique par défaut : c'est le cas courant, et l'ancien format. */
  nature?: "physique" | "morale" | null;
  parts?: number | null;

  civilite?: string | null;
  prenom?: string | null;
  nom?: string | null;

  denomination?: string | null;
  forme?: string | null;
  siren?: string | null;
  siege?: string | null;
  capital?: number | null;
  representant?: string | null;
  qualiteRepresentant?: string | null;
}

export interface EtatDuDossier {
  codes: string[];
  societe: Societe & { villeRcs?: string | null };
  valeurs: Valeurs;
  assemblee: { date?: string | null; associes?: Associe[] };
  /** Les cessions décidées, quand il y en a. */
  cessions?: Cession[];
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
  etapeInitiale: number;
  issueDuPaiement?: "regle" | "annule";
  /** Les actes déjà produits, relus par le serveur à chaque affichage de la page. */
  actesInitiaux: ActeProduit[];
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

export function Parcours({
  dossier,
  initial,
  etapeInitiale,
  issueDuPaiement,
  actesInitiaux,
}: Props) {
  const [etape, setEtape] = useState(etapeInitiale);
  const [etat, setEtat] = useState<EtatDuDossier>(initial);
  const [erreur, setErreur] = useState<string | null>(null);
  /*
   * Les champs signalés au dernier refus d'avancer.
   *
   * Les refus ne s'affichent pas avant qu'on ait essayé de continuer : marquer en
   * rouge un formulaire qu'on vient d'ouvrir met la faute sur celui qui n'a pas
   * encore eu le temps de le remplir.
   */
  const [manquesVus, setManquesVus] = useState<string[]>([]);
  /** Une tentative d'avancer a été refusée : on montre ce qui manque, et on suit. */
  const [tentative, setTentative] = useState(false);
  /*
   * L'étape la plus loin qu'on ait atteinte.
   *
   * Le fil ne renvoie qu'en arrière ou là où l'on est déjà allé : sauter à une étape
   * jamais vue enjamberait les contrôles qui gardent les précédentes.
   *
   * L'étape 2 ne s'ouvre pas d'avance, même quand l'écran d'entrée l'a déjà remplie.
   * Y sauter depuis l'étape 1 passerait par le contrôle de l'étape 1, qui refuserait une
   * société pas encore saisie - on reprocherait un champ vide à qui veut corriger tout
   * autre chose. Elle s'ouvre dès l'arrivée à l'étape 3, d'où l'on y revient en arrière,
   * sans contrôle à franchir.
   */
  const [atteinte, setAtteinte] = useState(etapeInitiale);
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

  /*
   * Deux écritures dans le même cycle doivent se cumuler, non se remplacer.
   *
   * Choisir une adresse dans la liste déclenche deux rappels coup sur coup : la voie,
   * puis le code postal et la ville. Construits l'un et l'autre à partir de l'état de
   * ce rendu, le second écrasait le premier - la ville et le code postal
   * s'affichaient, la rue restait celle qu'on avait tapée à moitié.
   */
  function majValeurs(maj: (valeurs: Valeurs) => Valeurs) {
    setEtat((precedent) => ({ ...precedent, valeurs: maj(precedent.valeurs) }));
  }

  function majSociete(maj: (societe: EtatDuDossier["societe"]) => EtatDuDossier["societe"]) {
    setEtat((precedent) => ({ ...precedent, societe: maj(precedent.societe) }));
  }

  /**
   * Ce qui manque pour quitter cette étape.
   *
   * On ne bloque qu'en avançant : revenir en arrière pour corriger doit rester
   * possible, sans quoi un dossier incomplet enfermerait celui qui le remplit.
   */
  function manquesDe(etape: number): { champ: string; message: string }[] {
    if (etape === 1) return anomaliesSociete;
    if (etape === 2) {
      return etat.codes.length === 0
        ? [{ champ: "codes", message: "Choisissez au moins une modification" }]
        : [];
    }
    if (etape === 3) {
      /*
       * Les cessions se vérifient à part : leurs manques se posent sous le bloc
       * concerné, et le cumul de plusieurs cessions se juge sur l'ensemble.
       */
      return etat.codes.includes("cession_parts")
        ? [...anomalies, ...verifierCessions(etat.assemblee.associes ?? [], etat.cessions ?? [])]
        : anomalies;
    }
    return [];
  }

  /** Ce qui manque à l'étape courante, recalculé à chaque rendu. */
  const manquesCourants = manquesDe(etape);

  /**
   * L'étape d'après.
   *
   * L'étape 2 est enjambée quand elle a déjà sa réponse. Les changements se cochent sur
   * l'écran d'entrée, avec le prix qui suit ; les reposer ici ferait répondre deux fois
   * à la même question, la seconde pour rien - c'est le défaut d'une version antérieure,
   * et le rendre à l'identique n'aurait fait que le déplacer.
   *
   * Elle reste dans le fil, cochée et cliquable : on y revient quand on change d'avis,
   * et « Retour » depuis l'étape 3 y ramène normalement.
   */
  function suivante(depuis: number): number {
    if (depuis === 1 && etat.codes.length > 0) return 3;
    return depuis + 1;
  }

  /** Enregistre puis avance : l'étape suivante lit ce que le serveur a retenu. */
  function aller(vers: number) {
    setErreur(null);

    /*
     * Rien ne part vers l'avant tant que l'étape n'est pas complète.
     *
     * C'est ce qui garantit qu'on arrive au règlement avec un dossier entier : sans
     * cela, il faut redescendre chercher le champ manquant parmi trente, cinq écrans
     * en arrière, puis remonter.
     */
    if (vers > etape) {
      const manques = manquesDe(etape);
      if (manques.length > 0) {
        /*
         * Ce qui manque se recalcule à chaque frappe, il ne se fige pas.
         *
         * Le message était écrit une fois dans l'état : on remplissait les champs
         * qu'il nommait, et il continuait d'annoncer « il reste 5 champs » en les
         * citant tous - y compris ceux qu'on venait de renseigner sous ses yeux.
         */
        setManquesVus(manques.map((m) => m.champ));
        setTentative(true);
        return;
      }
    }
    setManquesVus([]);
    setTentative(false);

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
          cessions: etat.cessions,
        }),
      });

      if (!reponse.ok) {
        const corps = await reponse.json().catch(() => ({}));
        setErreur(corps.error ?? "L'enregistrement n'a pas abouti");
        return;
      }

      setEtape(vers);
      setAtteinte((loin) => Math.max(loin, vers));
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const definitionsChoisies = definitions(etat.codes);

  return (
    <div className={styles.parcours}>
      {issueDuPaiement && <FinDePaiement issue={issueDuPaiement} dossier={dossier} />}

      <Frise etape={etape} atteinte={atteinte} surChoix={aller} />

      <div className={styles.contenu}>
        {/*
          Le rang de l'étape en pastille, à droite du titre.
          Posé au-dessus en petit gris, il se lisait avant le titre alors qu'il ne le
          qualifie que d'un cran, et repoussait le titre d'une ligne sur tous les écrans.
        */}
        <div className={styles.etapeTete}>
          <h2 className={styles.etapeTitre}>{ETAPES[etape - 1].titre}</h2>
          <span className={styles.avancement}>
            Étape {etape} sur {ETAPES.length}
          </span>
        </div>

        {/*
          Ce qui a été coché avant d'entrer, rappelé là où l'on entre.
          Sans ce rappel, l'étape 2 est enjambée sans explication : on passe de la
          société aux détails, et rien ne dit où sont partis les changements. La
          reprise se fait par le fil, une fois l'étape 3 atteinte.
        */}
        {etape === 1 && definitionsChoisies.length > 0 && (
          <p className={styles.rappelChoix}>
            <span className={styles.rappelIntitule}>Vous changez</span>
            {definitionsChoisies.map((d) => d.libelle).join(", ")}
          </p>
        )}

        {etape === 1 && (
          <EtapeSociete
            etat={etat}
            anomalies={anomaliesSociete.filter((a) => manquesVus.includes(a.champ))}
            changer={changer}
            majSociete={majSociete}
          />
        )}

        {etape === 2 && <EtapeChangements etat={etat} changer={changer} />}

        {etape === 3 && (
          <EtapeDetails
            etat={etat}
            /*
              Les manques d'une cession se montrent dès la tentative, comme les autres,
              mais leur champ porte le rang du bloc : « cession-1-parts ».
            */
            anomalies={manquesCourants.filter((a) => manquesVus.includes(a.champ))}
            restants={manquesCourants}
            majValeurs={majValeurs}
            changer={changer}
          />
        )}

        {etape === 4 && <EtapeAssemblee etat={etat} changer={changer} />}

        {etape === 5 && <EtapeStatuts dossier={dossier} etat={etat} changer={changer} />}

        {etape === 6 && (
          <EtapeActes
            dossier={dossier}
            etat={etat}
            changer={changer}
            actesInitiaux={actesInitiaux}
          />
        )}

        {etape === 7 && (
          <EtapeReglement
            dossier={dossier}
            etat={etat}
            anomalies={[...anomaliesSociete, ...anomalies]}
            surCorrection={(champ) => aller(CHAMPS_DE_SOCIETE.includes(champ) ? 1 : 3)}
          />
        )}

        {/*
          Deux messages de nature différente : ce qui manque, qui se recalcule, et le
          refus du serveur, qui ne bouge pas tant qu'on ne réessaie pas.
        */}
        {tentative && manquesCourants.length > 0 && (
          <p className={styles.manques} role="alert">
            {manquesCourants.length === 1
              ? manquesCourants[0].message
              : "Il reste " +
                manquesCourants.length +
                " champs à renseigner : " +
                manquesCourants.map((m) => m.message).join(", ")}
          </p>
        )}

        {erreur && (
          <p className={styles.manques} role="alert">
            {erreur}
          </p>
        )}

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
              onClick={() => aller(suivante(etape))}
              disabled={enCours}
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
        <Obligations codes={etat.codes} valeurs={etat.valeurs} forme={etat.societe.forme} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------- Le fil */

function Frise({
  etape,
  atteinte,
  surChoix,
}: {
  etape: number;
  atteinte: number;
  surChoix: (vers: number) => void;
}) {
  return (
    <ol className={styles.stepper}>
      {ETAPES.map((e, rang) => (
        <li key={e.numero} style={{ display: "contents" }}>
          {rang > 0 && (
            <span
              className={
                e.numero <= atteinte ? `${styles.stepSegment} ${styles.done}` : styles.stepSegment
              }
              aria-hidden="true"
            />
          )}
          {/*
            Une étape déjà atteinte se rouvre d'un clic.
            Celles qu'on n'a pas encore vues ne sont pas des liens : y sauter
            enjamberait les contrôles qui gardent les précédentes.
          */}
          {e.numero <= atteinte ? (
            <button
              type="button"
              className={
                e.numero === etape
                  ? `${styles.step} ${styles.stepBouton} ${styles.active}`
                  : `${styles.step} ${styles.stepBouton} ${styles.done}`
              }
              onClick={() => surChoix(e.numero)}
              aria-current={e.numero === etape ? "step" : undefined}
            >
              <span className={styles.stepCircle}>
                {e.numero !== etape ? (
                  <svg viewBox="0 0 24 24" {...TRAITS} aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  e.numero
                )}
              </span>
              <span className={styles.stepLabel}>{e.court}</span>
            </button>
          ) : (
            <span className={styles.step}>
              <span className={styles.stepCircle}>{e.numero}</span>
              <span className={styles.stepLabel}>{e.court}</span>
            </span>
          )}
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

/**
 * La recherche au registre, partagée.
 *
 * La société du dossier et les associés personnes morales se cherchent au même
 * endroit : l'annuaire public des entreprises, gratuit et sans clé. Recopier une
 * dénomination, un SIREN et un siège à la main dans un acte est exactement là où
 * l'erreur se glisse, et elle se paie au greffe.
 */
export interface SocieteTrouvee {
  denomination: string;
  forme: string;
  siren: string;
  /** Le siège sur une ligne, tel qu'un acte l'écrit. */
  siege: string;
  /** Les deux morceaux, pour qui doit en déduire le greffe compétent. */
  codePostal: string;
  commune: string;
}

export function RechercheAuRegistre({
  id,
  libelle = "Chercher la société au registre",
  valeur,
  surSaisie,
  surSelection,
}: {
  id: string;
  libelle?: string;
  /*
   * Contrôlé depuis l'extérieur quand on le lui demande.
   *
   * La recherche gardait son terme dans son propre état : rouvrir un dossier
   * réaffichait un champ vide au-dessus de données déjà remplies, et l'on ne savait
   * plus quelle société avait été retenue. Sans `valeur`, elle se gère comme avant.
   */
  valeur?: string;
  surSaisie?: (terme: string) => void;
  surSelection: (societe: SocieteTrouvee) => void;
}) {
  const [interne, setInterne] = useState("");
  const controle = valeur !== undefined;
  const terme = controle ? valeur : interne;
  const setTerme = (v: string) => {
    if (controle) surSaisie?.(v);
    else setInterne(v);
  };
  const [resultats, setResultats] = useState<ResultatRecherche[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const frappe = useRef(false);

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

  function retenir(resultat: ResultatRecherche) {
    const nom = resultat.nom_complet ?? resultat.nom_raison_sociale ?? "";
    const siege = resultat.siege ?? {};

    setTerme(nom);
    setOuvert(false);
    setResultats([]);

    surSelection({
      denomination: nom,
      forme: FORMES_JURIDIQUES[resultat.nature_juridique ?? ""] ?? "",
      siren: resultat.siren ?? "",
      siege: [siege.adresse, siege.code_postal, siege.libelle_commune].filter(Boolean).join(" "),
      codePostal: siege.code_postal ?? "",
      commune: siege.libelle_commune ?? "",
    });
  }

  return (
    <div className={styles.recherche}>
      <label htmlFor={id}>{libelle}</label>
      <input
        id={id}
        value={terme}
        autoComplete="off"
        placeholder="Nom ou SIREN"
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
                <span className={styles.resultatNom}>{r.nom_complet ?? r.nom_raison_sociale}</span>
                <span className={styles.resultatDetail}>
                  {r.siren} - {r.siege?.libelle_commune ?? ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EtapeSociete({
  etat,
  anomalies,
  changer,
  majSociete,
}: {
  etat: EtatDuDossier;
  anomalies: { champ: string; message: string }[];
  changer: (c: Partial<EtatDuDossier>) => void;
  majSociete: (maj: (societe: EtatDuDossier["societe"]) => EtatDuDossier["societe"]) => void;
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
        changer({
          societe: { ...etat.societe, denomination: nom, siren: resultat.siren, capital },
        });
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
        Cherchez la société au registre : sa dénomination, son SIREN, son siège et son capital se
        remplissent seuls. Tout reste modifiable - le registre peut être en retard sur vous.
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
          <ChampNombre
            id="societe-capital"
            valeur={etat.societe.capital ?? ""}
            decimales
            surChangement={(nombre) => champSociete("capital", nombre === "" ? null : nombre)}
          />
        </div>

        <div className={`${styles.champ} ${styles.pleineLargeur}`}>
          <label htmlFor="societe-adresse">Adresse du siège</label>
          <Adresse
            id="societe-adresse"
            valeur={etat.societe.adresse ?? ""}
            surChangement={(voie) => majSociete((societe) => ({ ...societe, adresse: voie }))}
            surCompletion={(codePostal, ville) =>
              majSociete((societe) => ({ ...societe, codePostal, ville }))
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
    const enleve = etat.codes.includes(code);
    const codes = enleve ? etat.codes.filter((c) => c !== code) : [...etat.codes, code];

    /*
     * Le capital actuel est déjà connu : il vient du registre.
     *
     * Le retaper est la meilleure façon d'y glisser un écart, et l'acte se contredit
     * alors dans sa propre page - l'en-tête annonce « au capital de 2 000 euros » et la
     * résolution « porter le capital de 15 000 euros à 20 000 euros ». Le champ reste
     * modifiable : le registre peut retarder d'une formalité non encore publiée.
     */
    const champ = code === "augmentation_capital" ? "capitalActuelAugm" : "capitalActuelRed";
    const aPrefixer =
      !enleve &&
      (code === "augmentation_capital" || code === "reduction_capital") &&
      typeof etat.societe.capital === "number" &&
      etat.valeurs[champ] === undefined;

    changer(
      aPrefixer
        ? { codes, valeurs: { ...etat.valeurs, [champ]: etat.societe.capital as number } }
        : { codes }
    );
  }

  const chiffrage = devis({
    codes: etat.codes,
    ressortActuel: etat.societe.ville ?? "",
    ressortNouveau:
      typeof etat.valeurs.nouvelleVille === "string" ? etat.valeurs.nouvelleVille : "",
    depotDesStatuts: statutsAMettreAJour(etat.codes),
  });

  return (
    <>
      <p className={styles.description}>
        Cochez tout ce qui est décidé. Une même assemblée peut en décider plusieurs : c&apos;est
        alors un seul procès-verbal, une seule annonce, un seul dépôt - et les modifications
        suivantes coûtent moins cher.
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
              <span className={styles.changementCase} aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
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
                <span className={styles.devisMontant}>{montantLisible(ligne.centimes)} HT</span>
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
        <span className={styles.devisTotalLibelle}>Total, honoraires et frais compris</span>
        <span className={styles.devisTotalMontant}>{montantLisible(chiffrage.totalTTC)} TTC</span>
      </div>
    </>
  );
}

/* --------------------------------------------------------- 3. Les détails */

function EtapeDetails({
  etat,
  anomalies,
  restants,
  majValeurs,
  changer,
}: {
  etat: EtatDuDossier;
  anomalies: { champ: string; message: string }[];
  /** Tout ce qui manque, montré ou non : le sommaire s'en sert pour cocher. */
  restants: { champ: string; message: string }[];
  majValeurs: (maj: (valeurs: Valeurs) => Valeurs) => void;
  changer: (c: Partial<EtatDuDossier>) => void;
}) {
  function valeur(identifiant: string, v: string | number) {
    majValeurs((valeurs) => ({ ...valeurs, [identifiant]: v }));
  }

  /**
   * Une société retenue au registre remplit les champs qu'elle sait remplir.
   *
   * Le registre public rend la dénomination, la forme, le SIREN et le siège d'un
   * coup. Le capital et le greffe compétent demandent deux appels de plus, qui
   * peuvent échouer sans que cela empêche de continuer : les champs restent
   * saisissables, et c'est le contrôle de l'étape qui réclamera ce qui manque.
   */
  function remplirDepuisLeRegistre(champ: ChampModification, societe: SocieteTrouvee) {
    const vers = champ.remplit ?? {};

    majValeurs((valeurs) => {
      const suite: Valeurs = { ...valeurs, [champ.identifiant]: societe.denomination };
      if (vers.forme && societe.forme) suite[vers.forme] = societe.forme;
      if (vers.siren) suite[vers.siren] = societe.siren;
      if (vers.siege) suite[vers.siege] = societe.siege;
      return suite;
    });

    /*
     * Le greffe compétent n'est pas la commune du siège.
     *
     * Argenteuil relève du RCS de Pontoise. La table des exceptions charge par
     * createRequire et ne peut pas descendre dans le navigateur : elle est derrière
     * /api/rcs, qui répond même sans registre national configuré.
     */
    if (vers.villeRcs && societe.codePostal) {
      const cible = vers.villeRcs;
      fetch(
        "/api/rcs?codePostal=" +
          encodeURIComponent(societe.codePostal) +
          "&ville=" +
          encodeURIComponent(societe.commune)
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((corps: { villeRcs?: string } | null) => {
          const trouve = corps?.villeRcs || societe.commune;
          if (trouve) majValeurs((valeurs) => ({ ...valeurs, [cible]: trouve }));
        })
        .catch(() => {
          // Injoignable : la commune vaut mieux que rien, et reste corrigeable.
          if (societe.commune) majValeurs((v) => ({ ...v, [cible]: societe.commune }));
        });
    }

    if (vers.capital && societe.siren) {
      const cible = vers.capital;
      fetch("/api/societe/" + encodeURIComponent(societe.siren))
        .then((r) => (r.ok ? r.json() : null))
        .then((corps: { societe?: { capital?: number | null } } | null) => {
          const capital = corps?.societe?.capital;
          if (typeof capital === "number") {
            majValeurs((valeurs) => ({ ...valeurs, [cible]: capital }));
          }
        })
        .catch(() => {
          // Capital non publié ou registre muet : il se saisit à la main.
        });
    }
  }

  if (etat.codes.length === 0) {
    return (
      <p className={styles.description}>
        Revenez à l&apos;étape précédente pour choisir ce qui change.
      </p>
    );
  }

  const choisies = definitions(etat.codes);

  /*
   * Ce qui manque, changement par changement.
   *
   * Quatre modifications à la suite formaient une seule coulée : les titres avaient le
   * poids d'un libellé de champ, rien ne disait où l'une finissait, et l'on ne savait
   * pas laquelle était encore à remplir.
   */
  const incomplete = (code: string) => {
    const champs = new Set(
      MODIFICATIONS.find((m) => m.code === code)?.champs.map((c) => c.identifiant) ?? []
    );
    if (code === "cession_parts") {
      return restants.some((a) => a.champ === "cessions" || a.champ.startsWith("cession-"));
    }
    return restants.some((a) => champs.has(a.champ));
  };

  return (
    <div className={styles.detailsCorps}>
      {/*
        Le sommaire, en tête et sur une ligne.
        Une colonne à droite laissait un grand vide sous elle dès que les blocs
        s'allongeaient, et écrasait le formulaire à sa gauche. Ici il ne prend qu'une
        ligne, dit combien de changements restent, et mène à chacun.
      */}
      {choisies.length > 1 && (
        <nav className={styles.sommaire} aria-label="Les changements à renseigner">
          {choisies.map((definition, rang) => (
            <a
              key={definition.code}
              href={"#modif-" + definition.code}
              className={
                incomplete(definition.code)
                  ? styles.sommaireLien
                  : `${styles.sommaireLien} ${styles.sommaireFait}`
              }
            >
              <span className={styles.sommaireRang}>
                {incomplete(definition.code) ? rang + 1 : "✓"}
              </span>
              {definition.libelleCourt}
            </a>
          ))}
        </nav>
      )}

      {choisies.map((definition, rang) => (
        <section
          key={definition.code}
          id={"modif-" + definition.code}
          className={choisies.length > 1 ? styles.detailsBloc : undefined}
        >
          <h3 className={styles.detailsTitre}>
            {choisies.length > 1 && <span className={styles.etapeNum}>{rang + 1}</span>}
            {definition.libelle}
          </h3>

          {/*
            La cession ne se saisit pas en champs plats.
            Elle désigne des associés, se compte à plusieurs, et sa répartition se
            calcule : six cases côte à côte ne peuvent rien vérifier de tout cela.
          */}
          {definition.code === "cession_parts" ? (
            <Cessions
              associes={etat.assemblee.associes ?? []}
              cessions={etat.cessions ?? []}
              forme={etat.societe.forme}
              anomalies={anomalies}
              surAssocies={(associes) =>
                changer({ assemblee: { ...etat.assemblee, associes } })
              }
              surCessions={(cessions) => changer({ cessions })}
            />
          ) : (
          <div className={styles.champs}>
            {definition.champs
              .filter((champ) => champVisible(champ, etat.valeurs))
              .map((champ, rang, visibles) => (
                <Fragment key={champ.identifiant}>
                  {/*
                    L'intertitre paraît au premier champ visible de son groupe.
                    Il se calcule sur les champs affichés, non sur la définition : un
                    groupe entièrement masqué par une condition ne doit pas laisser son
                    titre seul au-dessus du groupe suivant.
                  */}
                  {champ.groupe && champ.groupe !== visibles[rang - 1]?.groupe && (
                    <h4 className={styles.champsGroupe}>{champ.groupe}</h4>
                  )}
                <Champ
                  champ={champ}
                  valeur={etat.valeurs[champ.identifiant]}
                  refus={anomalies.find((a) => a.champ === champ.identifiant)?.message}
                  surChangement={valeur}
                  surSociete={remplirDepuisLeRegistre}
                  surAdresse={(voie, complements) =>
                    majValeurs((valeurs) => {
                      const suite: Valeurs = { ...valeurs };
                      // Une complétion ne porte que le code postal et la ville : la
                      // voie vient du rappel précédent, dans le même cycle.
                      if (voie) suite[champ.identifiant] = voie;

                      // L'adresse du nouveau siège remplit aussi ses deux compagnons :
                      // les retaper serait la meilleure façon d'y glisser un écart.
                      // Les adresses sur une ligne se composent dans AdresseUneLigne.
                      if (champ.identifiant === "nouvelleAdresse" && complements) {
                        if (complements.codePostal) suite.nouveauCodePostal = complements.codePostal;
                        if (complements.ville) suite.nouvelleVille = complements.ville;
                      }
                      return suite;
                    })
                  }
                />
                </Fragment>
              ))}
          </div>
          )}
        </section>
      ))}
    </div>
  );
}

export function Champ({
  champ,
  valeur,
  refus,
  surChangement,
  surAdresse,
  surSociete,
}: {
  champ: ChampModification;
  valeur: string | number | undefined;
  refus?: string;
  surChangement: (identifiant: string, valeur: string | number) => void;
  surAdresse: (adresse: string, complements?: { codePostal?: string; ville?: string }) => void;
  surSociete: (champ: ChampModification, societe: SocieteTrouvee) => void;
}) {
  const classe = champ.pleineLargeur ? `${styles.champ} ${styles.pleineLargeur}` : styles.champ;
  const id = "champ-" + champ.identifiant;

  /*
   * Une société se cherche, elle ne se recopie pas.
   *
   * Le champ reste modifiable à la main : le registre ignore les sociétés étrangères
   * et retarde d'une formalité sur les autres. La recherche remplit, elle n'impose pas.
   */
  if (champ.type === "societe") {
    return (
      <div className={classe}>
        <RechercheAuRegistre
          id={id}
          libelle={champ.libelle}
          valeur={typeof valeur === "string" ? valeur : ""}
          surSaisie={(nom) => surChangement(champ.identifiant, nom)}
          surSelection={(societe) => surSociete(champ, societe)}
        />
        {champ.aide && <p className={styles.devisPrecision}>{champ.aide}</p>}
        {refus && <p role="alert">{refus}</p>}
      </div>
    );
  }

  if (champ.type === "adresse") {
    /*
     * Deux champs pour le nouveau siège, un seul partout ailleurs.
     *
     * Le siège a son code postal et sa ville à part, parce que l'annonce légale et le
     * greffe les lisent séparément. Les autres adresses tiennent sur une ligne, telles
     * qu'un acte les écrit, et reçoivent donc la proposition entière.
     */
    const enDeuxChamps = champ.identifiant === "nouvelleAdresse";

    return (
      <div className={classe}>
        <label htmlFor={id}>{champ.libelle}</label>
        {enDeuxChamps ? (
          <Adresse
            id={id}
            valeur={typeof valeur === "string" ? valeur : ""}
            surChangement={(voie) => surAdresse(voie)}
            surCompletion={(codePostal, ville) => surAdresse("", { codePostal, ville })}
          />
        ) : (
          <AdresseUneLigne
            id={id}
            valeur={typeof valeur === "string" ? valeur : ""}
            surChangement={(adresse) => surChangement(champ.identifiant, adresse)}
          />
        )}
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
      ) : champ.type === "date" ? (
        /*
          Notre calendrier, non celui du navigateur.
          Le champ natif ouvre un calendrier que rien ne peut habiller : bleu système,
          boutons dans une autre langue selon la machine, apparence différente sur
          chaque navigateur.
        */
        <ChampDate
          id={id}
          valeur={typeof valeur === "string" ? valeur : ""}
          surChangement={(iso) => surChangement(champ.identifiant, iso)}
        />
      ) : champ.type === "nombre" ? (
        /*
          Un champ de chiffres, sans compteur.
          `type="number"` accepte le signe moins - il n'y a pas de capital négatif - et
          sa molette change la valeur au passage du curseur, sans qu'on s'en aperçoive.
        */
        <ChampNombre
          id={id}
          valeur={valeur}
          decimales
          surChangement={(nombre) => surChangement(champ.identifiant, nombre)}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={valeur ?? ""}
          onChange={(e) => surChangement(champ.identifiant, e.target.value)}
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
        Le procès-verbal nomme qui décide et combien de parts chacun détient. Ce sont ces noms qui
        figureront au bas de l&apos;acte, sous les signatures.
      </p>

      <div className={styles.champs}>
        <div className={styles.champ}>
          <label htmlFor="assemblee-date">Date de l&apos;assemblée</label>
          <ChampDate
            id="assemblee-date"
            valeur={etat.assemblee.date ?? ""}
            surChangement={(iso) => changer({ assemblee: { ...etat.assemblee, date: iso } })}
          />
        </div>
      </div>

      {associes.map((associe, rang) => (
        <fieldset key={rang} className={styles.personne}>
          <legend>Associé {rang + 1}</legend>

          {/*
            Un associé peut être une société : une SCI détenue par une holding, une
            SAS dont un fonds est associé. L'acte doit alors la désigner par sa forme,
            son capital, son siège et son numéro, non par un prénom.
          */}
          <div className={styles.natures}>
            {(["physique", "morale"] as const).map((nature) => (
              <label
                key={nature}
                className={
                  (associe.nature ?? "physique") === nature
                    ? `${styles.nature} ${styles.natureChoisie}`
                    : styles.nature
                }
              >
                <input
                  type="radio"
                  name={"nature-" + rang}
                  checked={(associe.nature ?? "physique") === nature}
                  onChange={() => modifierAssocie(rang, { nature })}
                />
                {nature === "physique" ? "Une personne" : "Une société"}
              </label>
            ))}
          </div>

          {(associe.nature ?? "physique") === "morale" ? (
            <>
              <RechercheAuRegistre
                id={"associe-recherche-" + rang}
                surSelection={({ denomination, forme, siren, siege }) =>
                  /* Le code postal et la commune servent à déduire le greffe compétent,
                     dont la fiche d'un associé n'a que faire. */
                  modifierAssocie(rang, { denomination, forme, siren, siege })
                }
              />

              <div className={styles.champs}>
                <div className={styles.champ}>
                  <label htmlFor={"associe-denomination-" + rang}>Dénomination</label>
                  <input
                    id={"associe-denomination-" + rang}
                    value={associe.denomination ?? ""}
                    onChange={(e) => modifierAssocie(rang, { denomination: e.target.value })}
                  />
                </div>
                <div className={styles.champ}>
                  <label htmlFor={"associe-parts-" + rang}>Parts détenues</label>
                  <ChampNombre
                    id={"associe-parts-" + rang}
                    valeur={associe.parts ?? ""}
                    decimales={false}
                    surChangement={(nombre) =>
                      modifierAssocie(rang, { parts: nombre === "" ? null : nombre })
                    }
                  />
                </div>
                <div className={styles.champ}>
                  <label htmlFor={"associe-forme-" + rang}>Forme juridique</label>
                  <select
                    id={"associe-forme-" + rang}
                    value={associe.forme ?? ""}
                    onChange={(e) => modifierAssocie(rang, { forme: e.target.value })}
                  >
                    <option value="">Choisir</option>
                    {FORMES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.champ}>
                  <label htmlFor={"associe-siren-" + rang}>SIREN</label>
                  <input
                    id={"associe-siren-" + rang}
                    inputMode="numeric"
                    value={associe.siren ?? ""}
                    onChange={(e) => modifierAssocie(rang, { siren: e.target.value })}
                  />
                </div>
                <div className={styles.champ}>
                  <label htmlFor={"associe-capital-" + rang}>Capital, en euros</label>
                  <ChampNombre
                    id={"associe-capital-" + rang}
                    valeur={associe.capital ?? ""}
                    decimales={true}
                    surChangement={(nombre) =>
                      modifierAssocie(rang, { capital: nombre === "" ? null : nombre })
                    }
                  />
                </div>
                <div className={`${styles.champ} ${styles.pleineLargeur}`}>
                  <label htmlFor={"associe-siege-" + rang}>Siège social</label>
                  {/* Le siège part dans l'acte tel quel : il se cherche plutôt que de
                      se recopier depuis un extrait. */}
                  <AdresseUneLigne
                    id={"associe-siege-" + rang}
                    valeur={associe.siege ?? ""}
                    surChangement={(siege) => modifierAssocie(rang, { siege })}
                  />
                </div>
                <div className={styles.champ}>
                  <label htmlFor={"associe-representant-" + rang}>Représentée par</label>
                  <input
                    id={"associe-representant-" + rang}
                    placeholder="Monsieur Jean DUPONT"
                    value={associe.representant ?? ""}
                    onChange={(e) => modifierAssocie(rang, { representant: e.target.value })}
                  />
                </div>
                <div className={styles.champ}>
                  <label htmlFor={"associe-qualite-" + rang}>En qualité de</label>
                  <input
                    id={"associe-qualite-" + rang}
                    placeholder="Président"
                    value={associe.qualiteRepresentant ?? ""}
                    onChange={(e) =>
                      modifierAssocie(rang, { qualiteRepresentant: e.target.value })
                    }
                  />
                </div>
              </div>
            </>
          ) : (
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
                <ChampNombre
                  id={"associe-parts-" + rang}
                  valeur={associe.parts ?? ""}
                  surChangement={(nombre) =>
                    modifierAssocie(rang, { parts: nombre === "" ? null : nombre })
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
          )}
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
          Ces statuts serviront de base à la mise à jour : c&apos;est sur eux que les articles
          modifiés seront retouchés, à l&apos;étape suivante.
        </p>
        {/*
          Le document se lit comme un document, et ses actions sont sur lui.
          Une bande verte portant « Vos statuts : machin.pdf » ne disait ni d'où il
          venait ni ce qu'on pouvait en faire, et le bouton pour le changer flottait
          dessous, sans lien apparent avec lui.
        */}
        <DepotFichier
          id="statuts-remplacement"
          accepte=".pdf"
          depose={
            etat.statuts.source === "inpi"
              ? etat.statuts.nature
              : (etat.statuts.fichier ?? "Statuts déposés")
          }
          surFichier={deposer}
          surRetrait={() => changer({ statuts: undefined, retouches: [] })}
          desactive={enCours}
        />
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
              style={{
                padding: "12px 20px",
                border: "1px solid #e5e5e7",
                borderRadius: 10,
                background: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
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
        <DepotFichier
          id="statuts-depot"
          accepte=".pdf"
          invite="Déposez vos statuts à jour"
          precision="Un seul fichier, au format PDF"
          surFichier={deposer}
          desactive={enCours}
        />
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
  actesInitiaux,
}: {
  dossier: number;
  etat: EtatDuDossier;
  changer: (c: Partial<EtatDuDossier>) => void;
  actesInitiaux: ActeProduit[];
}) {
  const [documents, setDocuments] = useState<ActeProduit[]>(actesInitiaux);
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
      {/*
        Deux blocs de même facture : un titre, ce qu'il fait, son action à gauche.
        Le bouton de production portait la classe du bouton « Continuer », qui se colle
        à droite de la barre du bas par un margin-left automatique : seul dans sa rangée,
        il partait à droite en laissant derrière lui la largeur entière de la carte.
      */}
      <section className={styles.bloc}>
        <h3 className={styles.blocTitre}>Le procès-verbal et les actes</h3>
        <p className={styles.blocTexte}>
          Le procès-verbal porte toutes vos résolutions, numérotées dans l&apos;ordre. Un seul
          acte pour toute l&apos;assemblée, quel que soit le nombre de décisions.
        </p>

        {documents.length > 0 && (
          <ul className={styles.actes}>
            {documents.map((d) => (
              <li key={d.id} className={styles.acte}>
                <span className={styles.acteTitre}>{d.titre}</span>
                <span className={d.enRelecture ? styles.acteEnRelecture : styles.acteRemis}>
                  {d.enRelecture ? "En relecture" : "Relu, à votre disposition"}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/*
          Où sont passés les actes : dit ici, ou cherché en vain ailleurs.
          Un acte produit part chez l'avocat avant d'être remis - la liste seule
          laissait chercher un lien de téléchargement qui n'existe pas encore.
        */}
        {documents.some((d) => d.enRelecture) && (
          <p className={styles.blocNote}>
            Vos actes sont partis en relecture chez l&apos;avocat. Vous les retrouverez dans
            vos documents une fois relus, et vous serez prévenu à ce moment-là.
          </p>
        )}

        <div className={styles.blocActions}>
          <button
            type="button"
            /* Une fois les actes produits, reproduire n'est plus l'action attendue :
               c'est « Continuer » qui l'est, et deux boutons noirs se disputeraient l'œil. */
            className={documents.length > 0 ? undefined : styles.blocPrincipal}
            onClick={produire}
            disabled={enCours}
          >
            {enCours
              ? "Production"
              : documents.length > 0
                ? "Reproduire les actes"
                : "Produire les actes"}
          </button>
        </div>
      </section>

      {statutsAMettreAJour(etat.codes) && (
        <section className={styles.bloc}>
          <h3 className={styles.blocTitre}>Les statuts à jour</h3>

          {!etat.statuts ? (
            <p className={styles.blocTexte}>
              Revenez à l&apos;étape précédente : les statuts en vigueur ne sont pas encore au
              dossier.
            </p>
          ) : !editeurOuvert ? (
            <>
              <p className={styles.blocTexte}>
                {etat.statutsAJour
                  ? "Vos statuts à jour sont au dossier. Vous pouvez reprendre les retouches."
                  : "Nous repérons dans vos statuts les passages que vos décisions changent, et nous vous les proposons."}
              </p>
              <div className={styles.blocActions}>
                <button
                  type="button"
                  className={etat.statutsAJour ? undefined : styles.blocPrincipal}
                  onClick={ouvrirLEditeur}
                  disabled={enCours}
                >
                  {enCours ? "Lecture des statuts" : "Retoucher les statuts"}
                </button>
              </div>
            </>
          ) : (
            /*
              L'éditeur prend l'écran entier.
              Une page de statuts affichée dans une colonne de neuf cents pixels tient
              à moins de la moitié de sa taille, et les cadres de quelques points y
              deviennent des traits qu'on ne peut ni lire ni viser.
            */
            <PleinEcran
              titre="Mettre les statuts à jour"
              surFermeture={() => setEditeurOuvert(false)}
              action={
                <button
                  type="button"
                  className={styles.principal}
                  onClick={appliquer}
                  disabled={enCours}
                >
                  {enCours ? "Application" : "Appliquer et produire les statuts à jour"}
                </button>
              }
            >
              <Editeur
                dossier={dossier}
                pages={pages}
                zones={zones}
                retouches={retouches}
                reconnus={reconnus}
                surChangement={setRetouches}
              />
            </PleinEcran>
          )}
        </section>
      )}

      {refus && <p role="alert">{refus}</p>}
    </>
  );
}

/* -------------------------------------------------------- 7. Le règlement */

/**
 * Le récapitulatif et le règlement.
 *
 * Deux colonnes : ce qu'on a saisi à gauche, ce qu'on doit payer à droite. Le prix
 * et le bouton restent en vue pendant qu'on relit - la version précédente les posait
 * sous le récapitulatif, à deux mille pixels du haut, et il fallait descendre
 * jusqu'au bas de la page pour savoir combien on allait payer.
 */
function EtapeReglement({
  dossier,
  etat,
  anomalies,
  surCorrection,
}: {
  dossier: number;
  etat: EtatDuDossier;
  anomalies: { champ: string; message: string }[];
  /** Ramène à l'étape où se saisit le champ manquant. */
  surCorrection: (champ: string) => void;
}) {
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const ressortActuel = etat.societe.ville ?? "";
  const ressortNouveau =
    typeof etat.valeurs.nouvelleVille === "string" ? etat.valeurs.nouvelleVille : "";

  const chiffrage = devis({
    codes: etat.codes,
    ressortActuel,
    ressortNouveau,
    depotDesStatuts: statutsAMettreAJour(etat.codes),
  });

  const publications = publicationsAPrevoir({ codes: etat.codes, ressortActuel, ressortNouveau });
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
    <div className={styles.reglement}>
      <div className={styles.recapColonne}>
        <Bloc titre="Ce que vous changez">
          <ul className={styles.puces}>
            {definitions(etat.codes).map((d) => (
              <li key={d.code}>{d.libelle}</li>
            ))}
          </ul>
        </Bloc>

        <Bloc titre="La société">
          <dl className={styles.faits}>
            <Fait libelle="Dénomination" valeur={etat.societe.denomination} />
            <Fait libelle="Forme" valeur={etat.societe.forme} />
            <Fait libelle="SIREN" valeur={etat.societe.siren} />
            <Fait
              libelle="Siège"
              valeur={[etat.societe.adresse, etat.societe.codePostal, etat.societe.ville]
                .filter(Boolean)
                .join(" ")}
            />
          </dl>
        </Bloc>

        {definitions(etat.codes).map((definition) => {
          const remplis = definition.champs
            .filter((champ) => champVisible(champ, etat.valeurs))
            .filter((champ) => {
              const valeur = etat.valeurs[champ.identifiant];
              return typeof valeur === "number" || (typeof valeur === "string" && valeur.trim());
            });
          if (remplis.length === 0) return null;

          return (
            <Bloc key={definition.code} titre={definition.libelle}>
              <dl className={styles.faits}>
                {remplis.map((champ) => (
                  <Fait
                    key={champ.identifiant}
                    libelle={champ.libelle}
                    valeur={
                      champ.type === "date"
                        ? jourFrancais(String(etat.valeurs[champ.identifiant]))
                        : String(etat.valeurs[champ.identifiant])
                    }
                  />
                ))}
              </dl>
            </Bloc>
          );
        })}

        <Bloc titre="Les statuts">
          <p className={styles.faitTexte}>
            {etat.statuts
              ? etat.statuts.source === "inpi"
                ? "Repris au registre national" +
                  (etat.statuts.deposeLe
                    ? ", dépôt du " + jourFrancais(etat.statuts.deposeLe)
                    : "") +
                  (etat.statutsAJour ? ", retouchés et joints au dossier." : ".")
                : "Déposés par vos soins" + (etat.statutsAJour ? ", retouchés et joints." : ".")
              : "Non renseignés : l'avocat vous les demandera."}
          </p>
        </Bloc>

        <Bloc titre="Publication">
          {publications.length === 0 ? (
            <p className={styles.faitTexte}>
              Aucune annonce légale n&apos;est requise pour ce changement.
            </p>
          ) : (
            <dl className={styles.faits}>
              {publications.map((p, rang) => (
                <Fait key={rang} libelle={p.ressort} valeur={p.motif} />
              ))}
            </dl>
          )}
        </Bloc>

        {pieces.length > 0 && (
          <Bloc titre="Justificatifs à fournir">
            <ul className={styles.puces}>
              {pieces.map((piece) => (
                <li key={piece.identifiant}>
                  {piece.titre}
                  <span className={styles.faitPrecision}>{piece.explication}</span>
                </li>
              ))}
            </ul>
          </Bloc>
        )}
      </div>

      {/*
        Le bloc de règlement reste en vue pendant qu'on relit le récapitulatif.
        C'est la seule action de l'écran : la placer sous plusieurs écrans de texte
        obligeait à descendre pour connaître le prix, puis à remonter pour vérifier.
      */}
      <aside className={styles.paiementColonne}>
        <div className={styles.paiementCarte}>
          <span className={styles.paiementLibelle}>À régler aujourd&apos;hui</span>
          <span className={styles.paiementMontant}>{montantLisible(chiffrage.totalTTC)}</span>
          <span className={styles.paiementDetail}>
            {montantLisible(chiffrage.honorairesHT)} HT d&apos;honoraires,{" "}
            {montantLisible(chiffrage.fraisTTC)} de frais avancés
          </span>

          {/*
            Un dossier incomplet n'arrive normalement pas jusqu'ici : chaque étape
            refuse d'avancer tant qu'il lui manque quelque chose. Ce bloc est le
            filet - un dossier ouvert avant cette règle, ou repris par son adresse.
          */}
          {anomalies.length > 0 ? (
            <>
              <p className={styles.paiementManque}>
                {anomalies.length === 1
                  ? "Une information manque : "
                  : anomalies.length + " informations manquent : "}
                {anomalies.map((a) => a.message).join(", ")}.
              </p>
              <button
                type="button"
                className={styles.paiementBouton}
                onClick={() => surCorrection(anomalies[0].champ)}
              >
                Corriger
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.paiementBouton}
              onClick={payer}
              disabled={enCours}
            >
              {enCours ? "Ouverture du paiement" : "Régler et confier à un avocat"}
            </button>
          )}

          <p className={styles.paiementDelai}>{DELAI}</p>
          {refus && (
            <p className={styles.paiementManque} role="alert">
              {refus}
            </p>
          )}
        </div>

        <ul className={styles.prestationsCompactes}>
          {PRESTATIONS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>

        <details className={styles.detailPrix}>
          <summary>Le détail du prix</summary>
          <dl className={`${styles.faits} ${styles.faitsPrix}`}>
            {chiffrage.honoraires.map((ligne, rang) => (
              <Fait
                key={"h" + rang}
                libelle={ligne.libelle}
                valeur={montantLisible(ligne.centimes) + " HT"}
              />
            ))}
            {chiffrage.frais.map((ligne, rang) => (
              <Fait
                key={"f" + rang}
                libelle={ligne.libelle}
                valeur={montantLisible(ligne.centimes) + (ligne.horsTaxes ? " HT" : " TTC")}
                precision={ligne.precision}
              />
            ))}
          </dl>
        </details>
      </aside>

    </div>
  );
}

/** Un bloc du récapitulatif : un titre, et ce qu'il contient. */
function Bloc({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className={styles.bloc}>
      <h3 className={styles.blocTitre}>{titre}</h3>
      {children}
    </section>
  );
}

/**
 * Un fait du récapitulatif.
 *
 * Une définition, non une carte : la version précédente réutilisait les lignes du
 * devis, que globals.css habille en cartes bordées. Quinze faits faisaient quinze
 * cartes pleine largeur, et le récapitulatif tenait sur trois écrans.
 */
function Fait({
  libelle,
  valeur,
  precision,
}: {
  libelle: string;
  valeur?: string | null;
  precision?: string;
}) {
  if (!valeur?.trim()) return null;

  return (
    <div className={styles.fait}>
      <dt>{libelle}</dt>
      <dd>
        {/* La valeur porte sa propre balise : le détail du prix l'empêche de se couper,
            ce qu'on ne peut pas demander à un nœud de texte nu. */}
        <span className={styles.faitValeur}>{valeur}</span>
        {precision && <span className={styles.faitPrecision}>{precision}</span>}
      </dd>
    </div>
  );
}

/**
 * Un écran entier, pour un travail qui le demande.
 *
 * Posé sur le document plutôt que dans la page : le gabarit met la colonne en
 * position:sticky, ce qui crée un contexte d'empilement où un z-index resterait
 * prisonnier.
 */
function PleinEcran({
  titre,
  action,
  surFermeture,
  children,
}: {
  titre: string;
  action: ReactNode;
  surFermeture: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function auClavier(e: KeyboardEvent) {
      // Échap ferme, sauf quand on est en train d'écrire dans un cadre.
      if (e.key === "Escape" && !(e.target as HTMLElement)?.matches?.("input, textarea, select")) {
        surFermeture();
      }
    }
    document.addEventListener("keydown", auClavier);

    // Le fond ne défile pas derrière : on travaille sur la page, pas sur le parcours.
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", auClavier);
      document.body.style.overflow = avant;
    };
  }, [surFermeture]);

  return createPortal(
    <div className={styles.pleinEcran} role="dialog" aria-modal="true" aria-label={titre}>
      <div className={styles.pleinEcranTete}>
        <h2 className={styles.pleinEcranTitre}>{titre}</h2>
        <div className={styles.pleinEcranActions}>
          <button type="button" className={styles.pleinEcranFermer} onClick={surFermeture}>
            Fermer
          </button>
          {action}
        </div>
      </div>
      <div className={styles.pleinEcranCorps}>{children}</div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------- Les obligations */

function Obligations({
  codes,
  valeurs,
  forme,
}: {
  codes: string[];
  valeurs: Valeurs;
  /* La forme décide de la solidité de la dispense de commissaire aux apports. */
  forme?: string | null;
}) {
  const dites = obligationsParticulieres(codes, valeurs, forme);
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
