"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { Champ, RechercheAuRegistre, type SocieteTrouvee } from "../modification/Parcours";
import { ChampNombre } from "@/components/formulaire/ChampNombre";
import { champVisible } from "@/domain/modification/types";
import { montantLisible } from "@/domain/modification/offre";
import type { ActeProduit } from "@/domain/document/publication";
import type { Comptes } from "@/infrastructure/db/depots/comptes";
import { CHAMPS_COMPTES, GROUPE_ASSOCIE_UNIQUE } from "@/domain/comptes/types";
import {
  dateLimiteApprobation,
  delaisDe,
  dotationDeLaReserveLegale,
  estUnipersonnelle,
  verifierAffectation,
  type Affectation,
} from "@/domain/comptes/regles";
import { confidentialitePossible } from "@/domain/comptes/confidentialite";
import { regimeDesConventions } from "@/domain/comptes/conventions";
import { devisDesComptes, DELAI, PRESTATIONS } from "@/domain/comptes/offre";
import { verifierComptes } from "@/domain/comptes/verification";
import { Conventions } from "./Conventions";
import { Chiffres } from "./Chiffres";
import styles from "../modification/Modification.module.css";

const ETAPES = [
  { numero: 1, titre: "La société", court: "Société" },
  { numero: 2, titre: "L'exercice", court: "Exercice" },
  { numero: 3, titre: "Les chiffres", court: "Chiffres" },
  { numero: 4, titre: "L'affectation du résultat", court: "Affectation" },
  { numero: 5, titre: "Les conventions réglementées", court: "Conventions" },
  { numero: 6, titre: "La confidentialité", court: "Confidentialité" },
  { numero: 7, titre: "Récapitulatif et règlement", court: "Règlement" },
];

const TRAITS = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

interface Props {
  dossier: number;
  initial: Comptes;
  etapeInitiale: number;
  issueDuPaiement?: "regle" | "annule";
  actesInitiaux: ActeProduit[];
}

function nombre(valeur: unknown): number {
  const lu = Number(String(valeur ?? "").replace(",", "."));
  return Number.isFinite(lu) ? lu : 0;
}

const centimes = (valeur: unknown) => Math.round(nombre(valeur) * 100);
const euros = (valeur: number) => valeur / 100;

export function Parcours({ dossier, initial, etapeInitiale, issueDuPaiement, actesInitiaux }: Props) {
  const [etape, setEtape] = useState(etapeInitiale);
  const [etat, setEtat] = useState<Comptes>(initial);
  const [erreur, setErreur] = useState<string | null>(null);
  const [tentative, setTentative] = useState(false);
  const [atteinte, setAtteinte] = useState(etapeInitiale);
  const [enCours, demarrer] = useTransition();

  const forme = etat.societe.forme;
  const unipersonnelle = estUnipersonnelle(forme) || etat.associes.length === 1;

  const base = useMemo(
    () => ({
      forme,
      resultatCentimes: centimes(etat.valeurs.resultat),
      reportAnterieurCentimes: centimes(etat.valeurs.reportAnterieur),
      capitalCentimes: Math.round((etat.societe.capital ?? 0) * 100),
      reserveExistanteCentimes: centimes(etat.valeurs.reserveLegale),
    }),
    [forme, etat.valeurs.resultat, etat.valeurs.reportAnterieur, etat.valeurs.reserveLegale, etat.societe.capital]
  );

  const anomalies = useMemo(() => verifierComptes(etat), [etat]);
  const refusDe = (champ: string) =>
    tentative ? anomalies.find((a) => a.champ === champ)?.message : undefined;

  function changer(changement: Partial<Comptes>) {
    setEtat((actuel) => ({ ...actuel, ...changement }));
  }

  function majValeurs(maj: (valeurs: Comptes["valeurs"]) => Comptes["valeurs"]) {
    setEtat((actuel) => ({ ...actuel, valeurs: maj(actuel.valeurs) }));
  }

  /**
   * Enregistre puis avance.
   *
   * L'affectation part avec le reste dès qu'elle a été touchée : sans cela, le serveur
   * la recalculerait à chaque enregistrement et effacerait le dividende qu'on vient de
   * décider.
   */
  function aller(vers: number) {
    setErreur(null);

    if (vers > etape && manquesDe(etape).length > 0) {
      setTentative(true);
      return;
    }
    setTentative(false);

    demarrer(async () => {
      const reponse = await fetch("/api/formalites/comptes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dossier,
          societe: etat.societe,
          associes: etat.associes,
          valeurs: etat.valeurs,
          affectation: etat.affectation,
          conventions: etat.conventions,
          exclusions: etat.exclusions,
          demandeLaConfidentialite: etat.demandeLaConfidentialite,
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

  /** Ce qui manque pour quitter une étape. On ne bloque qu'en avançant. */
  function manquesDe(rang: number) {
    const champsDe = (groupes: string[]) =>
      CHAMPS_COMPTES.filter((c) => groupes.includes(c.groupe ?? "")).map((c) => c.identifiant);

    if (rang === 1) {
      return anomalies.filter((a) =>
        ["denomination", "forme", "siren", "adresse"].includes(a.champ)
      );
    }
    if (rang === 2) {
      const vises = champsDe(["L'exercice à approuver", "Le dirigeant", GROUPE_ASSOCIE_UNIQUE]);
      return anomalies.filter((a) => vises.includes(a.champ) || a.champ === "dateAssemblee");
    }
    if (rang === 3) {
      return anomalies.filter((a) => champsDe(["Les chiffres de l'exercice"]).includes(a.champ));
    }
    if (rang === 4) {
      return anomalies.filter((a) => a.champ === "affectation");
    }
    if (rang === 5) {
      return anomalies.filter((a) => a.champ.startsWith("convention-"));
    }
    return [];
  }

  const manquesCourants = manquesDe(etape);

  return (
    <div className={styles.parcours}>
      {issueDuPaiement && <FinDePaiement issue={issueDuPaiement} dossier={dossier} />}

      <Frise etape={etape} atteinte={atteinte} surChoix={aller} />

      <div className={styles.contenu}>
        <div className={styles.etapeTete}>
          <h2 className={styles.etapeTitre}>{ETAPES[etape - 1].titre}</h2>
          <span className={styles.avancement}>
            Étape {etape} sur {ETAPES.length}
          </span>
        </div>

        {etape === 1 && (
          <EtapeSociete etat={etat} changer={changer} refusDe={refusDe} />
        )}

        {etape === 2 && (
          <GroupesDeChamps
            groupes={["L'exercice à approuver", "Le dirigeant", GROUPE_ASSOCIE_UNIQUE]}
            etat={etat}
            unipersonnelle={unipersonnelle}
            majValeurs={majValeurs}
            refusDe={refusDe}
          >
            <Echeance forme={forme} cloture={String(etat.valeurs.dateCloture ?? "")} />
          </GroupesDeChamps>
        )}

        {etape === 3 && (
          <Chiffres
            dossier={dossier}
            etat={etat}
            majValeurs={majValeurs}
            marquerExtraits={(champs) => changer({ extraits: champs })}
            refusDe={refusDe}
          />
        )}

        {etape === 4 && (
          <EtapeAffectation
            base={base}
            affectation={etat.affectation}
            surAffectation={(affectation) => changer({ affectation })}
          />
        )}

        {etape === 5 && (
          <Conventions
            forme={forme}
            avecCommissaire={etat.valeurs.commissaireAuxComptes === "Oui"}
            conventions={etat.conventions}
            anomalies={tentative ? anomalies : []}
            surConventions={(conventions) => changer({ conventions })}
          />
        )}

        {etape === 6 && (
          <EtapeConfidentialite etat={etat} changer={changer} />
        )}

        {etape === 7 && (
          <EtapeReglement
            dossier={dossier}
            etat={etat}
            anomalies={anomalies}
            actesInitiaux={actesInitiaux}
            surCorrection={(rang) => {
              setTentative(true);
              aller(rang);
            }}
          />
        )}

        {tentative && manquesCourants.length > 0 && (
          <p className={styles.manques} role="alert">
            {manquesCourants.length === 1
              ? manquesCourants[0].message
              : "Il reste " +
                manquesCourants.length +
                " points à régler : " +
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
              onClick={() => aller(etape + 1)}
              disabled={enCours}
            >
              {enCours ? "Enregistrement" : "Continuer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Le fil */

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

/* -------------------------------------------------------- 1. La société */

function EtapeSociete({
  etat,
  changer,
  refusDe,
}: {
  etat: Comptes;
  changer: (c: Partial<Comptes>) => void;
  refusDe: (champ: string) => string | undefined;
}) {
  function retenir(trouvee: SocieteTrouvee) {
    changer({
      societe: {
        ...etat.societe,
        denomination: trouvee.denomination,
        forme: trouvee.forme || etat.societe.forme,
        siren: trouvee.siren,
        adresse: trouvee.siege,
        codePostal: trouvee.codePostal,
        ville: trouvee.commune,
      },
    });

    if (!trouvee.siren) return;
    fetch("/api/societe/" + encodeURIComponent(trouvee.siren))
      .then((r) => (r.ok ? r.json() : null))
      .then((corps: { societe?: { capital?: number | null } } | null) => {
        const capital = corps?.societe?.capital;
        if (typeof capital === "number") {
          changer({ societe: { ...etat.societe, ...trouvee, adresse: trouvee.siege, capital } });
        }
      })
      .catch(() => {
        /* Capital non publié : il se saisit à la main, ci-dessous. */
      });

    if (trouvee.codePostal) {
      fetch(
        "/api/rcs?codePostal=" +
          encodeURIComponent(trouvee.codePostal) +
          "&ville=" +
          encodeURIComponent(trouvee.commune)
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((corps: { villeRcs?: string } | null) => {
          const villeRcs = corps?.villeRcs || trouvee.commune;
          if (villeRcs) changer({ societe: { ...etat.societe, ...trouvee, adresse: trouvee.siege, villeRcs } });
        })
        .catch(() => {});
    }
  }

  const majSociete = (champ: string, valeur: string | number) =>
    changer({ societe: { ...etat.societe, [champ]: valeur } });

  return (
    <>
      <p className={styles.description}>
        Cherchez la société au registre : sa dénomination, son SIREN, son siège, son
        capital et son greffe se remplissent seuls. Tout reste modifiable.
      </p>

      <RechercheAuRegistre id="comptes-recherche" surSelection={retenir} />

      <div className={styles.champs}>
        <div className={styles.champ}>
          <label htmlFor="comptes-denomination">Dénomination</label>
          <input
            id="comptes-denomination"
            value={etat.societe.denomination ?? ""}
            onChange={(e) => majSociete("denomination", e.target.value)}
          />
          {refusDe("denomination") && <p role="alert">{refusDe("denomination")}</p>}
        </div>

        <div className={styles.champ}>
          <label htmlFor="comptes-forme">Forme juridique</label>
          <select
            id="comptes-forme"
            value={etat.societe.forme ?? ""}
            onChange={(e) => majSociete("forme", e.target.value)}
          >
            <option value="">Choisir</option>
            {["SAS", "SASU", "SARL", "EURL", "SA", "SCI", "SNC"].map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          {refusDe("forme") && <p role="alert">{refusDe("forme")}</p>}
        </div>

        <div className={styles.champ}>
          <label htmlFor="comptes-siren">SIREN</label>
          <input
            id="comptes-siren"
            value={etat.societe.siren ?? ""}
            onChange={(e) => majSociete("siren", e.target.value)}
          />
          {refusDe("siren") && <p role="alert">{refusDe("siren")}</p>}
        </div>

        <div className={styles.champ}>
          <label htmlFor="comptes-capital">Capital social, en euros</label>
          <ChampNombre
            id="comptes-capital"
            valeur={etat.societe.capital ?? ""}
            surChangement={(n) =>
              changer({ societe: { ...etat.societe, capital: n === "" ? null : n } })
            }
          />
        </div>

        <div className={`${styles.champ} ${styles.pleineLargeur}`}>
          <label htmlFor="comptes-adresse">Siège social</label>
          <input
            id="comptes-adresse"
            value={etat.societe.adresse ?? ""}
            onChange={(e) => majSociete("adresse", e.target.value)}
          />
          {refusDe("adresse") && <p role="alert">{refusDe("adresse")}</p>}
        </div>

        <div className={styles.champ}>
          <label htmlFor="comptes-cp">Code postal</label>
          <input
            id="comptes-cp"
            value={etat.societe.codePostal ?? ""}
            onChange={(e) => majSociete("codePostal", e.target.value)}
          />
        </div>

        <div className={styles.champ}>
          <label htmlFor="comptes-ville">Ville</label>
          <input
            id="comptes-ville"
            value={etat.societe.ville ?? ""}
            onChange={(e) => majSociete("ville", e.target.value)}
          />
        </div>

        <div className={styles.champ}>
          <label htmlFor="comptes-rcs">Ville du RCS</label>
          <input
            id="comptes-rcs"
            value={etat.societe.villeRcs ?? ""}
            onChange={(e) => majSociete("villeRcs", e.target.value)}
          />
        </div>
      </div>

      <Associes etat={etat} changer={changer} />
    </>
  );
}

/**
 * Qui signe le procès-verbal.
 *
 * La même liste sert à la feuille de présence et aux signatures : elle ne se saisit
 * qu'une fois. Les parts ne servent qu'à l'acte, non à un calcul.
 */
function Associes({
  etat,
  changer,
}: {
  etat: Comptes;
  changer: (c: Partial<Comptes>) => void;
}) {
  const associes = etat.associes.length > 0 ? etat.associes : [{ parts: null }];

  const modifier = (rang: number, changement: Partial<(typeof associes)[number]>) =>
    changer({
      associes: associes.map((a, i) => (i === rang ? { ...a, ...changement } : a)),
    });

  return (
    <section className={styles.bloc}>
      <h3 className={styles.blocTitre}>Les associés qui signent</h3>
      <p className={styles.blocTexte}>
        Ils figurent sur la feuille de présence et signent le procès-verbal. Un associé
        unique se saisit seul.
      </p>

      <div className={styles.signatairesEntete} aria-hidden="true">
        <span>Civilité</span>
        <span>Prénom</span>
        <span>Nom</span>
        <span>Titres détenus</span>
        <span />
      </div>

      <ul className={styles.signataires}>
        {associes.map((associe, rang) => (
          <li key={rang} className={styles.signataire}>
            <select
              aria-label={"Civilité de l'associé " + (rang + 1)}
              value={associe.civilite ?? ""}
              onChange={(e) => modifier(rang, { civilite: e.target.value })}
            >
              <option value="">Civilité</option>
              <option value="Monsieur">Monsieur</option>
              <option value="Madame">Madame</option>
            </select>

            <input
              aria-label={"Prénom de l'associé " + (rang + 1)}
              value={associe.prenom ?? ""}
              onChange={(e) => modifier(rang, { prenom: e.target.value })}
            />

            {/* En capitales dans les actes : le champ le fait, plutôt que de le demander. */}
            <input
              aria-label={"Nom de l'associé " + (rang + 1)}
              value={associe.nom ?? ""}
              onChange={(e) => modifier(rang, { nom: e.target.value.toLocaleUpperCase("fr") })}
            />

            <ChampNombre
              id={"associe-parts-" + rang}
              aria-label={"Titres de l'associé " + (rang + 1)}
              className={styles.signataireTitres}
              valeur={associe.parts ?? ""}
              decimales={false}
              surChangement={(n) => modifier(rang, { parts: n === "" ? null : n })}
            />

            <button
              type="button"
              className={styles.signataireRetrait}
              aria-label={"Retirer l'associé " + (rang + 1)}
              onClick={() => changer({ associes: associes.filter((_, i) => i !== rang) })}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className={styles.signataireAjouter}
        onClick={() => changer({ associes: [...associes, { parts: null }] })}
      >
        + Ajouter un associé
      </button>
    </section>
  );
}

/* ------------------------------------------------- 2. L'exercice */

function GroupesDeChamps({
  groupes,
  etat,
  unipersonnelle,
  majValeurs,
  refusDe,
  children,
}: {
  groupes: string[];
  etat: Comptes;
  unipersonnelle: boolean;
  majValeurs: (maj: (v: Comptes["valeurs"]) => Comptes["valeurs"]) => void;
  refusDe: (champ: string) => string | undefined;
  children?: React.ReactNode;
}) {
  const visibles = CHAMPS_COMPTES.filter(
    (champ) =>
      groupes.includes(champ.groupe ?? "") &&
      champVisible(champ, etat.valeurs) &&
      (unipersonnelle || champ.groupe !== GROUPE_ASSOCIE_UNIQUE)
  );

  return (
    <>
      {children}
      <div className={styles.champs}>
        {visibles.map((champ, rang) => (
          <Fragment key={champ.identifiant}>
            {champ.groupe && champ.groupe !== visibles[rang - 1]?.groupe && (
              <h4 className={styles.champsGroupe}>{champ.groupe}</h4>
            )}
            <Champ
              champ={champ}
              valeur={etat.valeurs[champ.identifiant]}
              refus={refusDe(champ.identifiant)}
              surChangement={(identifiant, valeur) =>
                majValeurs((v) => ({ ...v, [identifiant]: valeur }))
              }
              surSociete={() => {}}
              surAdresse={(adresse) =>
                majValeurs((v) => ({ ...v, [champ.identifiant]: adresse }))
              }
            />
          </Fragment>
        ))}
      </div>
    </>
  );
}

/** La date au-delà de laquelle l'approbation est en retard, quand la loi en fixe une. */
function Echeance({ forme, cloture }: { forme?: string; cloture: string }) {
  const delais = delaisDe(forme);
  const limite = dateLimiteApprobation(forme, cloture || null);

  return (
    <p className={styles.blocNote}>
      {limite
        ? "Ces comptes doivent être approuvés au plus tard le " +
          new Date(limite).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }) +
          ". " +
          delais.fondementDepot
        : delais.fondementApprobation + " " + delais.fondementDepot}
    </p>
  );
}

/* ------------------------------------------------- 4. L'affectation */

function EtapeAffectation({
  base,
  affectation,
  surAffectation,
}: {
  base: Parameters<typeof dotationDeLaReserveLegale>[0];
  affectation: Affectation;
  surAffectation: (a: Affectation) => void;
}) {
  const dotation = dotationDeLaReserveLegale(base);
  const verdict = verifierAffectation({ ...base, affectation });

  const poser = (champ: keyof Affectation, valeur: number | "") =>
    surAffectation({ ...affectation, [champ]: valeur === "" ? 0 : Math.round(valeur * 100) });

  return (
    <>
      <p className={styles.description}>
        Il y a {montantLisible(verdict.aRepartirCentimes)} à répartir : le résultat de
        l&apos;exercice, augmenté ou diminué du report à nouveau antérieur. La somme des
        postes doit tomber juste.
      </p>

      <p className={styles.blocNote}>{dotation.explication}</p>

      <div className={styles.champs}>
        {(
          [
            ["reserveLegaleCentimes", "Réserve légale", dotation.applicable],
            ["autresReservesCentimes", "Autres réserves", true],
            ["dividendesCentimes", "Dividendes distribués", true],
            ["reportANouveauCentimes", "Report à nouveau", true],
          ] as const
        )
          .filter(([, , montre]) => montre)
          .map(([champ, libelle]) => (
            <div className={styles.champ} key={champ}>
              <label htmlFor={"aff-" + champ}>{libelle}, en euros</label>
              <ChampNombre
                id={"aff-" + champ}
                valeur={euros(affectation[champ])}
                surChangement={(n) => poser(champ, n)}
              />
            </div>
          ))}
      </div>

      {verdict.anomalies.length > 0 ? (
        <ul className={styles.obligations}>
          {verdict.anomalies.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : (
        <p className={styles.blocNote}>
          L&apos;affectation tombe juste. Elle sera reprise telle quelle dans le
          procès-verbal.
        </p>
      )}
    </>
  );
}

/* --------------------------------------------- 6. La confidentialité */

function EtapeConfidentialite({
  etat,
  changer,
}: {
  etat: Comptes;
  changer: (c: Partial<Comptes>) => void;
}) {
  const chiffres = {
    totalBilanCentimes: centimes(etat.valeurs.totalBilan),
    chiffreAffairesCentimes: centimes(etat.valeurs.chiffreAffaires),
    effectif: nombre(etat.valeurs.effectif),
  };
  const verdict = confidentialitePossible({
    forme: etat.societe.forme,
    chiffres,
    exclusions: etat.exclusions,
  });

  const basculer = (cle: string) =>
    changer({
      exclusions: etat.exclusions.includes(cle as never)
        ? etat.exclusions.filter((e) => e !== cle)
        : [...etat.exclusions, cle as never],
    });

  return (
    <>
      <p className={styles.description}>
        Déposer n&apos;est pas publier. Selon votre taille, vos comptes peuvent rester
        inaccessibles aux tiers - le greffe, l&apos;administration et la Banque de France
        y accèdent toujours.
      </p>

      <section className={styles.bloc}>
        <h3 className={styles.blocTitre}>Votre situation</h3>
        <p className={styles.blocTexte}>{verdict.explication}</p>
        {verdict.motifs.length > 0 && (
          <ul className={styles.obligations}>
            {verdict.motifs.map((motif) => (
              <li key={motif}>{motif}</li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.bloc}>
        <h3 className={styles.blocTitre}>Cas d&apos;exclusion</h3>
        <p className={styles.blocTexte}>
          Cochez ce qui s&apos;applique. La déclaration se signe sur l&apos;honneur : une
          fausse déclaration est un faux, passible d&apos;amende et
          d&apos;emprisonnement.
        </p>
        <ul className={styles.entreeChoix}>
          {EXCLUSIONS_LISIBLES.map((exclusion) => (
            <li key={exclusion.cle}>
              <button
                type="button"
                className={styles.entreeCarte}
                aria-pressed={etat.exclusions.includes(exclusion.cle as never)}
                onClick={() => basculer(exclusion.cle)}
              >
                <span className={styles.entreeCase} aria-hidden="true">
                  <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <span className={styles.entreeCarteTitre}>{exclusion.libelle}</span>
                <span className={styles.entreeCarteTexte}>{exclusion.fondement}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {verdict.modele && (
        <section className={styles.bloc}>
          <h3 className={styles.blocTitre}>Votre choix</h3>
          <div className={styles.blocActions}>
            <button
              type="button"
              className={etat.demandeLaConfidentialite ? styles.blocPrincipal : undefined}
              onClick={() => changer({ demandeLaConfidentialite: true })}
            >
              Demander la confidentialité
            </button>
            <button
              type="button"
              className={!etat.demandeLaConfidentialite ? styles.blocPrincipal : undefined}
              onClick={() => changer({ demandeLaConfidentialite: false })}
            >
              Publier mes comptes
            </button>
          </div>
        </section>
      )}
    </>
  );
}

const EXCLUSIONS_LISIBLES = [
  {
    cle: "credit",
    libelle: "Établissement de crédit ou entreprise d'investissement",
    fondement: "Article L. 123-16-2",
  },
  {
    cle: "assurance",
    libelle: "Assurance, réassurance, mutuelle ou institution de prévoyance",
    fondement: "Article L. 123-16-2",
  },
  {
    cle: "cotee",
    libelle: "Société cotée sur un marché réglementé",
    fondement: "Article L. 123-16-2",
  },
  {
    cle: "groupe",
    libelle: "Société d'un groupe qui établit des comptes consolidés",
    fondement: "Article L. 123-16-2",
  },
  {
    cle: "holding",
    libelle: "Activité de gestion de titres de participations",
    fondement: "Article L. 123-16-1 - ferme la confidentialité totale, pas celle du résultat",
  },
];

/* ------------------------------------------- 7. Le récapitulatif */

function EtapeReglement({
  dossier,
  etat,
  anomalies,
  actesInitiaux,
  surCorrection,
}: {
  dossier: number;
  etat: Comptes;
  anomalies: { champ: string; message: string }[];
  actesInitiaux: ActeProduit[];
  surCorrection: (etape: number) => void;
}) {
  const [documents, setDocuments] = useState<ActeProduit[]>(actesInitiaux);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const montant = devisDesComptes({
    forme: etat.societe.forme,
    confidentialite: etat.demandeLaConfidentialite,
  });
  const regime = regimeDesConventions({
    forme: etat.societe.forme,
    avecCommissaire: etat.valeurs.commissaireAuxComptes === "Oui",
  });

  function produire() {
    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/comptes/documents", {
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

  function payer() {
    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/comptes/paiement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier }),
      });
      const corps = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setRefus(corps.error ?? "Le paiement n'a pas pu être ouvert");
        return;
      }
      window.location.href = corps.adresse;
    });
  }

  return (
    <>
      <section className={styles.bloc}>
        <h3 className={styles.blocTitre}>Vos actes</h3>
        <p className={styles.blocTexte}>{regime.explication}</p>

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

        {documents.some((d) => d.enRelecture) && (
          <p className={styles.blocNote}>
            Vos actes sont partis en relecture chez l&apos;avocat. Vous les retrouverez
            dans vos documents une fois relus.
          </p>
        )}

        <div className={styles.blocActions}>
          <button
            type="button"
            className={documents.length > 0 ? undefined : styles.blocPrincipal}
            onClick={produire}
            disabled={enCours}
          >
            {enCours ? "Production" : documents.length > 0 ? "Reproduire les actes" : "Produire les actes"}
          </button>
        </div>
      </section>

      <section className={styles.bloc}>
        <h3 className={styles.blocTitre}>Ce que nous faisons</h3>
        <ul className={styles.prestationsCompactes}>
          {PRESTATIONS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>

        <dl className={`${styles.faits} ${styles.faitsPrix}`}>
          {montant.honoraires.map((ligne) => (
            <div className={styles.fait} key={ligne.libelle}>
              <dt>{ligne.libelle}</dt>
              <dd>
                <span className={styles.faitValeur}>
                  {montantLisible(ligne.centimes)} HT
                </span>
                {ligne.precision && (
                  <span className={styles.faitPrecision}>{ligne.precision}</span>
                )}
              </dd>
            </div>
          ))}
          {montant.frais.map((ligne) => (
            <div className={styles.fait} key={ligne.libelle}>
              <dt>{ligne.libelle}</dt>
              <dd>
                <span className={styles.faitValeur}>
                  {montantLisible(ligne.centimes)} {ligne.horsTaxes ? "HT" : "TTC"}
                </span>
                {ligne.precision && (
                  <span className={styles.faitPrecision}>{ligne.precision}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        <p className={styles.blocNote}>
          Total à régler : {montantLisible(montant.totalTTC)} TTC. {DELAI}
        </p>

        {anomalies.length > 0 ? (
          <>
            <p className={styles.paiementManque}>
              {anomalies.length === 1
                ? "Une information manque : "
                : anomalies.length + " informations manquent : "}
              {anomalies.map((a) => a.message).join(", ")}.
            </p>
            <div className={styles.blocActions}>
              <button type="button" onClick={() => surCorrection(1)}>
                Corriger
              </button>
            </div>
          </>
        ) : (
          <div className={styles.blocActions}>
            <button
              type="button"
              className={styles.blocPrincipal}
              onClick={payer}
              disabled={enCours}
            >
              {enCours ? "Ouverture du paiement" : "Régler et confier à un avocat"}
            </button>
          </div>
        )}

        {refus && (
          <p className={styles.paiementManque} role="alert">
            {refus}
          </p>
        )}
      </section>
    </>
  );
}

function FinDePaiement({ issue, dossier }: { issue: "regle" | "annule"; dossier: number }) {
  return (
    <div className={styles.obligations} role="status">
      <ul>
        <li>
          {issue === "regle"
            ? "Votre règlement est enregistré. Le dossier " +
              dossier +
              " part en relecture chez un avocat."
            : "Le paiement a été abandonné : rien n'a été débité. Vous pouvez le reprendre quand vous voulez."}
        </li>
      </ul>
    </div>
  );
}
