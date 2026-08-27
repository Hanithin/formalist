"use client";

import { formeDeLaCategorie, libelleDeLaCategorie } from "@/domain/formalite/categories-juridiques";
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
import { Adresse, AdresseUneLigne, Ville } from "@/components/formulaire/Adresse";
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
  verifierLesParts,
  type Societe,
} from "@/domain/modification/verification";
import {
  publicationsAPrevoir,
  piecesAFournir,
  type PieceAFournir,
  obligationsParticulieres,
  statutsAMettreAJour,
} from "@/domain/modification/formalites";
import { anomaliesDuPvAge } from "@/domain/modification/pv-age";
import { anomaliesDuTraite } from "@/domain/modification/traite-apport";
import { anomaliesDeLActeDeCession } from "@/domain/modification/acte-cession";
import { devis, montantLisible, PRESTATIONS, DELAI } from "@/domain/modification/offre";
import type { Retouche, Zone } from "@/domain/modification/edition";
import type { ActeProduit } from "@/domain/document/publication";
import styles from "./Modification.module.css";
import { remonterEnHaut } from "@/lib/defilement";
import { memoriserEtape } from "@/lib/etape-dans-l-adresse";
import { qualitesDuRepresentant } from "@/domain/formalite/formes";
import { Pieces } from "@/components/formulaire/Pieces";

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

/*
 * Le règlement avant les actes.
 *
 * Les actes venaient d'abord : on produisait le procès-verbal et les statuts à jour,
 * puis on demandait à payer. Le travail était donc fait avant d'être commandé, et le
 * client repartait avec ses actes sans avoir rien réglé.
 *
 * Les justificatifs se déposent au même écran que le règlement, avant lui : l'avocat
 * qui reçoit un dossier payé mais incomplet doit relancer quelqu'un qui a déjà quitté
 * l'écran, et la formalité attend.
 */
const ETAPES = [
  { numero: 1, titre: "La société", court: "Société" },
  { numero: 2, titre: "Ce que vous changez", court: "Changements" },
  { numero: 3, titre: "Les détails", court: "Détails" },
  { numero: 4, titre: "L'assemblée", court: "Assemblée" },
  { numero: 5, titre: "Les statuts en vigueur", court: "Statuts" },
  { numero: 6, titre: "Justificatifs et règlement", court: "Règlement" },
  { numero: 7, titre: "Vos actes", court: "Actes" },
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
  assemblee: { date?: string | null; totalParts?: number | null; associes?: Associe[] };
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
  /** Les justificatifs déjà remis : l'étape du règlement en dépend pour laisser payer. */
  piecesDeposees: { type: string; nom: string }[];
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
  piecesDeposees,
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

  /*
   * Les incohérences du procès-verbal se lisent ici, pas à la génération.
   *
   * Elles ne portent pas sur un champ vide mais sur deux valeurs qui ne s'accordent
   * pas - un capital de départ qui n'est pas celui de la société, un nouveau capital
   * que le nombre de titres ne donne pas. Laissées à la production des actes, elles
   * arrêtaient un dossier déjà réglé.
   */
  const anomalies = [
    ...verifierChamps(etat.codes, etat.valeurs, etat.societe.forme),
    ...verifierCoherence(etat.codes, etat.valeurs),
    ...anomaliesDuPvAge({
      societe: etat.societe,
      assemblee: etat.assemblee,
      codes: etat.codes,
      valeurs: etat.valeurs,
      cessions: etat.cessions,
    }),
    ...(etat.codes.includes("apport_titres")
      ? anomaliesDuTraite({
          societe: etat.societe,
          assemblee: etat.assemblee,
          codes: etat.codes,
          valeurs: etat.valeurs,
          cessions: etat.cessions,
        })
      : []),
    ...(etat.codes.includes("cession_parts")
      ? anomaliesDeLActeDeCession({
          societe: etat.societe,
          assemblee: etat.assemblee,
          codes: etat.codes,
          valeurs: etat.valeurs,
          cessions: etat.cessions,
        })
      : []),
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

  /*
   * Même raison pour l'assemblée : le capital d'un associé société arrive du registre
   * national après un aller-retour, et une écriture bâtie sur l'état de son rendu
   * effacerait la dénomination et le siège qu'on venait d'inscrire.
   */
  function majAssemblee(maj: (assemblee: EtatDuDossier["assemblee"]) => EtatDuDossier["assemblee"]) {
    setEtat((precedent) => ({ ...precedent, assemblee: maj(precedent.assemblee) }));
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
        ? [
            ...anomalies,
            ...verifierCessions(
              etat.assemblee.associes ?? [],
              etat.cessions ?? [],
              etat.societe.forme,
              typeof etat.valeurs.agrementRequis === "string" ? etat.valeurs.agrementRequis : ""
            ),
          ]
        : anomalies;
    }
    /*
     * L'assemblée : tout le capital doit être représenté.
     *
     * Le total des parts est déclaré à l'étape, les parts de chacun s'y ajoutent. Un
     * écart signifie qu'un associé manque à l'appel - ou qu'on lui a attribué trop de
     * parts. Continuer avec un procès-verbal qui ne représente que la moitié du
     * capital, c'est le faire retoquer plus loin, quand tout est déjà signé.
     */
    if (etape === 4) return verifierLesParts(etat.assemblee);
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
  /*
   * Le règlement vit ici, non dans l'étape qui l'affiche.
   *
   * Deux endroits l'appellent : la carte de droite, où l'on lit le prix, et la barre du
   * bas, au terme d'un récapitulatif qui fait deux écrans. La barre y remplace
   * « Continuer » - continuer vers quoi, quand l'étape suivante attend d'être payée ?
   */
  const [reglementRefuse, setReglementRefuse] = useState<string | null>(null);
  const [reglementEnCours, demarrerReglement] = useTransition();

  const piecesDuDossier = piecesAFournir(etat.codes, etat.valeurs);
  const piecesRemises = new Set(piecesDeposees.map((d) => d.type));
  /*
   * On ne retient le paiement que sur les pièces obligatoires : les autres sont utiles,
   * non exigibles, et bloquer pour l'une d'elles la rendrait obligatoire sans le dire.
   */
  const piecesManquantes = piecesDuDossier.filter(
    (p) => p.obligatoire && !piecesRemises.has(p.identifiant)
  );

  function reglerLaFormalite() {
    setReglementRefuse(null);
    demarrerReglement(async () => {
      const reponse = await fetch("/api/formalites/modification/paiement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier }),
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok || !corps.adresse) {
        setReglementRefuse(corps.error ?? "Le règlement n'a pas pu être ouvert");
        return;
      }
      window.location.href = corps.adresse;
    });
  }

  /** Tout est là : la formalité peut être réglée. */
  const reglementPossible =
    anomaliesSociete.length === 0 && anomalies.length === 0 && piecesManquantes.length === 0;

  function suivante(depuis: number): number {
    if (depuis === 1 && etat.codes.length > 0) return 3;
    return depuis + 1;
  }

  /** Enregistre puis avance : l'étape suivante lit ce que le serveur a retenu. */
  function aller(vers: number) {
    setErreur(null);

    /*
     * Les actes attendent le règlement.
     *
     * C'est le sens de l'ordre des étapes : le procès-verbal et les statuts à jour
     * sont le travail commandé, non un aperçu. La frise grise la pastille et ne la
     * rend pas cliquable ; ce contrôle-ci couvre le reste - un retour d'historique,
     * une adresse tapée à la main, un `?etape=7` gardé en favori.
     */
    if (vers === ETAPES.length && !etat.paye) {
      setErreur("Vos actes seront produits dès le règlement de la formalité.");
      return;
    }

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
      memoriserEtape(dossier, vers);
      setAtteinte((loin) => Math.max(loin, vers));
      remonterEnHaut();
    });
  }

  const definitionsChoisies = definitions(etat.codes);

  return (
    <div className={styles.parcours}>
      {issueDuPaiement && <FinDePaiement issue={issueDuPaiement} dossier={dossier} />}

      {/* La dernière étape ne s'ouvre qu'une fois la formalité réglée. */}
      <Frise
        etape={etape}
        atteinte={etat.paye ? atteinte : Math.min(atteinte, ETAPES.length - 1)}
        surChoix={aller}
      />

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
          Ce que le droit impose, replié en tête.

          Ces rappels s'empilaient tout en bas de l'étape, dépliés, sur un fond ambre
          qui prenait un écran entier - six paragraphes d'articles de code sous un
          formulaire qu'on venait de remplir. Personne ne les lit là : on y arrive
          après avoir décidé, quand il n'y a plus rien à en faire. En tête et repliés,
          ils s'annoncent avant la saisie et s'ouvrent quand on veut les lire.
        */}
        {definitionsChoisies.length > 0 && etape >= 2 && etape <= 4 && (
          <Obligations codes={etat.codes} valeurs={etat.valeurs} forme={etat.societe.forme} />
        )}

        {/*
          Ce qui a été coché avant d'entrer, rappelé là où l'on entre.
          Sans ce rappel, l'étape 2 est enjambée sans explication : on passe de la
          société aux détails, et rien ne dit où sont partis les changements. La
          reprise se fait par le fil, une fois l'étape 3 atteinte.
        */}
        {etape === 1 && definitionsChoisies.length > 0 && (
          <div className={styles.rappelChoix}>
            <div className={styles.rappelTete}>
              <span className={styles.rappelIntitule}>
                Ce que vous modifiez
                <span className={styles.rappelCompte}>{definitionsChoisies.length}</span>
              </span>
            </div>

            {/*
              Des pastilles, non une phrase.

              Les six changements s'écrivaient en une énumération séparée de virgules,
              sur deux lignes pleines : on la lisait comme un texte alors qu'on veut y
              vérifier une liste. Chacun a maintenant sa pastille, et l'œil en compte
              les éléments sans les lire.
            */}
            <ul className={styles.rappelListe}>
              {definitionsChoisies.map((d) => (
                <li key={d.code} className={styles.rappelPastille}>
                  {d.libelleCourt}
                </li>
              ))}
            </ul>
          </div>
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

        {etape === 4 && (
          <EtapeAssemblee etat={etat} changer={changer} majAssemblee={majAssemblee} />
        )}

        {etape === 5 && <EtapeStatuts dossier={dossier} etat={etat} changer={changer} />}

        {etape === 6 && (
          <EtapeReglement
            etat={etat}
            anomalies={[...anomaliesSociete, ...anomalies]}
            dossier={dossier}
            pieces={piecesDuDossier}
            manquantes={piecesManquantes}
            piecesDeposees={piecesDeposees}
            payer={reglerLaFormalite}
            enCoursDeReglement={reglementEnCours}
            refusDuReglement={reglementRefuse}
            surCorrection={(champ) => aller(CHAMPS_DE_SOCIETE.includes(champ) ? 1 : 3)}
          />
        )}

        {etape === 7 && (
          <EtapeActes
            dossier={dossier}
            etat={etat}
            changer={changer}
            actesInitiaux={actesInitiaux}
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
          {/*
            À l'étape du règlement, la barre règle.

            « Continuer » y menait vers une étape verrouillée, et l'on se voyait
            répondre que les actes attendent le paiement - la réponse à un geste qu'on
            n'avait pas demandé. Le bouton porte donc l'action de l'écran.
          */}
          {etape === ETAPES.length - 1 && !etat.paye && (
            <button
              type="button"
              className={styles.principal}
              onClick={reglerLaFormalite}
              disabled={reglementEnCours || !reglementPossible}
            >
              {reglementEnCours ? "Ouverture du paiement" : "Régler et confier à un avocat"}
            </button>
          )}

          {etape < ETAPES.length && (etape !== ETAPES.length - 1 || etat.paye) && (
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

    </div>
  );
}

/* -------------------------------------------------------------- Le fil */

/**
 * Interroge l'annuaire public des entreprises.
 *
 * L'annuaire ne cherche que des mots entiers : « gremlins commu » ne trouve rien,
 * quand « gremlins communication » trouve la société. Personne ne tape un nom complet
 * avant d'attendre une suggestion - c'est tout l'intérêt d'en proposer.
 *
 * On retente donc sans le dernier mot, celui qu'on est en train d'écrire : la liste
 * se remplit dès les premières lettres, et se resserre à mesure qu'on les termine.
 */
async function chercherAuRegistre(
  terme: string,
  signal: AbortSignal
): Promise<ResultatRecherche[]> {
  async function interroger(question: string, combien: number): Promise<ResultatRecherche[]> {
    const reponse = await fetch(
      "https://recherche-entreprises.api.gouv.fr/search?q=" +
        encodeURIComponent(question) +
        "&per_page=" +
        combien +
        "&page=1",
      { signal }
    );
    if (!reponse.ok) return [];
    const donnees = (await reponse.json()) as { results?: ResultatRecherche[] };
    return donnees.results ?? [];
  }

  const propre = terme.trim().replace(/\s+/g, " ");
  const trouves = await interroger(propre, MONTREES);
  if (trouves.length > 0) return trouves;

  const mots = propre.split(" ");
  if (mots.length < 2) return [];

  /*
   * Le repli remonte large, puis remet en ordre.
   *
   * « gremlins commu » cherché sur « gremlins » seul rend d'abord les trois « LES
   * GREMLINS », et « GREMLINS COMMUNICATION » - celui qu'on est en train d'écrire -
   * se perd au-delà du sixième. On en demande vingt et l'on fait remonter ceux dont
   * le nom porte le mot commencé.
   */
  const amorce = normaliser(mots[mots.length - 1]);
  const larges = await interroger(mots.slice(0, -1).join(" "), 20);

  return larges
    .map((r, rang) => ({
      r,
      /* Le rang de l'annuaire départage ceux qui répondent aussi bien. */
      score: normaliser(r.nom_complet ?? r.nom_raison_sociale ?? "").includes(amorce) ? -1 : 0,
      rang,
    }))
    .sort((a, b) => a.score - b.score || a.rang - b.rang)
    .slice(0, MONTREES)
    .map((x) => x.r);
}

/** Le nombre de suggestions affichées : au-delà, la liste couvre le formulaire. */
const MONTREES = 6;

/** Sans accents ni casse : « communication » se reconnaît dans « COMMUNICATION ». */
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

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
    <ol className={styles.frise}>
      {ETAPES.map((e) => {
        const faite = e.numero < etape;
        const courante = e.numero === etape;
        /* « À venir » est l'état par défaut : il n'a pas de classe. */
        const ton = faite ? styles.friseFaite : courante ? styles.friseCourante : "";
        const marque = faite ? (
          <svg viewBox="0 0 24 24" {...TRAITS} aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          e.numero
        );

        return (
          <li key={e.numero} className={`${styles.friseEtape} ${ton}`}>
            {/*
              Une étape déjà atteinte se rouvre d'un clic.
              Celles qu'on n'a pas encore vues ne sont pas des boutons : y sauter
              enjamberait les contrôles qui gardent les précédentes.
            */}
            {e.numero <= atteinte ? (
              <button
                type="button"
                className={styles.friseGeste}
                onClick={() => surChoix(e.numero)}
                aria-current={courante ? "step" : undefined}
              >
                <span className={styles.friseMarque}>{marque}</span>
                <span className={styles.friseLibelle}>{e.court}</span>
              </button>
            ) : (
              <span className={styles.friseGeste}>
                <span className={styles.friseMarque}>{marque}</span>
                <span className={styles.friseLibelle}>{e.court}</span>
              </span>
            )}
          </li>
        );
      })}
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
  /**
   * La forme, si la catégorie du registre en désigne une.
   *
   * Vide sinon - une société étrangère, un GIE, une association n'en ont pas au sens de
   * nos actes. Vide ne veut pas dire « garde la précédente » : c'est ce contresens qui
   * faisait porter à une SELAS la forme de la société cherchée juste avant.
   */
  forme: string;
  /** Le code à quatre chiffres du registre, tel quel. */
  categorie: string;
  /** Ce que ce code veut dire, en toutes lettres, pour pouvoir le montrer. */
  libelleCategorie: string;
  siren: string;
  /** Le siège sur une ligne, tel qu'un acte l'écrit. */
  siege: string;
  /** Les deux morceaux, pour qui doit en déduire le greffe compétent. */
  codePostal: string;
  commune: string;
}

/**
 * Le siège sur une ligne, sans le répéter.
 *
 * L'annuaire rend une adresse déjà complète - « 34 RUE LAUGIER 75017 PARIS » - et,
 * à côté, le code postal et la commune séparément. On collait les trois : le siège
 * d'un associé s'écrivait « 34 RUE LAUGIER 75017 PARIS 75017 PARIS », et partait tel
 * quel dans l'acte.
 */
/**
 * Le capital d'une société, au registre national.
 *
 * L'annuaire public ne le publie pas ; le relais `/api/societe/{siren}` interroge
 * l'INPI, qui exige un compte connecté. Une panne de ce côté ne doit rien empêcher :
 * le champ reste saisissable, et l'on rend simplement « on ne sait pas ».
 */
async function capitalAuRegistre(siren: string): Promise<number | null> {
  const propre = (siren ?? "").replace(/\s/g, "");
  if (!/^\d{9}$/.test(propre)) return null;

  try {
    const reponse = await fetch("/api/societe/" + encodeURIComponent(propre));
    if (!reponse.ok) return null;
    const donnees = (await reponse.json()) as { societe?: { capital?: number | null } };
    return typeof donnees.societe?.capital === "number" ? donnees.societe.capital : null;
  } catch {
    return null;
  }
}

function siegeSurUneLigne(siege: {
  adresse?: string;
  code_postal?: string;
  libelle_commune?: string;
}): string {
  const complete = (siege.adresse ?? "").trim();
  const codePostal = (siege.code_postal ?? "").trim();

  // L'adresse porte déjà le code postal : elle porte donc aussi la commune.
  if (codePostal && complete.includes(codePostal)) return complete;

  return [complete, codePostal, siege.libelle_commune].filter(Boolean).join(" ").trim();
}

export function RechercheAuRegistre({
  id,
  libelle = "Chercher la société au registre",
  valeur,
  surSaisie,
  surSelection,
  compacte = false,
}: {
  id: string;
  libelle?: string;
  /**
   * Posée en bout de ligne plutôt qu'en tête de fiche.
   *
   * Dans la fiche d'un associé, la recherche prenait une rangée entière pour un champ
   * qu'on n'utilise qu'une fois, au tout début. Compacte, elle tient à droite des deux
   * onglets, là où il n'y avait rien - et son intitulé passe au placeholder, l'étiquette
   * restant lisible aux lecteurs d'écran.
   */
  compacte?: boolean;
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
  const [remarque, setRemarque] = useState<string | null>(null);
  const frappe = useRef(false);

  useEffect(() => {
    if (!frappe.current) return;
    frappe.current = false;
    if (terme.trim().length < 3) return;

    const abandon = new AbortController();
    const minuteur = setTimeout(async () => {
      try {
        setResultats(await chercherAuRegistre(terme, abandon.signal));
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

    const categorie = resultat.nature_juridique ?? "";
    const forme = formeDeLaCategorie(categorie) ?? "";
    const libelleCategorie = libelleDeLaCategorie(categorie) ?? "";

    /*
     * Dire ce qu'on a lu quand on ne sait pas le traduire.
     *
     * Une catégorie sans forme correspondante laissait le champ vide, sans rien dire :
     * on ne pouvait pas savoir si le registre n'avait rien répondu ou si sa réponse
     * n'avait pas été comprise. La nommer permet de choisir en connaissance de cause.
     */
    setRemarque(
      forme || !libelleCategorie
        ? null
        : "Le registre indique « " +
            libelleCategorie +
            " » : choisissez la forme à écrire dans les actes."
    );

    surSelection({
      denomination: nom,
      forme,
      categorie,
      libelleCategorie,
      siren: resultat.siren ?? "",
      siege: siegeSurUneLigne(siege),
      codePostal: siege.code_postal ?? "",
      commune: siege.libelle_commune ?? "",
    });
  }

  return (
    <div className={compacte ? `${styles.recherche} ${styles.rechercheCompacte}` : styles.recherche}>
      <label htmlFor={id} className={compacte ? styles.invisible : undefined}>
        {libelle}
      </label>
      <input
        id={id}
        value={terme}
        autoComplete="off"
        placeholder={compacte ? "Rechercher une société" : "Nom ou SIREN"}
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

      {/*
        Rien trouvé : on le dit.

        La liste ne s'affichait que si elle avait quelque chose à montrer : sur un nom
        introuvable, l'écran ne répondait rien, et l'on ne savait pas si la recherche
        tournait, si l'annuaire était en panne, ou si la société n'y était pas.
      */}
      {ouvert && resultats.length === 0 && (
        <p className={styles.resultatVide}>
          Aucune société de ce nom au registre. Vérifiez l&apos;orthographe, essayez le
          SIREN, ou remplissez les champs à la main.
        </p>
      )}

      {/*
        La catégorie lue, quand elle ne désigne aucune de nos formes.

        Le champ restait vide sans rien dire : on ne pouvait pas distinguer une réponse
        absente d'une réponse incomprise. Le registre parle en codes à quatre chiffres,
        et tous ne désignent pas une société - un GIE, une association, une société
        étrangère n'ont pas de forme au sens de nos actes.
      */}
      {remarque && <p className={styles.resultatVide}>{remarque}</p>}
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
        setResultats(await chercherAuRegistre(terme, abandon.signal));
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

    /*
     * La mise à jour part de l'état courant, non de celui qu'on avait en entrant.
     *
     * `changer({ societe: { ...etat.societe } })` fige la société telle qu'elle était
     * au premier rendu. Le capital arrive après un aller-retour au registre national,
     * et l'écriture qui le posait rendait à `etat.societe` sa valeur d'avant - la
     * forme juridique, l'adresse et la ville qu'on venait d'inscrire repassaient à
     * blanc au moment même où le capital s'affichait.
     */
    /*
     * La forme ne s'hérite pas.
     *
     * `?? societe.forme` gardait la forme en place quand la catégorie du registre
     * n'était pas traduite : chercher une société après une autre lui collait la forme
     * de la précédente. Une SELAS devenait la SARL cherchée juste avant, sans que rien
     * ne le signale. Une catégorie non traduite laisse le champ à choisir.
     */
    const categorie = resultat.nature_juridique ?? "";
    const forme = formeDeLaCategorie(categorie) ?? "";
    const libelleCategorie = libelleDeLaCategorie(categorie);

    majSociete((societe) => ({
      ...societe,
      denomination: nom,
      forme,
      siren: resultat.siren ?? "",
      adresse: siege.adresse ?? "",
      codePostal: siege.code_postal ?? "",
      ville: siege.libelle_commune ?? "",
    }));

    if (!forme && libelleCategorie) {
      setMessage(
        "Le registre indique « " + libelleCategorie + " » : choisissez la forme à écrire dans les actes."
      );
    }

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
        majSociete((societe) => ({ ...societe, capital }));
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
      {/*
        Ce qu'on demande, et ce qui arrive ensuite.

        La phrase disait « cherchez la société au registre », sans dire lequel ni où
        chercher, puis « son siège et son capital se remplissent seuls », qui décrit un
        formulaire agissant de lui-même, puis « le registre peut être en retard sur
        vous », dont personne ne devine ce qu'il faut en faire. Elle dit maintenant le
        geste, d'où viennent les données, et pourquoi on peut les corriger.
      */}
      <p className={styles.description}>
        Tapez le nom ou le SIREN de votre société : nous reprenons sa forme, son siège
        et son capital depuis le registre du commerce. Vous pouvez tout corriger
        ensuite, car le registre n&apos;est pas toujours à jour.
      </p>

      {/*
        La recherche prend toute la largeur.

        Bornée à 460 px par la feuille globale, elle s'arrêtait au milieu de la carte
        pendant que les champs qu'elle remplit s'étendaient sur deux colonnes en
        dessous : le formulaire semblait coupé en son milieu. Elle est le geste
        principal de l'étape - elle occupe donc la ligne, avec sa loupe.
      */}
      <div className={`${styles.recherche} ${styles.recherchePrincipale}`}>
        <label htmlFor="recherche-societe">Nom ou SIREN de la société</label>

        <div className={styles.rechercheChamp}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
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
        </div>

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

      {/*
        Rien trouvé : on le dit.

        La liste ne s'affichait que si elle avait quelque chose à montrer : sur un nom
        introuvable, l'écran ne répondait rien, et l'on ne savait pas si la recherche
        tournait, si l'annuaire était en panne, ou si la société n'y était pas.
      */}
      {ouvert && resultats.length === 0 && (
        <p className={styles.resultatVide}>
          Aucune société de ce nom au registre. Vérifiez l&apos;orthographe, essayez le
          SIREN, ou remplissez les champs à la main.
        </p>
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
          {/* La commune se cherche, et rapporte son code postal - comme l'adresse
              au-dessus rapporte les deux. */}
          <Ville
            id="societe-ville"
            valeur={etat.societe.ville ?? ""}
            surChangement={(ville) => champSociete("ville", ville)}
            surCompletion={(codePostal, ville) =>
              majSociete((societe) => ({ ...societe, codePostal, ville }))
            }
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

  /*
   * Un changement ouvert à la fois.
   *
   * Six changements dépliés font une page de six formulaires bout à bout - le
   * transfert de siège en compte six champs, l'apport de titres vingt-six. On y
   * descendait sans jamais voir où l'on en était, et le sommaire posé en tête
   * disparaissait dès le premier écran.
   *
   * Celui qu'on ouvre referme le précédent : c'est ce qui garde la page à hauteur
   * d'écran et rend le sommaire utile. Un dossier à un seul changement n'a rien à
   * replier, et reste ouvert.
   */
  const [ouvert, setOuvert] = useState<string | null>(null);

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
              /* Le sommaire déplie ce qu'il désigne : y mener un bloc replié ne
                 montrerait qu'un titre. */
              onClick={() => setOuvert(definition.code)}
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

      {choisies.map((definition, rang) => {
        /*
         * Le premier incomplet s'ouvre de lui-même.
         *
         * Tant que rien n'a été déplié à la main, c'est là qu'il y a du travail : on
         * arrive sur l'étape le formulaire déjà ouvert, sans un clic pour commencer.
         */
        const premierIncomplet = choisies.find((d) => incomplete(d.code))?.code ?? choisies[0].code;
        const seul = choisies.length === 1;
        const deplie = seul || (ouvert ?? premierIncomplet) === definition.code;
        const fait = !incomplete(definition.code);

        return (
        <section
          key={definition.code}
          id={"modif-" + definition.code}
          className={
            seul
              ? undefined
              : deplie
                ? `${styles.detailsBloc} ${styles.detailsBlocOuvert}`
                : styles.detailsBloc
          }
        >
          {seul ? (
            <h3 className={styles.detailsTitre}>{definition.libelle}</h3>
          ) : (
            <h3 className={styles.detailsTitre}>
              <button
                type="button"
                className={styles.detailsBascule}
                onClick={() => setOuvert(deplie ? "" : definition.code)}
                aria-expanded={deplie}
                aria-controls={"champs-" + definition.code}
              >
                <span className={fait ? `${styles.etapeNum} ${styles.etapeNumFait}` : styles.etapeNum}>
                  {fait ? "✓" : rang + 1}
                </span>
                <span className={styles.detailsNom}>{definition.libelle}</span>
                {/* L'état du bloc, dit quand il est replié : sinon on l'ouvre pour voir. */}
                {!deplie && (
                  <span className={fait ? styles.detailsEtatFait : styles.detailsEtat}>
                    {fait ? "Complété" : "À compléter"}
                  </span>
                )}
                <span className={styles.detailsChevron} aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </button>
            </h3>
          )}

          <div id={"champs-" + definition.code} hidden={!deplie}>

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
              agrementStatutaire={
                typeof etat.valeurs.agrementRequis === "string" ? etat.valeurs.agrementRequis : ""
              }
              surAssocies={(associes) =>
                changer({ assemblee: { ...etat.assemblee, associes } })
              }
              surCessions={(cessions) => changer({ cessions })}
              valeurs={etat.valeurs}
              surAgrementStatutaire={(reponse) =>
                majValeurs((valeurs) => ({ ...valeurs, agrementRequis: reponse }))
              }
              surValeur={(champ, valeur) =>
                majValeurs((valeurs) => ({ ...valeurs, [champ]: valeur }))
              }
            />
          ) : (
          <div className={styles.champs}>
            {definition.champs
              .filter((champ) => champVisible(champ, etat.valeurs, etat.societe.forme))
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
          </div>
        </section>
        );
      })}
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
  /* La largeur du champ : pleine ligne, ou le nombre de colonnes qu'il demande. */
  const largeur = champ.pleineLargeur
    ? styles.pleineLargeur
    : champ.colonnes
      ? styles["colonnes" + champ.colonnes]
      : "";
  const classe = largeur ? `${styles.champ} ${largeur}` : styles.champ;
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

/**
 * Le nom d'un associé, tel qu'on le reconnaît d'un coup d'œil.
 *
 * Une société porte sa dénomination, une personne son prénom et son nom. Rien tant
 * qu'on n'a rien tapé : « Associé 2 -  » ne vaudrait pas mieux qu'« Associé 2 ».
 */
function nomDeLAssocie(associe: Associe): string {
  if ((associe.nature ?? "physique") === "morale") return (associe.denomination ?? "").trim();
  return [associe.prenom, associe.nom]
    .map((m) => (m ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function EtapeAssemblee({
  etat,
  changer,
  majAssemblee,
}: {
  etat: EtatDuDossier;
  changer: (c: Partial<EtatDuDossier>) => void;
  majAssemblee: (maj: (a: EtatDuDossier["assemblee"]) => EtatDuDossier["assemblee"]) => void;
}) {
  const associes = etat.assemblee.associes ?? [];

  /*
   * Une assemblée a au moins un associé : son formulaire est là d'emblée.
   *
   * L'étape n'affichait qu'un bouton « Ajouter un associé » sous une date, au-dessus
   * du vide. Il fallait deviner qu'on devait cliquer pour commencer, et le dossier se
   * transmettait sans personne au bas de l'acte.
   *
   * Le premier associé n'est pas écrit dans l'état tant qu'on n'a rien tapé : un
   * associé vide inscrit d'office se retrouverait dans le procès-verbal, et il
   * suffirait de passer l'étape sans la remplir pour le produire.
   */
  const montres = associes.length > 0 ? associes : [{}];

  /** Ce qui est effectivement attribué : c'est lui qu'on compare au total déclaré. */
  const reparties = montres.reduce((somme, a) => somme + (a.parts ?? 0), 0);

  function modifierAssocie(rang: number, changement: Partial<Associe>) {
    const suite = montres.map((a, i) => (i === rang ? { ...a, ...changement } : a));
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

        {/*
          Le total des parts, déclaré avant d'être réparti.
          Sans lui, rien ne dit qu'on a bien inscrit tous les associés : un dossier
          part au cabinet avec la moitié du capital représentée, et c'est l'avocat qui
          s'en aperçoit - ou le greffe.
        */}
        <div className={styles.champ}>
          <label htmlFor="assemblee-total-parts">Nombre total de parts de la société</label>
          <ChampNombre
            id="assemblee-total-parts"
            valeur={etat.assemblee.totalParts ?? ""}
            decimales={false}
            surChangement={(nombre) =>
              changer({
                assemblee: {
                  ...etat.assemblee,
                  totalParts: nombre === "" ? null : nombre,
                },
              })
            }
          />
        </div>
      </div>

      {montres.map((associe, rang) => (
        <fieldset key={rang} className={styles.personne}>
          {/*
            Le titre prend le nom dès qu'on le tape.

            À trois associés, « Associé 1 », « Associé 2 », « Associé 3 » ne disent rien :
            il faut ouvrir chaque bloc pour retrouver celui qu'on cherchait. Le nom s'y
            ajoute au fil de la saisie, et le rang reste devant - c'est lui qui compte
            dans le procès-verbal.
          */}
          <legend>
            Associé {rang + 1}
            {nomDeLAssocie(associe) && " - " + nomDeLAssocie(associe)}
          </legend>

          {/*
            Un associé peut être une société : une SCI détenue par une holding, une
            SAS dont un fonds est associé. L'acte doit alors la désigner par sa forme,
            son capital, son siège et son numéro, non par un prénom.
          */}
          <div className={styles.natureEtRecherche}>
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

            {/* La recherche n'a de sens que pour une société : elle paraît avec elle. */}
            {(associe.nature ?? "physique") === "morale" && (
              <RechercheAuRegistre
                id={"associe-recherche-" + rang}
                compacte
                surSelection={async ({ denomination, forme, siren, siege }) => {
                  /* Le code postal et la commune servent à déduire le greffe compétent,
                     dont la fiche d'un associé n'a que faire. */
                  modifierAssocie(rang, { denomination, forme, siren, siege });

                  /*
                   * Le capital ne figure pas à l'annuaire public : il vient du registre
                   * national, par notre relais. L'acte désigne une société associée par
                   * sa forme, son capital, son siège et son numéro - le laisser vide
                   * obligeait à aller le chercher sur un extrait.
                   *
                   * L'écriture passe par `majAssemblee` : elle arrive après un
                   * aller-retour, et une écriture bâtie sur l'état de ce rendu effacerait
                   * ce qu'on vient d'inscrire à la ligne au-dessus.
                   */
                  const capital = await capitalAuRegistre(siren);
                  if (capital === null) return;
                  majAssemblee((assemblee) => ({
                    ...assemblee,
                    associes: (assemblee.associes ?? []).map((a, i) =>
                      i === rang ? { ...a, capital } : a
                    ),
                  }));
                }}
              />
            )}
          </div>

          {(associe.nature ?? "physique") === "morale" ? (
            <>
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
                {/* Un capital tient en peu de place ; un siège en demande davantage :
                    les deux tiennent sur la même ligne, deux colonnes contre quatre. */}
                <div className={`${styles.champ} ${styles.colonnes2}`}>
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
                <div className={`${styles.champ} ${styles.colonnes4}`}>
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
                {/*
                  Les titres que la forme de l'associé admet.

                  C'était un champ libre avec « Président » en exemple : on l'a recopié
                  pour des SARL, dont le dirigeant est un gérant. Le titre part dans
                  l'acte, et le greffe relève celui qui n'existe pas dans la forme.

                  Une valeur déjà saisie reste proposée même hors liste : un dossier
                  ouvert avant ce changement ne doit pas perdre ce qu'il portait.
                */}
                <div className={styles.champ}>
                  <label htmlFor={"associe-qualite-" + rang}>En qualité de</label>
                  <select
                    id={"associe-qualite-" + rang}
                    value={associe.qualiteRepresentant ?? ""}
                    onChange={(e) =>
                      modifierAssocie(rang, { qualiteRepresentant: e.target.value })
                    }
                  >
                    <option value="">Choisir</option>
                    {qualitesDuRepresentant(associe.forme).map((qualite) => (
                      <option key={qualite} value={qualite}>
                        {qualite}
                      </option>
                    ))}
                    {associe.qualiteRepresentant &&
                      !qualitesDuRepresentant(associe.forme).includes(
                        associe.qualiteRepresentant
                      ) && (
                        <option value={associe.qualiteRepresentant}>
                          {associe.qualiteRepresentant}
                        </option>
                      )}
                  </select>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.champs}>
              {/*
                Un associé, une ligne.

                Civilité, prénom, nom et parts tenaient sur deux rangées de deux, avec
                les parts coincées entre la civilité et le prénom - au milieu de
                l'identité qu'elles n'ont rien à voir. Chacun prend la largeur qu'il
                demande : la civilité en tient peu, le nom davantage, et les parts
                finissent la ligne.
              */}
              <div className={`${styles.champ} ${styles.colonnes1}`}>
                <label htmlFor={"associe-civilite-" + rang}>Civilité</label>
                <select
                  id={"associe-civilite-" + rang}
                  value={associe.civilite ?? ""}
                  onChange={(e) => modifierAssocie(rang, { civilite: e.target.value })}
                >
                  {/*
                    Abrégée à l'écran, entière dans l'acte.

                    La colonne fait cent dix pixels : « Monsieur » y était coupé en
                    « Monsie… ». C'est l'affichage qui s'abrège, la valeur envoyée reste
                    « Monsieur » - un procès-verbal n'écrit pas « M. Jean DUPONT ».
                  */}
                  <option value="">Choisir</option>
                  <option value="Monsieur">M.</option>
                  <option value="Madame">Mme</option>
                </select>
              </div>
              <div className={`${styles.champ} ${styles.colonnes2}`}>
                <label htmlFor={"associe-prenom-" + rang}>Prénom</label>
                <input
                  id={"associe-prenom-" + rang}
                  value={associe.prenom ?? ""}
                  onChange={(e) => modifierAssocie(rang, { prenom: e.target.value })}
                />
              </div>
              <div className={`${styles.champ} ${styles.colonnes2}`}>
                <label htmlFor={"associe-nom-" + rang}>Nom</label>
                <input
                  id={"associe-nom-" + rang}
                  value={associe.nom ?? ""}
                  onChange={(e) => modifierAssocie(rang, { nom: e.target.value })}
                />
              </div>
              <div className={`${styles.champ} ${styles.colonnes1}`}>
                <label htmlFor={"associe-parts-" + rang}>Parts</label>
                <ChampNombre
                  id={"associe-parts-" + rang}
                  valeur={associe.parts ?? ""}
                  decimales={false}
                  surChangement={(nombre) =>
                    modifierAssocie(rang, { parts: nombre === "" ? null : nombre })
                  }
                />
              </div>
            </div>
          )}
        </fieldset>
      ))}

      {/*
        Le compte des parts, sous les associés.

        C'est le seul endroit où l'on voit si l'on a bien inscrit tout le monde. La
        somme se lit avant de continuer, et le manque se dit en clair plutôt qu'en
        laissant compter de tête.
      */}
      {typeof etat.assemblee.totalParts === "number" && etat.assemblee.totalParts > 0 && (
        <p className={reparties === etat.assemblee.totalParts ? styles.compteJuste : styles.compte}>
          {reparties === etat.assemblee.totalParts ? (
            <>Les {etat.assemblee.totalParts} parts de la société sont réparties.</>
          ) : reparties < etat.assemblee.totalParts ? (
            <>
              {reparties} part{reparties > 1 ? "s" : ""} réparties sur{" "}
              {etat.assemblee.totalParts} : il en manque{" "}
              {etat.assemblee.totalParts - reparties}.
            </>
          ) : (
            <>
              {reparties} parts réparties pour un capital qui n&apos;en compte que{" "}
              {etat.assemblee.totalParts}.
            </>
          )}
        </p>
      )}

      {/*
        Ajouter se voit, supprimer se cherche.

        Les deux gestes portaient le même bouton blanc, côte à côte, de la même taille :
        celui qui ajoute est le plus courant, celui qui retire est irréversible d'un
        clic. L'ajout devient une zone en pointillé sur toute la largeur - la forme d'un
        emplacement vide qui attend d'être rempli ; la suppression, un lien rouge
        discret, à droite, avec sa corbeille.
      */}
      <button
        type="button"
        className={styles.ajouterAssocie}
        onClick={() =>
          changer({
            assemblee: { ...etat.assemblee, associes: [...montres, {}] },
          })
        }
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
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Ajouter un associé
      </button>

      {/* Le premier ne se supprime pas : une assemblée sans associé n'existe pas. */}
      {montres.length > 1 && (
        <div className={styles.retirerLigne}>
          <button
            type="button"
            className={styles.retirerAssocie}
            onClick={() =>
              changer({
                assemblee: { ...etat.assemblee, associes: montres.slice(0, -1) },
              })
            }
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
            </svg>
            Supprimer l&apos;associé {montres.length}
          </button>
        </div>
      )}
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
  /*
   * L'aperçu, avant d'engager la suite.
   *
   * On demandait d'affirmer que ces statuts étaient les bons sur la foi d'un intitulé
   * et d'une date. C'est ce fichier qui sera retouché article par article, puis déposé
   * au greffe : on l'ouvre avant de le retenir.
   */
  const [apercuOuvert, setApercuOuvert] = useState(false);
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
          /*
            Le document se nomme par ce qu'il est.

            On affichait l'intitulé du dépôt au registre - « Procès-verbal d'assemblée
            générale extraordinaire, Statuts mis à jour » - alors que ce qui a été
            retenu, et qui sera retouché, ce sont les statuts. La date dit d'où ils
            viennent.
          */
          depose={
            etat.statuts.source === "inpi"
              ? "Vos statuts" +
                (etat.statuts.deposeLe ? ", déposés le " + jourFrancais(etat.statuts.deposeLe) : "")
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
      {/*
        Le chapeau dit ce qui vient d'arriver, non comment le registre fonctionne.

        « Les statuts en vigueur viennent du registre national, qui diffuse les actes
        publics d'une société » expliquait un rouage à quelqu'un qui attend une réponse.
        Il lit maintenant ce qu'on a trouvé et ce qu'on lui demande.
      */}
      <p className={styles.description}>
        {acte
          ? "Nous avons trouvé vos statuts au registre national. Ouvrez-les et vérifiez qu'il s'agit bien de votre dernière version : c'est ce document que nous retoucherons, article par article."
          : "Nous avons cherché vos statuts au registre national, sans les y trouver."}
      </p>

      {acte ? (
        <div className={styles.statuts}>
          {/*
            Ce qu'on a trouvé, dit en français.

            La carte affichait l'intitulé du registre - « Procès-verbal d'assemblée
            générale extraordinaire, Statuts mis à jour » - qui nomme le dépôt, non le
            document qu'on va lire. Le client cherche ses statuts, pas la pièce dans
            laquelle ils ont voyagé. L'intitulé reste lisible dans la fenêtre d'aperçu,
            en petit, pour qui veut retrouver le dépôt au registre.
          */}
          <p className={styles.statutsPhrase}>
            {acte.deposeLe
              ? "Voici les statuts que vous avez déposés le " + jourFrancais(acte.deposeLe) + "."
              : "Voici les statuts déposés au registre pour votre société."}
          </p>

          {/*
            La date de dépôt ne prouve pas que les statuts sont à jour : une
            modification décidée et jamais déposée les périme. C'est donc au client
            d'affirmer, et son affirmation est datée dans le dossier.
          */}
          {/* Voir avant de dire oui : le bouton précède la question. */}
          <button
            type="button"
            className={styles.statutsApercu}
            onClick={() => setApercuOuvert(true)}
            disabled={enCours}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Ouvrir et vérifier
          </button>

          {/*
            La date du dépôt ne prouve rien : une modification décidée et jamais
            déposée périme les statuts publiés. C'est au client d'affirmer, et son
            affirmation est datée dans le dossier.
          */}
          <p className={styles.statutsQuestion}>
            Est-ce votre dernière version ?
          </p>
          <div className={styles.statutsReponses}>
            <button
              type="button"
              className={styles.principal}
              style={{ marginLeft: 0, padding: "12px 20px", borderRadius: 10, fontWeight: 600 }}
              onClick={confirmer}
              disabled={enCours}
            >
              {enCours ? "Récupération" : "Oui, ce sont mes statuts"}
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
              Non, j&apos;en ai une plus récente
            </button>
          </div>
        </div>
      ) : (
        <p className={styles.description}>
          {refus ??
            "Toutes les sociétés n'y déposent pas leurs actes, et un dépôt peut être confidentiel. Déposez vos statuts en vigueur pour continuer."}
        </p>
      )}

      {/* Le dépôt vient après la question, non collé à elle : ce sont deux réponses
          possibles, pas la suite l'une de l'autre. */}
      {(depotDemande || !acte) && (
        <div className={styles.depotSepare}>
          {/*
            La croix ne paraît que si l'on peut revenir en arrière.

            Elle referme le dépôt ouvert par « Non, j'en ai une plus récente » : on a
            changé d'avis, ou l'on veut relire l'acte du registre avant de choisir.
            Quand le registre n'a rien rendu, le dépôt est le seul chemin - une croix y
            proposerait de fermer une porte qu'on ne peut pas contourner.
          */}
          {depotDemande && acte && (
            <button
              type="button"
              className={styles.depotFermer}
              onClick={() => setDepotDemande(false)}
              aria-label="Fermer le dépôt de fichier"
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
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}

          <DepotFichier
            id="statuts-depot"
            accepte=".pdf"
            invite="Déposez vos statuts à jour"
            precision="Un seul fichier, au format PDF"
            surFichier={deposer}
            desactive={enCours}
          />
        </div>
      )}

      {refus && acte && <p role="alert">{refus}</p>}

      {/*
        La fenêtre porte la validation.

        On regarde, et l'on décide sans avoir à refermer pour retrouver le bouton :
        c'est en lisant qu'on reconnaît ses statuts, pas une fois revenu à la liste.
      */}
      {apercuOuvert && acte && (
        <ApercuStatuts
          dossier={dossier}
          acte={acte}
          enCours={enCours}
          surFermeture={() => setApercuOuvert(false)}
          surConfirmation={() => {
            setApercuOuvert(false);
            confirmer();
          }}
        />
      )}
    </>
  );
}


/**
 * Les statuts trouvés, dans une fenêtre.
 *
 * Une fenêtre et non la page entière : on vient vérifier un document, pas travailler
 * dessus - l'étape reste visible derrière, et fermer ramène là où l'on était. Le plein
 * écran est réservé à la retouche des articles, qui se fait, elle, sur le document.
 *
 * La validation est dans le pied : on reconnaît ses statuts en les lisant, et il
 * serait absurde de refermer pour retrouver le bouton.
 */
function ApercuStatuts({
  dossier,
  acte,
  enCours,
  surFermeture,
  surConfirmation,
}: {
  dossier: number;
  acte: ActeDuRegistre;
  enCours: boolean;
  surFermeture: () => void;
  surConfirmation: () => void;
}) {
  const fenetre = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function auClavier(e: KeyboardEvent) {
      if (e.key === "Escape") surFermeture();
    }
    document.addEventListener("keydown", auClavier);
    fenetre.current?.focus();

    // Le fond ne défile pas derrière la fenêtre.
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", auClavier);
      document.body.style.overflow = avant;
    };
  }, [surFermeture]);

  return createPortal(
    <div className={styles.apercuVoile} onClick={surFermeture}>
      <div
        ref={fenetre}
        className={styles.apercuFenetre}
        role="dialog"
        aria-modal="true"
        aria-label="Vos statuts au registre national"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.apercuTete}>
          <div className={styles.apercuQuoi}>
            <span className={styles.apercuTitre}>Vos statuts</span>
            {/* L'intitulé du registre se lit ici, en petit : il dit dans quel dépôt le
                document a été trouvé, ce qui sert à qui veut vérifier au registre. */}
            <span className={styles.apercuDate}>
              {acte.deposeLe ? "Déposés le " + jourFrancais(acte.deposeLe) + " · " : ""}
              {acte.nature}
            </span>
          </div>
          <button
            type="button"
            className={styles.apercuFermer}
            onClick={surFermeture}
            aria-label="Fermer"
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <iframe
          className={styles.apercuCadre}
          src={
            "/api/formalites/modification/statuts/apercu?dossier=" +
            dossier +
            "&acte=" +
            encodeURIComponent(acte.id)
          }
          title="Statuts au registre national"
        />

        <div className={styles.apercuPied}>
          <button type="button" className={styles.apercuSecondaire} onClick={surFermeture}>
            Ce ne sont pas les bons
          </button>
          <button
            type="button"
            className={styles.principal}
            onClick={surConfirmation}
            disabled={enCours}
          >
            {enCours ? "Récupération" : "Oui, ce sont mes statuts"}
          </button>
        </div>
      </div>
    </div>,
    document.body
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
        <h3 className={styles.blocTitre}>Le procès-verbal</h3>
        <p className={styles.blocTexte}>
          Il porte toutes vos résolutions, numérotées dans l&apos;ordre : un seul acte pour
          toute l&apos;assemblée, quel que soit le nombre de décisions. Votre avocat le relit
          avant qu&apos;il vous soit remis.
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
  pieces,
  manquantes,
  piecesDeposees,
  payer,
  enCoursDeReglement,
  refusDuReglement,
  surCorrection,
}: {
  dossier: number;
  etat: EtatDuDossier;
  anomalies: { champ: string; message: string }[];
  /** Les justificatifs attendus, et ceux qui manquent encore : calculés par le parent,
      qui en a besoin pour la barre du bas. */
  pieces: PieceAFournir[];
  manquantes: PieceAFournir[];
  piecesDeposees: { type: string; nom: string }[];
  payer: () => void;
  enCoursDeReglement: boolean;
  refusDuReglement: string | null;
  /** Ramène à l'étape où se saisit le champ manquant. */
  surCorrection: (champ: string) => void;
}) {
  const refus = refusDuReglement;
  const enCours = enCoursDeReglement;

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
            .filter((champ) => champVisible(champ, etat.valeurs, etat.societe.forme))
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

        {/*
          Les justificatifs se déposent ici, avant de payer.
          Ils n'étaient qu'énumérés : le client lisait ce qu'il devait fournir, réglait,
          et l'avocat découvrait un dossier vide qu'il fallait relancer - après quoi la
          formalité attend.
        */}
        {pieces.length > 0 && (
          <Bloc titre="Vos justificatifs">
            <p className={styles.blocTexte}>
              Ces pièces partent avec votre dossier au guichet unique. Nous produisons le
              reste - le procès-verbal, les statuts à jour, l&apos;annonce légale.
            </p>
            <Pieces
              dossierId={dossier}
              pieces={pieces.map((p) => ({
                identifiant: p.identifiant,
                titre: p.titre,
                description: p.explication,
                formats: p.formats,
              }))}
              deposees={piecesDeposees}
            />
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
          ) : manquantes.length > 0 ? (
            /*
             * Les justificatifs retiennent le règlement.
             *
             * Payer sans eux fait partir un dossier que l'avocat ne peut pas déposer :
             * il relance quelqu'un qui a quitté l'écran, et la formalité attend. Le
             * bouton dit ce qui manque plutôt que de se désactiver en silence.
             */
            <>
              <p className={styles.paiementManque}>
                {manquantes.length === 1
                  ? "Il reste une pièce à déposer : "
                  : "Il reste " + manquantes.length + " pièces à déposer : "}
                {manquantes.map((p) => p.titre.toLowerCase()).join(", ")}.
              </p>
              <button type="button" className={styles.paiementBouton} disabled>
                Régler et confier à un avocat
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
    <details className={styles.obligations}>
      <summary className={styles.obligationsTete}>
        {/*
          Une balance, non un triangle d'alerte.

          Ces rappels ne signalent rien d'anormal : ils disent ce que la loi prévoit
          pour les changements décidés. Le pictogramme du danger promettait un
          problème à régler, et l'on ouvrait le bloc pour découvrir qu'il n'y en avait
          aucun.
        */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3v18" />
          <path d="M5 7h14" />
          <path d="M8 7l-4 7a4 4 0 008 0z" />
          <path d="M16 7l-4 7a4 4 0 008 0z" />
        </svg>

        <span className={styles.obligationsQuoi}>
          Ce que la loi prévoit pour ces changements
          <span className={styles.obligationsCompte}>{dites.length}</span>
        </span>

        {/* Le mot change avec l'état du dépliant : c'est le CSS qui le montre. */}
        <span className={styles.obligationsAfficher}>Afficher</span>
        <span className={styles.obligationsMasquer}>Masquer</span>
      </summary>

      <ul>
        {dites.map((dite) => (
          <li key={dite}>{dite}</li>
        ))}
      </ul>
    </details>
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
