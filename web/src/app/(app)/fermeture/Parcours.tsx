"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { Champ, RechercheAuRegistre, type SocieteTrouvee } from "../modification/Parcours";
import { ChampNombre } from "@/components/formulaire/ChampNombre";
import { Adresse, Ville } from "@/components/formulaire/Adresse";
import { montantLisible } from "@/domain/modification/offre";
import type { ActeProduit } from "@/domain/document/publication";
import type { Fermeture } from "@/infrastructure/db/depots/fermeture";
import { decisionDeDissolution, CE_QUE_FAIT_LE_LIQUIDATEUR } from "@/domain/fermeture/decision";
import { resultatDeLaLiquidation, IMPOSITION_DU_BONI, TRAITEMENT_DU_MALI, REPRISE_EN_NATURE } from "@/domain/fermeture/liquidation";
import { delaiDOpposition, echeancesFiscales, termeDuMandat } from "@/domain/fermeture/delais";
import { avisDeLaFermeture, PAS_D_ANNONCE_EN_TUP, MEME_SUPPORT } from "@/domain/fermeture/annonce";
import { piecesDe, POURQUOI_LES_ATTESTATIONS } from "@/domain/fermeture/pieces";
import { devisDeFermeture, DELAI, PRESTATIONS, HORS_FORFAIT } from "@/domain/fermeture/offre";
import { champsAffiches, manquesDeLaPhase, unipersonnelleDans } from "@/domain/fermeture/verification";
import { estUnipersonnelle } from "@/domain/fermeture/voie";
import styles from "../modification/Modification.module.css";
import { remonterEnHaut } from "@/lib/defilement";
import { memoriserEtape } from "@/lib/etape-dans-l-adresse";

const TRAITS = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/**
 * Le parcours de fermeture.
 *
 * Ses étapes ne sont pas les mêmes selon la voie et la phase, et c'est ce qui le
 * distingue des autres. Une dissolution sans liquidation n'a pas de liquidateur ; une
 * clôture n'a pas de société à chercher - elle a été choisie six mois plus tôt.
 *
 * La frise se compose donc à partir de la voie, plutôt que d'être une constante.
 */
function etapesDe(voie: Fermeture["voie"], phase: Fermeture["phase"]) {
  if (voie === "tup") {
    return [
      { titre: "La société à dissoudre", court: "Société" },
      { titre: "L'associé unique", court: "Associé" },
      { titre: "Vos actes", court: "Actes" },
      { titre: "Récapitulatif et règlement", court: "Règlement" },
    ];
  }
  if (phase === "cloture") {
    return [
      { titre: "Les comptes de liquidation", court: "Comptes" },
      { titre: "Le solde de la liquidation", court: "Solde" },
      { titre: "Les pièces de la radiation", court: "Pièces" },
      { titre: "Vos actes de clôture", court: "Actes" },
    ];
  }
  return [
    { titre: "La société à fermer", court: "Société" },
    { titre: "La décision et le liquidateur", court: "Décision" },
    { titre: "Vos actes et votre annonce", court: "Actes" },
    { titre: "Récapitulatif et règlement", court: "Règlement" },
  ];
}

interface Props {
  dossier: number;
  initial: Fermeture;
  etapeInitiale: number;
  issueDuPaiement?: "regle" | "annule";
  actesInitiaux: ActeProduit[];
}

function nombre(valeur: unknown): number {
  const lu = Number(String(valeur ?? "").replace(",", "."));
  return Number.isFinite(lu) ? lu : 0;
}

const centimes = (valeur: unknown) => Math.round(nombre(valeur) * 100);

export function Parcours({ dossier, initial, etapeInitiale, issueDuPaiement, actesInitiaux }: Props) {
  const [etat, setEtat] = useState<Fermeture>(initial);
  const [etape, setEtape] = useState(etapeInitiale);
  const [erreur, setErreur] = useState<string | null>(null);
  const [tentative, setTentative] = useState(false);
  const [atteinte, setAtteinte] = useState(etapeInitiale);
  const [enCours, demarrer] = useTransition();

  const voie = etat.voie === "tup" ? "tup" : "liquidation-amiable";
  const etapes = etapesDe(etat.voie, etat.phase);
  const unipersonnelle = unipersonnelleDans({
    societe: etat.societe,
    nombreDAssocies: etat.associes.length,
  });

  const contexte = useMemo(
    () => ({
      voie: voie as "liquidation-amiable" | "tup",
      phase: etat.phase,
      societe: etat.societe,
      valeurs: etat.valeurs,
      nombreDAssocies: etat.associes.length,
    }),
    [voie, etat.phase, etat.societe, etat.valeurs, etat.associes.length]
  );

  const anomalies = useMemo(() => manquesDeLaPhase(contexte), [contexte]);
  const refusDe = (champ: string) =>
    tentative ? anomalies.find((a) => a.champ === champ)?.message : undefined;

  function changer(changement: Partial<Fermeture>) {
    setEtat((actuel) => ({ ...actuel, ...changement }));
  }

  /*
   * La société se met à jour depuis son état courant, non depuis celui de son rendu.
   *
   * Le capital arrive du registre après un aller-retour, et l'écriture qui le posait
   * repartait de la société capturée au rendu : la forme, le siège et la ville qu'on
   * venait d'inscrire repassaient à blanc au moment même où le capital s'affichait.
   */
  function majSociete(maj: (societe: Fermeture["societe"]) => Fermeture["societe"]) {
    setEtat((actuel) => ({ ...actuel, societe: maj(actuel.societe) }));
  }

  function majValeurs(maj: (valeurs: Fermeture["valeurs"]) => Fermeture["valeurs"]) {
    setEtat((actuel) => ({ ...actuel, valeurs: maj(actuel.valeurs) }));
  }

  /** Ce qui manque pour quitter cette étape-ci. */
  function manquesDe(rang: number): typeof anomalies {
    if (rang === 1) {
      return anomalies.filter(
        (a) => a.phase === "societe" || (voie === "tup" && a.champ === "dateDissolution")
      );
    }
    if (rang === 2) return anomalies.filter((a) => a.phase !== "societe");
    return [];
  }

  const manquesCourants = manquesDe(etape);

  function aller(vers: number) {
    setErreur(null);

    if (vers > etape && manquesDe(etape).length > 0) {
      setTentative(true);
      return;
    }
    setTentative(false);

    demarrer(async () => {
      const reponse = await fetch("/api/formalites/fermeture", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dossier,
          societe: etat.societe,
          associes: etat.associes,
          valeurs: etat.valeurs,
          jalons: etat.jalons,
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

  return (
    <div className={styles.parcours}>
      {issueDuPaiement && <FinDePaiement issue={issueDuPaiement} dossier={dossier} />}

      <Frise etapes={etapes} etape={etape} atteinte={atteinte} surChoix={aller} />

      <div className={styles.contenu}>
        <div className={styles.etapeTete}>
          <h2 className={styles.etapeTitre}>{etapes[etape - 1]?.titre}</h2>
          <span className={styles.avancement}>
            Étape {etape} sur {etapes.length}
          </span>
        </div>

        {etat.phase === "dissolution" ? (
          <PhaseDissolution
            dossier={dossier}
            etat={etat}
            etape={etape}
            voie={voie}
            unipersonnelle={unipersonnelle}
            anomalies={anomalies}
            actesInitiaux={actesInitiaux}
            changer={changer}
            majValeurs={majValeurs}
            majSociete={majSociete}
            refusDe={refusDe}
          />
        ) : (
          <PhaseCloture
            dossier={dossier}
            etat={etat}
            etape={etape}
            unipersonnelle={unipersonnelle}
            anomalies={anomalies}
            actesInitiaux={actesInitiaux}
            changer={changer}
            majValeurs={majValeurs}
            majSociete={majSociete}
            refusDe={refusDe}
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
          {etape < etapes.length && (
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
  etapes,
  etape,
  atteinte,
  surChoix,
}: {
  etapes: { titre: string; court: string }[];
  etape: number;
  atteinte: number;
  surChoix: (vers: number) => void;
}) {
  return (
    <ol className={styles.frise}>
      {etapes.map((e, rang) => {
        const numero = rang + 1;
        const faite = numero < etape;
        const courante = numero === etape;
        /* « À venir » est l'état par défaut : il n'a pas de classe. */
        const ton = faite ? styles.friseFaite : courante ? styles.friseCourante : "";
        const marque = faite ? (
          <svg viewBox="0 0 24 24" {...TRAITS} aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          numero
        );

        return (
          <li key={e.court} className={`${styles.friseEtape} ${ton}`}>
            {/*
              Une étape déjà atteinte se rouvre d'un clic.
              Celles qu'on n'a pas encore vues ne sont pas des boutons : y sauter
              enjamberait les contrôles qui gardent les précédentes.
            */}
            {numero <= atteinte ? (
              <button
                type="button"
                className={styles.friseGeste}
                onClick={() => surChoix(numero)}
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

/* ------------------------------------------------------- Phase 1 : dissoudre */

interface PhaseProps {
  dossier: number;
  etat: Fermeture;
  etape: number;
  unipersonnelle: boolean;
  anomalies: { champ: string; message: string }[];
  actesInitiaux: ActeProduit[];
  changer: (c: Partial<Fermeture>) => void;
  majValeurs: (maj: (v: Fermeture["valeurs"]) => Fermeture["valeurs"]) => void;
  majSociete: (maj: (societe: Fermeture["societe"]) => Fermeture["societe"]) => void;
  refusDe: (champ: string) => string | undefined;
}

function PhaseDissolution({
  dossier,
  etat,
  etape,
  voie,
  unipersonnelle,
  anomalies,
  actesInitiaux,
  changer,
  majValeurs,
  majSociete,
  refusDe,
}: PhaseProps & { voie: "liquidation-amiable" | "tup" }) {
  if (etape === 1) {
    return <EtapeSociete etat={etat} changer={changer} majSociete={majSociete} refusDe={refusDe} />;
  }

  if (etape === 2) {
    return (
      <>
        <LaDecision etat={etat} unipersonnelle={unipersonnelle} />
        <Champs etat={etat} voie={voie} majValeurs={majValeurs} refusDe={refusDe} />
        {voie === "liquidation-amiable" && (
          <p className={styles.blocNote}>{CE_QUE_FAIT_LE_LIQUIDATEUR}</p>
        )}
      </>
    );
  }

  if (etape === 3) {
    return (
      <EtapeActes
        dossier={dossier}
        etat={etat}
        voie={voie}
        unipersonnelle={unipersonnelle}
        actesInitiaux={actesInitiaux}
      />
    );
  }

  return (
    <EtapeReglement
      dossier={dossier}
      etat={etat}
      voie={voie}
      unipersonnelle={unipersonnelle}
      anomalies={anomalies}
    />
  );
}

function EtapeSociete({
  etat,
  changer,
  majSociete,
  refusDe,
}: {
  etat: Fermeture;
  changer: (c: Partial<Fermeture>) => void;
  majSociete: (maj: (societe: Fermeture["societe"]) => Fermeture["societe"]) => void;
  refusDe: (champ: string) => string | undefined;
}) {
  function retenir(trouvee: SocieteTrouvee) {
    majSociete((societe) => ({
      ...societe,
      denomination: trouvee.denomination,
      forme: trouvee.forme || societe.forme,
      siren: trouvee.siren,
      adresse: trouvee.siege,
      codePostal: trouvee.codePostal,
      ville: trouvee.commune,
    }));

    if (!trouvee.siren) return;
    fetch("/api/societe/" + encodeURIComponent(trouvee.siren))
      .then((r) => (r.ok ? r.json() : null))
      .then((corps: { societe?: { capital?: number | null } } | null) => {
        const capital = corps?.societe?.capital;
        if (typeof capital === "number") majSociete((societe) => ({ ...societe, capital }));
      })
      .catch(() => {
        /* Capital non publié : il se saisit à la main, ci-dessous. */
      });
  }

  const champSociete = (champ: string, valeur: string | number) =>
    changer({ societe: { ...etat.societe, [champ]: valeur } });

  /*
   * Plusieurs champs de la société d'un coup.
   *
   * Retenir une adresse écrit la voie, le code postal et la ville dans le même cycle.
   * Trois appels à champSociete partiraient tous de la même société capturée, et les
   * deux derniers effaceraient le premier.
   */
  const majSocietes = (champs: Record<string, string>) =>
    changer({ societe: { ...etat.societe, ...champs } });

  return (
    <>
      <p className={styles.description}>
        Cherchez la société au registre : sa dénomination, son SIREN, son siège et son
        capital se remplissent seuls. Le capital compte plus qu&apos;ailleurs ici -
        c&apos;est lui qui séparera le boni du mali à la clôture.
      </p>

      <RechercheAuRegistre id="fermeture-recherche" surSelection={retenir} />

      <div className={styles.champs}>
        <div className={styles.champ}>
          <label htmlFor="fermeture-denomination">Dénomination</label>
          <input
            id="fermeture-denomination"
            value={etat.societe.denomination ?? ""}
            onChange={(e) => champSociete("denomination", e.target.value)}
          />
          {refusDe("denomination") && <p role="alert">{refusDe("denomination")}</p>}
        </div>

        <div className={styles.champ}>
          <label htmlFor="fermeture-forme">Forme juridique</label>
          <select
            id="fermeture-forme"
            value={etat.societe.forme ?? ""}
            onChange={(e) => champSociete("forme", e.target.value)}
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
          <label htmlFor="fermeture-siren">SIREN</label>
          <input
            id="fermeture-siren"
            value={etat.societe.siren ?? ""}
            onChange={(e) => champSociete("siren", e.target.value)}
          />
          {refusDe("siren") && <p role="alert">{refusDe("siren")}</p>}
        </div>

        <div className={styles.champ}>
          <label htmlFor="fermeture-capital">Capital social, en euros</label>
          <ChampNombre
            id="fermeture-capital"
            valeur={etat.societe.capital ?? ""}
            surChangement={(n) =>
              changer({ societe: { ...etat.societe, capital: n === "" ? null : n } })
            }
          />
          {refusDe("capital") && <p role="alert">{refusDe("capital")}</p>}
        </div>

        <div className={`${styles.champ} ${styles.pleineLargeur}`}>
          <label htmlFor="fermeture-adresse">Siège social</label>
          {/*
            L'adresse se cherche à la Base Adresse Nationale, comme partout ailleurs.
            Elle se tapait ici à la main pendant que la recherche au registre, juste
            au-dessus, savait la remplir : une commune qui ne correspond pas à son code
            postal fait refuser le dépôt, et c'est en recopiant que l'écart se glisse.
          */}
          <Adresse
            id="fermeture-adresse"
            valeur={etat.societe.adresse ?? ""}
            surChangement={(voie) => champSociete("adresse", voie)}
            surCompletion={(codePostal, ville, voie) =>
              majSocietes({ adresse: voie, codePostal, ville })
            }
            placeholder="Rechercher l'adresse..."
          />
          {refusDe("adresse") && <p role="alert">{refusDe("adresse")}</p>}
        </div>

        <div className={styles.champ}>
          <label htmlFor="fermeture-cp">Code postal</label>
          <input
            id="fermeture-cp"
            value={etat.societe.codePostal ?? ""}
            inputMode="numeric"
            maxLength={5}
            onChange={(e) => champSociete("codePostal", e.target.value.replace(/\D/g, ""))}
          />
        </div>

        <div className={styles.champ}>
          <label htmlFor="fermeture-ville">Ville</label>
          {/* La commune se cherche aussi, et rapporte son code postal. */}
          <Ville
            id="fermeture-ville"
            valeur={etat.societe.ville ?? ""}
            surChangement={(ville) => champSociete("ville", ville)}
            surCompletion={(codePostal, ville) => majSocietes({ codePostal, ville })}
          />
        </div>
      </div>

      <Associes etat={etat} changer={changer} />
    </>
  );
}

/**
 * Les associés qui décident.
 *
 * Ils figurent sur la feuille de présence, signent le procès-verbal et se partagent le
 * boni. Leur nombre décide aussi du droit de partage : à un seul associé, il n'y en a
 * pas.
 */
function Associes({
  etat,
  changer,
}: {
  etat: Fermeture;
  changer: (c: Partial<Fermeture>) => void;
}) {
  const associes = etat.associes.length > 0 ? etat.associes : [{ parts: null }];

  const modifier = (rang: number, changement: Partial<(typeof associes)[number]>) =>
    changer({
      associes: associes.map((a, i) => (i === rang ? { ...a, ...changement } : a)),
    });

  return (
    <section className={styles.bloc}>
      <h3 className={styles.blocTitre}>Les associés qui décident</h3>
      <p className={styles.blocTexte}>
        Ils votent la dissolution, signent les actes et se partagent ce qui reste. Leur
        nombre décide de la majorité applicable et du droit de partage.
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
            <input
              aria-label={"Nom de l'associé " + (rang + 1)}
              value={associe.nom ?? ""}
              onChange={(e) => modifier(rang, { nom: e.target.value.toLocaleUpperCase("fr") })}
            />
            <ChampNombre
              id={"fermeture-parts-" + rang}
              aria-label={"Titres de l'associé " + (rang + 1)}
              className={styles.signataireTitres}
              valeur={associe.parts ?? ""}
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
        className={styles.ajouterLigne}
        onClick={() => changer({ associes: [...associes, { parts: null }] })}
      >
        + Ajouter un associé
      </button>
    </section>
  );
}

/** La règle de majorité, annoncée avant qu'on signe quoi que ce soit. */
function LaDecision({ etat, unipersonnelle }: { etat: Fermeture; unipersonnelle: boolean }) {
  if (etat.voie === "tup") {
    return (
      <p className={styles.description}>
        La dissolution est décidée par l&apos;associé unique. Renseignez son identité
        complète : elle figure dans l&apos;acte, et le greffe la rapproche de son propre
        extrait d&apos;immatriculation.
      </p>
    );
  }

  const regle = decisionDeDissolution({
    forme: etat.societe.forme,
    unipersonnelle,
    avantAout2005: etat.valeurs.sarlAvant2005 === "Oui",
    majoriteStatutaire: String(etat.valeurs.majoriteStatutaire ?? ""),
  });

  return (
    <>
      <p className={styles.description}>{regle.explication}</p>
      <p className={styles.blocNote}>
        L&apos;acte portera : « {regle.organe} statuant {regle.majorite} ». Fondement :{" "}
        {regle.fondement}.
      </p>
    </>
  );
}

function Champs({
  etat,
  voie,
  majValeurs,
  refusDe,
}: {
  etat: Fermeture;
  voie: "liquidation-amiable" | "tup";
  majValeurs: (maj: (v: Fermeture["valeurs"]) => Fermeture["valeurs"]) => void;
  refusDe: (champ: string) => string | undefined;
}) {
  const visibles = champsAffiches({
    voie,
    phase: etat.phase,
    societe: etat.societe,
    valeurs: etat.valeurs,
    nombreDAssocies: etat.associes.length,
  });

  return (
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
  );
}

/* --------------------------------------------------- Les actes et l'annonce */

function EtapeActes({
  dossier,
  etat,
  voie,
  unipersonnelle,
  actesInitiaux,
}: {
  dossier: number;
  etat: Fermeture;
  voie: "liquidation-amiable" | "tup";
  unipersonnelle: boolean;
  actesInitiaux: ActeProduit[];
}) {
  const avis = avisDeLaFermeture({
    voie,
    phase: etat.phase,
    contexte: {
      societe: etat.societe,
      valeurs: etat.valeurs,
      liquidateur: [
        etat.valeurs.liquidateurCivilite,
        etat.valeurs.liquidateurPrenom,
        etat.valeurs.liquidateurNom,
      ]
        .filter(Boolean)
        .join(" "),
      organe: unipersonnelle ? "L'associé unique" : "L'assemblée générale extraordinaire",
    },
  });

  return (
    <>
      <ProductionDesActes dossier={dossier} actesInitiaux={actesInitiaux} />

      <section className={styles.bloc}>
        <h3 className={styles.blocTitre}>Votre annonce légale</h3>
        {avis.length === 0 ? (
          <p className={styles.blocTexte}>{PAS_D_ANNONCE_EN_TUP}</p>
        ) : (
          <>
            <p className={styles.blocTexte}>
              Le texte est rédigé. Copiez-le dans le formulaire du support habilité de
              votre choix. {MEME_SUPPORT}
            </p>
            {avis.map((a) => (
              <div key={a.objet}>
                <p className={styles.blocNote}>
                  {a.objet} - {a.quand}
                </p>
                <pre className={styles.avisTexte}>{a.texte}</pre>
              </div>
            ))}
          </>
        )}
      </section>

      <LesPieces voie={voie} phase="dissolution" />
    </>
  );
}

function ProductionDesActes({
  dossier,
  actesInitiaux,
}: {
  dossier: number;
  actesInitiaux: ActeProduit[];
}) {
  const [documents, setDocuments] = useState<ActeProduit[]>(actesInitiaux);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function produire() {
    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/fermeture/documents", {
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

  return (
    <section className={styles.bloc}>
      <h3 className={styles.blocTitre}>Vos actes</h3>
      <p className={styles.blocTexte}>
        Ils sont rédigés d&apos;après votre forme sociale : la majorité, le quorum et les
        pouvoirs du liquidateur ne sont pas les mêmes d&apos;une SARL à une SAS.
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

      <div className={styles.blocActions}>
        <button
          type="button"
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

      {refus && (
        <p className={styles.paiementManque} role="alert">
          {refus}
        </p>
      )}
    </section>
  );
}

/** Les pièces du dossier, avec les deux qui bloquent la radiation. */
export function LesPieces({
  voie,
  phase,
}: {
  voie: "liquidation-amiable" | "tup";
  phase: "dissolution" | "cloture";
}) {
  const pieces = piecesDe(voie, phase);
  if (pieces.length === 0) return null;

  return (
    <section className={styles.bloc}>
      <h3 className={styles.blocTitre}>Les pièces du dossier</h3>
      <ul className={styles.jalons}>
        {pieces.map((piece) => (
          <li key={piece.cle} className={styles.jalon}>
            <span className={styles.jalonCase} aria-hidden="true" />
            <div>
              <p className={styles.jalonIntitule}>{piece.intitule}</p>
              <p className={styles.jalonTexte}>{piece.ou}</p>
              <p className={styles.jalonTexte}>{piece.aQuoiElleSert}</p>
              {piece.malentendu && <p className={styles.jalonAlerte}>{piece.malentendu}</p>}
              <p className={styles.jalonFondement}>{piece.fondement}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------- Le règlement */

function EtapeReglement({
  dossier,
  etat,
  voie,
  unipersonnelle,
  anomalies,
}: {
  dossier: number;
  etat: Fermeture;
  voie: "liquidation-amiable" | "tup";
  unipersonnelle: boolean;
  anomalies: { champ: string; message: string }[];
}) {
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const montant = devisDeFermeture({
    voie,
    associeUniqueDirigeant: estUnipersonnelle(etat.societe.forme) && unipersonnelle,
  });

  const echeances = echeancesFiscales({
    dateDissolution: String(etat.valeurs.dateDissolution ?? ""),
  });

  function payer() {
    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/fermeture/paiement", {
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
        <h3 className={styles.blocTitre}>Ce que nous faisons</h3>
        <ul className={styles.prestationsCompactes}>
          {PRESTATIONS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>

        <dl className={`${styles.faits} ${styles.faitsPrix}`}>
          {[...montant.honoraires, ...montant.frais].map((ligne) => (
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
          Total à régler : {montantLisible(montant.totalTTC)} TTC. {DELAI} La clôture de
          la liquidation est comprise : vous ne repaierez rien pour la seconde phase.
        </p>
      </section>

      <section className={styles.bloc}>
        <h3 className={styles.blocTitre}>Ce qui n&apos;est pas compris</h3>
        <ul className={styles.obligations}>
          {HORS_FORFAIT.map((ligne) => (
            <li key={ligne}>{ligne}</li>
          ))}
        </ul>
      </section>

      <section className={styles.bloc}>
        <h3 className={styles.blocTitre}>Vos échéances fiscales</h3>
        <p className={styles.blocTexte}>
          Elles ne passent pas par nous : elles se déposent auprès des impôts. Personne ne
          vous les rappellera, et les manquer coûte des pénalités.
        </p>
        <dl className={styles.faits}>
          {echeances.map((echeance) => (
            <div className={styles.fait} key={echeance.intitule}>
              <dt>{echeance.intitule}</dt>
              <dd>
                <span className={styles.faitValeur}>
                  {echeance.limite
                    ? "au plus tard le " + echeance.limite.split("-").reverse().join("/")
                    : "au cas par cas"}
                </span>
                <span className={styles.faitPrecision}>{echeance.explication}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {anomalies.length > 0 ? (
        <p className={styles.paiementManque}>
          {anomalies.length === 1
            ? "Une information manque : "
            : anomalies.length + " informations manquent : "}
          {anomalies.map((a) => a.message).join(", ")}.
        </p>
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
    </>
  );
}

/* --------------------------------------------------------- Phase 2 : clôturer */

function PhaseCloture({
  dossier,
  etat,
  etape,
  unipersonnelle,
  actesInitiaux,
  majValeurs,
  refusDe,
}: PhaseProps) {
  const resultat = resultatDeLaLiquidation({
    actifRealiseCentimes: centimes(etat.valeurs.actifRealise),
    passifApureCentimes: centimes(etat.valeurs.passifApure),
    capitalCentimes: Math.round((etat.societe.capital ?? 0) * 100),
    fraisDeLiquidationCentimes: centimes(etat.valeurs.fraisDeLiquidation),
    unipersonnelle,
  });

  if (etape === 1) {
    const terme = termeDuMandat(String(etat.valeurs.dateDissolution ?? ""));
    return (
      <>
        <p className={styles.description}>
          La liquidation est finie : dites ce qu&apos;elle a produit et ce qu&apos;elle a
          payé. Nous en tirons les comptes définitifs, le rapport du liquidateur et la
          décision de clôture.
        </p>
        {terme && (
          <p className={styles.blocNote}>
            Le mandat du liquidateur court jusqu&apos;au{" "}
            {terme.split("-").reverse().join("/")}. Au-delà, sa prorogation doit être
            demandée au président du tribunal avant de pouvoir clôturer.
          </p>
        )}
        <Champs
          etat={etat}
          voie="liquidation-amiable"
          majValeurs={majValeurs}
          refusDe={refusDe}
        />
      </>
    );
  }

  if (etape === 2) {
    return <LeSolde etat={etat} resultat={resultat} />;
  }

  if (etape === 3) {
    return (
      <>
        <p className={styles.description}>{POURQUOI_LES_ATTESTATIONS}</p>
        <LesPieces voie="liquidation-amiable" phase="cloture" />
      </>
    );
  }

  return (
    <>
      <ProductionDesActes dossier={dossier} actesInitiaux={actesInitiaux} />
      <section className={styles.bloc}>
        <h3 className={styles.blocTitre}>Votre annonce de clôture</h3>
        <p className={styles.blocTexte}>{MEME_SUPPORT}</p>
        {avisDeLaFermeture({
          voie: "liquidation-amiable",
          phase: "cloture",
          contexte: {
            societe: etat.societe,
            valeurs: etat.valeurs,
            liquidateur: [
              etat.valeurs.liquidateurCivilite,
              etat.valeurs.liquidateurPrenom,
              etat.valeurs.liquidateurNom,
            ]
              .filter(Boolean)
              .join(" "),
            organe: unipersonnelle ? "L'associé unique" : "L'assemblée générale",
            soldeDeLaLiquidation: {
              boniEuros: resultat.boniCentimes / 100,
              maliEuros: resultat.maliCentimes / 100,
            },
          },
        })
          .filter((a) => a.objet.startsWith("Clôture"))
          .map((a) => (
            <pre key={a.objet} className={styles.avisTexte}>
              {a.texte}
            </pre>
          ))}
      </section>
    </>
  );
}

/** Le boni ou le mali, et ce qu'il déclenche. */
function LeSolde({
  etat,
  resultat,
}: {
  etat: Fermeture;
  resultat: ReturnType<typeof resultatDeLaLiquidation>;
}) {
  const boni = resultat.boniCentimes > 0;
  const mali = resultat.maliCentimes > 0;

  return (
    <>
      <p className={styles.description}>
        Ce que la liquidation laisse, une fois les créanciers payés et les apports rendus.
        Ce calcul décide du droit de partage et de ce que chaque associé déclarera.
      </p>

      <dl className={styles.faits}>
        {[
          ["Actif réalisé", resultat.actifNetCentimes + centimes(etat.valeurs.passifApure) + centimes(etat.valeurs.fraisDeLiquidation)],
          ["Passif acquitté", -centimes(etat.valeurs.passifApure)],
          ["Frais de liquidation", -centimes(etat.valeurs.fraisDeLiquidation)],
          ["Actif net", resultat.actifNetCentimes],
          ["Capital remboursé", -resultat.capitalRembourseCentimes],
        ].map(([libelle, valeur]) => (
          <div className={styles.fait} key={String(libelle)}>
            <dt>{libelle}</dt>
            <dd>
              <span className={styles.faitValeur}>{montantLisible(Number(valeur))}</span>
            </dd>
          </div>
        ))}
      </dl>

      <div className={styles.solde}>
        <span className={styles.soldeMot}>
          {boni ? "Boni de liquidation" : mali ? "Mali de liquidation" : "Ni boni ni mali"}
        </span>
        <span className={styles.soldeMontant}>
          {montantLisible(boni ? resultat.boniCentimes : resultat.maliCentimes)}
        </span>
      </div>

      <p className={styles.blocNote}>{resultat.explicationDuPartage}</p>

      {resultat.droitDePartageCentimes > 0 && (
        <p className={styles.blocNote}>
          Droit de partage à prévoir :{" "}
          {montantLisible(resultat.droitDePartageCentimes)}, calculé sur un actif net
          partagé de {montantLisible(resultat.assietteDuPartageCentimes)}.
        </p>
      )}

      {boni && <p className={styles.blocNote}>{IMPOSITION_DU_BONI}</p>}
      {mali && <p className={styles.blocNote}>{TRAITEMENT_DU_MALI}</p>}

      {etat.valeurs.repriseEnNature === "Oui" && (
        <ul className={styles.obligations}>
          <li>{REPRISE_EN_NATURE}</li>
        </ul>
      )}

      {resultat.anomalies.length > 0 && (
        <ul className={styles.obligations}>
          {resultat.anomalies.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
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
              " part en relecture chez un avocat. La clôture de la liquidation est comprise : vous la reprendrez ici quand la liquidation sera terminée."
            : "Le paiement a été abandonné : rien n'a été débité. Vous pouvez le reprendre quand vous voulez."}
        </li>
      </ul>
    </div>
  );
}

/** Le décompte du délai d'opposition, sur un dossier de dissolution sans liquidation. */
export function Opposition({ publicationBodacc }: { publicationBodacc: string }) {
  const delai = delaiDOpposition(publicationBodacc);
  if (!delai) return null;

  return (
    <div className={styles.compteARebours}>
      <strong>{delai.ecoule ? "Délai écoulé" : delai.joursRestants + " jours"}</strong>
      <span className={styles.compteAReboursTexte}>
        {delai.ecoule
          ? "Le délai d'opposition a expiré le " +
            delai.expireLe.split("-").reverse().join("/") +
            ". La transmission universelle du patrimoine est intervenue le " +
            delai.transmissionLe.split("-").reverse().join("/") +
            " : la radiation peut être requise."
          : "avant l'expiration du délai d'opposition des créanciers, le " +
            delai.expireLe.split("-").reverse().join("/") +
            ". La transmission du patrimoine interviendra le " +
            delai.transmissionLe.split("-").reverse().join("/") +
            "."}
        {delai.prorogation ? " " + delai.prorogation : ""}
      </span>
    </div>
  );
}
