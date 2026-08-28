"use client";

import { ChampChoix } from "@/components/formulaire/ChampChoix";
import { natureDeLaForme } from "@/domain/formalite/formes";
import { NATURES_PROPOSEES, fonctionsDuDirigeant } from "@/domain/formalite/formes";
import { Fragment, useMemo, useState, useTransition } from "react";
import { Champ, RechercheAuRegistre, type SocieteTrouvee } from "../modification/Parcours";
import { ChampNombre } from "@/components/formulaire/ChampNombre";
import { Adresse, Ville } from "@/components/formulaire/Adresse";
import { champVisible } from "@/domain/modification/types";
import { montantLisible } from "@/domain/modification/offre";
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
import { remonterEnHaut } from "@/lib/defilement";
import { memoriserEtape } from "@/lib/etape-dans-l-adresse";

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
  issueDuPaiement?: "annule" | "attente";
}

function nombre(valeur: unknown): number {
  const lu = Number(String(valeur ?? "").replace(",", "."));
  return Number.isFinite(lu) ? lu : 0;
}

const centimes = (valeur: unknown) => Math.round(nombre(valeur) * 100);
const euros = (valeur: number) => valeur / 100;

/**
 * L'étape où un manque se répare.
 *
 * Une seule table, lue dans les deux sens : elle dit ce qui bloque la sortie d'une
 * étape, et où mène le bouton « Corriger » du récapitulatif. Ce bouton renvoyait
 * jusqu'ici à l'étape 1 quoi qu'il arrive, y compris pour une convention de l'étape 5 :
 * on retraversait tout le parcours pour trouver la case en défaut.
 */
function champsDuGroupe(groupes: string[]): string[] {
  return CHAMPS_COMPTES.filter((c) => groupes.includes(c.groupe ?? "")).map(
    (c) => c.identifiant
  );
}

function etapeDe(champ: string): number {
  if (["denomination", "forme", "siren", "adresse"].includes(champ)) return 1;
  if (
    champsDuGroupe(["L'exercice à approuver", "Le dirigeant", GROUPE_ASSOCIE_UNIQUE]).includes(
      champ
    ) ||
    champ === "dateAssemblee"
  ) {
    return 2;
  }
  if (champsDuGroupe(["Les chiffres de l'exercice"]).includes(champ)) return 3;
  if (champ === "affectation") return 4;
  if (champ.startsWith("convention-")) return 5;
  // Une anomalie qu'on n'a pas su placer se répare au début, plutôt que nulle part.
  return 1;
}

export function Parcours({ dossier, initial, etapeInitiale, issueDuPaiement }: Props) {
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

  /*
   * La société se met à jour depuis son état courant, non depuis celui de son rendu.
   *
   * `changer({ societe: { ...etat.societe } })` fige la société telle qu'elle était au
   * moment du rendu. Or deux allers-retours suivent la recherche au registre - le
   * capital d'un côté, le greffe compétent de l'autre - et chacun repartait de cet
   * état d'avant : la ville reprise du registre repassait à blanc, et celle des deux
   * réponses qui arrivait la seconde effaçait la première.
   */
  function majSociete(maj: (societe: Comptes["societe"]) => Comptes["societe"]) {
    setEtat((actuel) => ({ ...actuel, societe: maj(actuel.societe) }));
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
      memoriserEtape(dossier, vers);
      setAtteinte((loin) => Math.max(loin, vers));
      remonterEnHaut();
    });
  }

  /** Ce qui manque pour quitter une étape. On ne bloque qu'en avançant. */
  function manquesDe(rang: number) {
    return anomalies.filter((a) => etapeDe(a.champ) === rang);
  }

  const manquesCourants = manquesDe(etape);

  return (
    <div className={styles.parcours}>
      {issueDuPaiement && <FinDePaiement issue={issueDuPaiement} />}

      <Frise etape={etape} atteinte={atteinte} surChoix={aller} />

      <div className={styles.contenu}>
        <div className={styles.etapeTete}>
          <h2 className={styles.etapeTitre}>{ETAPES[etape - 1].titre}</h2>
        </div>

        {etape === 1 && (
          <EtapeSociete
            etat={etat}
            changer={changer}
            majSociete={majSociete}
            refusDe={refusDe}
          />
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
            surBilan={(bilan) => changer({ bilan })}
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
            surCorrection={(champ) => {
              setTentative(true);
              aller(etapeDe(champ));
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

/* -------------------------------------------------------- 1. La société */

function EtapeSociete({
  etat,
  changer,
  majSociete,
  refusDe,
}: {
  etat: Comptes;
  changer: (c: Partial<Comptes>) => void;
  majSociete: (maj: (societe: Comptes["societe"]) => Comptes["societe"]) => void;
  refusDe: (champ: string) => string | undefined;
}) {
  function retenir(trouvee: SocieteTrouvee) {
    majSociete((societe) => ({
      ...societe,
      denomination: trouvee.denomination,
      /*
       * La forme ne s'hérite pas d'une autre société.
       *
       * `|| societe.forme` gardait la précédente quand la catégorie du registre n'était
       * pas traduite : chercher une société après une autre lui collait la forme de
       * celle d'avant, sans rien signaler.
       */
      forme: trouvee.forme,
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

    if (!trouvee.codePostal) return;
    fetch(
      "/api/rcs?codePostal=" +
        encodeURIComponent(trouvee.codePostal) +
        "&ville=" +
        encodeURIComponent(trouvee.commune)
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((corps: { villeRcs?: string } | null) => {
        /* À défaut de greffe reconnu, la commune du siège est la meilleure réponse. */
        const villeRcs = corps?.villeRcs || trouvee.commune;
        if (villeRcs) majSociete((societe) => ({ ...societe, villeRcs }));
      })
      .catch(() => {
        /* Greffe non déterminé : la ville du RCS se saisit à la main, ci-dessous. */
      });
  }

  const champSociete = (champ: string, valeur: string | number) =>
    changer({ societe: { ...etat.societe, [champ]: valeur } });

  /*
   * Plusieurs champs de la société d'un coup.
   *
   * Retenir une adresse écrit la voie, le code postal et la ville dans le même cycle.
   * Trois appels à champSociete partiraient tous de la même société capturée, et les
   * deux derniers effaceraient le premier - on choisissait une adresse, et la voie
   * disparaissait.
   */
  const majSocietes = (champs: Record<string, string>) =>
    changer({ societe: { ...etat.societe, ...champs } });

  return (
    <>
      <p className={styles.description}>
        Tapez le nom de votre société : nous remplissons le formulaire pour vous. Tout
        reste modifiable.
      </p>

      <RechercheAuRegistre id="comptes-recherche" surSelection={retenir} />

      <div className={styles.champs}>
        <div className={styles.champ}>
          <label htmlFor="comptes-denomination">Dénomination</label>
          <input
            id="comptes-denomination"
            value={etat.societe.denomination ?? ""}
            onChange={(e) => champSociete("denomination", e.target.value)}
          />
          {refusDe("denomination") && <p role="alert">{refusDe("denomination")}</p>}
        </div>

        <div className={styles.champ}>
          <label htmlFor="comptes-forme">Forme juridique</label>
          <ChampChoix
            id="comptes-forme"
            valeur={etat.societe.forme ?? ""}
            options={NATURES_PROPOSEES}
            surChangement={(forme) => champSociete("forme", forme)}
          />
          {refusDe("forme") && <p role="alert">{refusDe("forme")}</p>}
        </div>

        <div className={styles.champ}>
          <label htmlFor="comptes-siren">SIREN</label>
          <input
            id="comptes-siren"
            value={etat.societe.siren ?? ""}
            onChange={(e) => champSociete("siren", e.target.value)}
          />
          {refusDe("siren") && <p role="alert">{refusDe("siren")}</p>}
        </div>

        <div className={styles.champ}>
          <label htmlFor="comptes-capital">Capital social, en euros</label>
          <ChampNombre
            id="comptes-capital"
            decimales
            valeur={etat.societe.capital ?? ""}
            surChangement={(n) =>
              changer({ societe: { ...etat.societe, capital: n === "" ? null : n } })
            }
          />
        </div>

        {/*
          Le siège, son code postal et sa ville tiennent sur une rangée.

          Le siège prenait toute la largeur et les deux autres une demi-carte chacun :
          un code postal de cinq chiffres s'étalait sur trois cent cinquante pixels
          pendant qu'on descendait d'une rangée pour rien. La grille compte six
          colonnes : trois pour la voie, une pour le code, deux pour la commune.
        */}
        <div className={styles.champ}>
          <label htmlFor="comptes-adresse">Siège social</label>
          {/*
            L'adresse se cherche à la Base Adresse Nationale, comme partout ailleurs.
            Elle se tapait ici à la main pendant que la recherche au registre, juste
            au-dessus, savait la remplir : une commune qui ne correspond pas à son code
            postal fait refuser le dépôt, et c'est en recopiant que l'écart se glisse.
          */}
          <Adresse
            id="comptes-adresse"
            valeur={etat.societe.adresse ?? ""}
            surChangement={(voie) => champSociete("adresse", voie)}
            surCompletion={(codePostal, ville, voie) =>
              majSocietes({ adresse: voie, codePostal, ville })
            }
            placeholder="Rechercher l'adresse..."
          />
          {refusDe("adresse") && <p role="alert">{refusDe("adresse")}</p>}
        </div>

        <div className={`${styles.champ} ${styles.colonnes1}`}>
          <label htmlFor="comptes-cp">Code postal</label>
          <input
            id="comptes-cp"
            value={etat.societe.codePostal ?? ""}
            inputMode="numeric"
            maxLength={5}
            onChange={(e) => champSociete("codePostal", e.target.value.replace(/\D/g, ""))}
          />
        </div>

        <div className={`${styles.champ} ${styles.colonnes2}`}>
          <label htmlFor="comptes-ville">Ville</label>
          {/* La commune se cherche aussi, et rapporte son code postal. */}
          <Ville
            id="comptes-ville"
            valeur={etat.societe.ville ?? ""}
            surChangement={(ville) => champSociete("ville", ville)}
            surCompletion={(codePostal, ville) => majSocietes({ codePostal, ville })}
          />
        </div>

        <div className={styles.champ}>
          <label htmlFor="comptes-rcs">Ville du RCS</label>
          <input
            id="comptes-rcs"
            value={etat.societe.villeRcs ?? ""}
            onChange={(e) => champSociete("villeRcs", e.target.value)}
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
  /*
   * Le vocabulaire suit la forme.
   *
   * « Titres détenus » ne se dit nulle part : une société par actions a des actions,
   * les autres des parts sociales, et l'acte qui sortira de cet écran emploie déjà le
   * bon mot. L'écran qui le saisit disait le mot passe-partout.
   */
  const nature = natureDeLaForme(etat.societe.forme);
  const titresDetenus = nature.titres === "actions" ? "Actions détenues" : "Parts détenues";
  const associes = etat.associes.length > 0 ? etat.associes : [{ parts: null }];

  const modifier = (rang: number, changement: Partial<(typeof associes)[number]>) =>
    changer({
      associes: associes.map((a, i) => (i === rang ? { ...a, ...changement } : a)),
    });

  return (
    <section className={styles.bloc}>
      <h3 className={styles.blocTitre}>Les {nature.associesPluriel} qui signent</h3>
      <p className={styles.blocTexte}>
        {nature.unipersonnelle
          ? "Il figure sur la feuille de présence et signe le procès-verbal."
          : "Ils figurent sur la feuille de présence et signent le procès-verbal."}
      </p>

      <div className={styles.signatairesEntete} aria-hidden="true">
        <span>Civilité</span>
        <span>Prénom</span>
        <span>Nom</span>
        <span>{titresDetenus}</span>
        <span />
      </div>

      <ul className={styles.signataires}>
        {associes.map((associe, rang) => (
          <li key={rang} className={styles.signataire}>
            <ChampChoix
              id={"comptes-civilite-" + rang}
              aria-label={"Civilité de l'" + nature.associeSingulier + " " + (rang + 1)}
              valeur={associe.civilite ?? ""}
              options={["Monsieur", "Madame"]}
              invite="Civilité"
              surChangement={(civilite) => modifier(rang, { civilite })}
            />

            <input
              aria-label={"Prénom de l'" + nature.associeSingulier + " " + (rang + 1)}
              value={associe.prenom ?? ""}
              onChange={(e) => modifier(rang, { prenom: e.target.value })}
            />

            {/* En capitales dans les actes : le champ le fait, plutôt que de le demander. */}
            <input
              aria-label={"Nom de l'" + nature.associeSingulier + " " + (rang + 1)}
              value={associe.nom ?? ""}
              onChange={(e) => modifier(rang, { nom: e.target.value.toLocaleUpperCase("fr") })}
            />

            <ChampNombre
              id={"associe-parts-" + rang}
              aria-label={titresDetenus + " par l'" + nature.associeSingulier + " " + (rang + 1)}
              className={styles.signataireTitres}
              valeur={associe.parts ?? ""}
              decimales={false}
              surChangement={(n) => modifier(rang, { parts: n === "" ? null : n })}
            />

            <button
              type="button"
              className={styles.signataireRetrait}
              aria-label={"Retirer l'" + nature.associeSingulier + " " + (rang + 1)}
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
        + Ajouter un {nature.associeSingulier}
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
              /*
               * La fonction du dirigeant suit la forme.
               *
               * Les quatre titres étaient offerts à tout le monde : une société
               * d'exercice libéral par actions simplifiée s'est déposée « en sa qualité
               * de Gérant », titre qui n'existe pas chez elle, dans une déclaration
               * signée sur l'honneur et remise au greffe.
               */
              champ={
                champ.identifiant === "dirigeantFonction"
                  ? { ...champ, options: fonctionsDuDirigeant(etat.societe.forme) }
                  : champ
              }
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

  /*
   * Ce qu'il reste à répartir, et son signe.
   *
   * L'écart se lisait dans une ligne jaune qui n'apparaissait qu'en cas d'erreur : on
   * ne savait jamais combien il restait tant qu'on n'avait pas fini de se tromper.
   */
  const reste = verdict.aRepartirCentimes - verdict.reparti;
  const restants = verdict.anomalies.filter((a) => !a.startsWith("L'affectation ne tombe pas juste"));

  return (
    <>
      <p className={styles.description}>
        Il y a {montantLisible(verdict.aRepartirCentimes)} à répartir : le résultat de
        l&apos;exercice, augmenté ou diminué du report à nouveau antérieur. La somme des
        postes doit tomber juste.
      </p>

      <ReserveLegale
        dotation={dotation}
        saisie={affectation.reserveLegaleCentimes}
        surReport={() => poser("reserveLegaleCentimes", dotation.dotationCentimes / 100)}
      />

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
              {/*
                Un poste à zéro se montre vide.
                « 0 » se lit comme un montant décidé, alors que personne ne l'a saisi -
                et l'effacer le fait revenir, puisque le champ vidé vaut zéro. Le vide
                dit la même chose sans se faire passer pour une saisie.
              */}
              <ChampNombre
                id={"aff-" + champ}
                decimales
                valeur={affectation[champ] === 0 ? "" : euros(affectation[champ])}
                surChangement={(n) => poser(champ, n)}
              />
            </div>
          ))}
      </div>

      {/*
        Le compte, toujours visible.

        Il dit ce qui a été réparti sur ce qu'il y avait, et ce qui reste - même à zéro
        saisi, où il vaut mieux voir le total à placer qu'une carte muette.
      */}
      <div
        className={[
          styles.repartition,
          verdict.equilibre ? styles.repartitionJuste : styles.repartitionReste,
        ].join(" ")}
        role="status"
      >
        <span className={styles.repartitionCompte}>
          Réparti <b>{montantLisible(verdict.reparti)}</b> sur{" "}
          <b>{montantLisible(verdict.aRepartirCentimes)}</b>
        </span>
        <span className={styles.repartitionVerdict}>
          {verdict.equilibre
            ? "L'affectation tombe juste"
            : reste > 0
              ? "Il reste " + montantLisible(reste) + " à placer"
              : "Vous avez placé " + montantLisible(-reste) + " de trop"}
        </span>
      </div>

      {/*
        Ce que le compte ci-dessus ne dit pas déjà.

        La première anomalie répétait mot pour mot l'écart que le compte affiche - « il
        reste 57 487,00 € à répartir » - dans un bandeau jaune collé dessous. Restent
        les manquements à la loi, qui eux ne se lisent nulle part ailleurs.
      */}
      {restants.length > 0 && (
        <ul className={styles.manquementsLegaux}>
          {restants.map((message) => (
            <li key={message}>
              <svg viewBox="0 0 24 24" {...TRAITS} aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5" />
                <path d="M12 16.5h.01" />
              </svg>
              <span>{message}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Où en est la réserve légale, et ce qu'il reste à doter.
 *
 * L'écran posait trois lignes de droit puis un champ vide, laissant au client le soin
 * de calculer un vingtième du bénéfice diminué des pertes reportées, plafonné au
 * dixième du capital - pour remplir une case que nous savions déjà remplir. Le montant
 * est calculé, montré, et se reporte d'un clic.
 */
function ReserveLegale({
  dotation,
  saisie,
  surReport,
}: {
  dotation: ReturnType<typeof dotationDeLaReserveLegale>;
  saisie: number;
  surReport: () => void;
}) {
  /* Une société civile n'en dote pas : l'explication suffit, sans jauge ni montant. */
  if (!dotation.applicable) {
    return <p className={styles.blocNote}>{dotation.explication}</p>;
  }

  const plafond = dotation.plafondCentimes;
  const acquise = plafond > 0 ? Math.min(1, dotation.apresDotationCentimes / plafond) : 0;
  const avant =
    plafond > 0
      ? Math.min(1, (dotation.apresDotationCentimes - dotation.dotationCentimes) / plafond)
      : 0;

  const aFaire = dotation.dotationCentimes > 0;
  const dejaSaisie = saisie === dotation.dotationCentimes;

  return (
    <section className={styles.reserve}>
      <div className={styles.reserveTete}>
        <h4 className={styles.reserveTitre}>La réserve légale</h4>
        <span
          className={[
            styles.reserveEtat,
            aFaire ? styles.reserveEtatDu : styles.reserveEtatFait,
          ].join(" ")}
        >
          {aFaire
            ? "À doter cette année : " + montantLisible(dotation.dotationCentimes)
            : dotation.manquantCentimes === 0
              ? "Complète : rien à doter"
              : "Rien à doter cette année"}
        </span>
      </div>

      <div className={styles.reserveJauge} aria-hidden="true">
        <div className={styles.reserveJaugeAcquise} style={{ width: avant * 100 + "%" }} />
        {aFaire && (
          <div
            className={styles.reserveJaugeDotation}
            style={{ left: avant * 100 + "%", width: (acquise - avant) * 100 + "%" }}
          />
        )}
      </div>

      <p className={styles.reserveChiffres}>
        <span>
          Après dotation : <b>{montantLisible(dotation.apresDotationCentimes)}</b>
        </span>
        <span>
          Plafond légal, un dixième du capital : <b>{montantLisible(plafond)}</b>
        </span>
        {dotation.manquantCentimes > 0 && (
          <span>
            Restera à doter les années suivantes :{" "}
            <b>{montantLisible(Math.max(0, plafond - dotation.apresDotationCentimes))}</b>
          </span>
        )}
      </p>

      <p className={styles.reserveTexte}>{dotation.explication}</p>

      {aFaire && !dejaSaisie && (
        <button type="button" className={styles.reserveAction} onClick={surReport}>
          Reporter {montantLisible(dotation.dotationCentimes)} dans le champ
        </button>
      )}
    </section>
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
        {verdict.depose
          ? "Déposer n'est pas publier. Vos comptes doivent partir au greffe, mais selon la taille de votre société, ils peuvent y rester inaccessibles au public."
          : "Cette étape ne concerne que les sociétés qui déposent leurs comptes au greffe. Ce n'est pas votre cas."}
      </p>

      {/*
        Une société civile ne dépose rien : la question ne se pose pas.

        L'écran lui affichait « Vos comptes seront consultables par tous » au-dessus
        d'une phrase disant qu'ils ne sont jamais publics, puis lui proposait de cocher
        des cas d'exclusion qui ne la visent pas. Deux contradictions dans une carte.
      */}
      {!verdict.depose ? (
        <section className={styles.bloc}>
          <h3 className={styles.blocTitre}>Vous n&apos;avez rien à demander ici</h3>
          <div className={`${styles.verdictConf} ${styles.verdictConfOuvert}`}>
            <span className={styles.verdictConfTitre}>
              Vos comptes ne sont jamais publiés
            </span>
            <p className={styles.verdictConfTexte}>{verdict.explication}</p>
          </div>
          <p className={styles.blocNote}>
            Continuez : le procès-verbal d&apos;approbation sera produit sans déclaration
            de confidentialité, puisqu&apos;il n&apos;y a rien à rendre confidentiel.
          </p>
        </section>
      ) : (
        <>
          <section className={styles.bloc}>
            <h3 className={styles.blocTitre}>Ce que vous pouvez demander</h3>

            <div
              className={[
                styles.verdictConf,
                verdict.modele ? styles.verdictConfOuvert : styles.verdictConfFerme,
              ].join(" ")}
            >
              <span className={styles.verdictConfTitre}>
                {TITRES_DE_PORTEE[verdict.portee]}
              </span>
              <p className={styles.verdictConfTexte}>{verdict.explication}</p>

              {/*
                Qui garde l'accès quoi qu'on décide.

                « Confidentiel » se lit comme « personne ne le verra », ce qui est faux
                et inquiète à tort : l'administration et la banque y accèdent toujours.
              */}
              {verdict.modele && (
                <ul className={styles.verdictConfAcces}>
                  <li>Le greffe y accède</li>
                  <li>L&apos;administration fiscale aussi</li>
                  <li>La Banque de France aussi</li>
                  <li>L&apos;autorité judiciaire aussi</li>
                </ul>
              )}
            </div>

            {verdict.motifs.length > 0 && (
              <ul className={styles.obligations}>
                {verdict.motifs.map((motif) => (
                  <li key={motif}>{motif}</li>
                ))}
              </ul>
            )}

            {/*
              Comment cela se passe, concrètement.

              L'écran demandait de choisir sans jamais dire ce que le choix déclenchait :
              qui rédige la déclaration, qui la signe, où elle va, ni qu'elle ne vaut que
              pour cet exercice. « Là je comprends rien », et c'était mérité.
            */}
            {verdict.modele && (
              <ol className={styles.marche}>
                {(
                  [
                    ["Vous la demandez ci-dessous", "Rien d'autre à faire de votre côté."],
                    [
                      "Nous rédigeons la déclaration",
                      "Conforme au modèle officiel de l'annexe 1-5 du code de commerce. L'avocat la relit avec vos autres actes.",
                    ],
                    [
                      "Votre dirigeant la signe",
                      "C'est une attestation sur l'honneur : elle engage celui qui la signe.",
                    ],
                    [
                      "Elle part au greffe avec vos comptes",
                      "Le greffe cesse alors de délivrer " +
                        (verdict.portee === "tout"
                          ? "vos comptes annuels"
                          : "votre compte de résultat") +
                        " aux tiers qui les demandent.",
                    ],
                    [
                      "À refaire chaque année",
                      "La déclaration ne vaut que pour l'exercice qu'elle accompagne.",
                    ],
                  ] as const
                ).map(([titre, texte]) => (
                  <li key={titre}>
                    <span className={styles.marcheTitre}>{titre}</span>
                    <span className={styles.marcheTexte}>{texte}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className={styles.bloc}>
            <h3 className={styles.blocTitre}>
              Votre société est-elle dans un de ces cas ?
            </h3>
            <p className={styles.blocTexte}>
              La plupart ne le sont pas : laissez tout décoché si aucun ne vous concerne.
              Chacun ferme la confidentialité, et ce que vous cochez ici est déclaré sur
              l&apos;honneur.
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
              <div className={styles.blocTete}>
                <h3 className={styles.blocTitre}>Votre décision</h3>
                {/*
                  Le droit acquis se voit avant qu'on lise.

                  La carte de gauche décrit ce qu'on obtient, sans dire qu'on y a droit :
                  il fallait remonter à la carte du verdict pour le savoir. Le badge le
                  dit à l'endroit où l'on clique.
                */}
                <span className={styles.badgeDroit}>
                  <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="3" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Vous remplissez les conditions
                </span>
              </div>
              <ul className={styles.choixConf}>
                {(
                  [
                    [
                      true,
                      "Garder mes comptes confidentiels",
                      verdict.portee === "tout"
                        ? "Bilan, compte de résultat et annexe deviennent inaccessibles au public. Nous produisons la déclaration et la joignons au dépôt."
                        : "Le compte de résultat devient inaccessible au public. Le bilan et l'annexe restent consultables. Nous produisons la déclaration.",
                    ],
                    [
                      false,
                      "Publier mes comptes",
                      "Ils restent consultables par tous, comme n'importe quel document du registre. Aucune déclaration à signer.",
                    ],
                  ] as const
                ).map(([valeur, titre, texte]) => (
                  <li key={titre}>
                    <button
                      type="button"
                      className={styles.choixConfCarte}
                      aria-pressed={etat.demandeLaConfidentialite === valeur}
                      onClick={() => changer({ demandeLaConfidentialite: valeur })}
                    >
                      <span className={styles.choixConfTitre}>
                        <span className={styles.choixConfMarque} aria-hidden="true">
                          <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="3.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                        {titre}
                      </span>
                      <span className={styles.choixConfTexte}>{texte}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}

/** Ce que la portée ouvre, dit en une phrase plutôt qu'en un article. */
const TITRES_DE_PORTEE: Record<string, string> = {
  tout: "Vos comptes peuvent rester entièrement confidentiels",
  "compte-de-resultat": "Votre compte de résultat peut rester confidentiel",
  aucune: "Vos comptes seront consultables par tous",
};

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
  surCorrection,
}: {
  dossier: number;
  etat: Comptes;
  anomalies: { champ: string; message: string }[];
  /** Le champ en défaut ; l'étape s'en déduit. */
  surCorrection: (champ: string) => void;
}) {
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
      {/*
        Ce qui sera écrit, et quand.

        Un bouton « Produire les actes » figurait ici, avant le règlement : le client
        pouvait produire ses actes sans payer, ou payer sans les produire - et le
        dossier partait alors en relecture vide, l'avocat devant relancer. Les actes
        suivent maintenant le paiement, écrits par sa confirmation. L'étape n'a donc
        plus rien à faire actionner : elle dit ce qui va être écrit.
      */}
      <section className={styles.bloc}>
        <h3 className={styles.blocTitre}>Vos actes</h3>
        <p className={styles.blocTexte}>{regime.explication}</p>
        <p className={styles.blocNote}>
          Ils sont écrits dès votre règlement, puis relus par un avocat. Vous les
          retrouverez dans vos documents une fois la relecture faite.
        </p>
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

        {/*
          Le total, seul, en évidence.

          Il se lisait au fil d'une note grise - « Total à régler : 223,80 € TTC. Vos
          actes sous 48 heures ouvrées » - au même corps que les lignes de détail
          au-dessus, entre lesquelles il se perdait.
        */}
        <div className={styles.total}>
          <span className={styles.totalLibelle}>Total à régler</span>
          <span className={styles.totalMontant}>{montantLisible(montant.totalTTC)} TTC</span>
        </div>

        {/*
          Ce qui se passe après le paiement.

          L'écran s'arrêtait au montant : on payait sans savoir ce qui suivait, ni qui
          relisait, ni qui déposait. Trois lignes le disent, à l'endroit où l'on hésite.
        */}
        <ol className={styles.apresPaiement}>
          <li>
            <span className={styles.marcheTitre}>Vos actes sont écrits</span>
            <span className={styles.marcheTexte}>
              Dès votre règlement, à partir de ce que vous venez de renseigner.
            </span>
          </li>
          <li>
            <span className={styles.marcheTitre}>Un avocat les vérifie</span>
            <span className={styles.marcheTexte}>
              Il les relit un par un et vous écrit si quelque chose doit être repris.
              {" " + DELAI}
            </span>
          </li>
          <li>
            <span className={styles.marcheTitre}>
              Ils sont déposés au greffe du tribunal de commerce
            </span>
            <span className={styles.marcheTexte}>
              Nous suivons le dépôt jusqu&apos;au récépissé, que vous retrouverez dans vos
              documents.
            </span>
          </li>
        </ol>

        {anomalies.length > 0 ? (
          <>
            <p className={styles.paiementManque}>
              {anomalies.length === 1
                ? "Une information manque : "
                : anomalies.length + " informations manquent : "}
              {anomalies.map((a) => a.message).join(", ")}.
            </p>
            <div className={styles.blocActions}>
              <button type="button" onClick={() => surCorrection(anomalies[0].champ)}>
                Corriger
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className={styles.reglementBouton}
            onClick={payer}
            disabled={enCours}
          >
            {enCours ? (
              "Ouverture du paiement"
            ) : (
              <>
                Procéder au règlement
                <span className={styles.reglementMontant}>
                  {montantLisible(montant.totalTTC)} TTC
                </span>
              </>
            )}
          </button>
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

/**
 * Ce qu'on dit d'un paiement qui n'a pas abouti.
 *
 * Un règlement confirmé ne passe plus par ici : il redirige vers le suivi du dossier,
 * ses actes déjà écrits. Ne restent que les deux cas où le client se retrouve devant
 * son formulaire - l'abandon, et l'encaissement que la banque n'a pas encore rendu.
 */
function FinDePaiement({ issue }: { issue: "annule" | "attente" }) {
  return (
    <div className={styles.obligations} role="status">
      <ul>
        <li>
          {issue === "annule"
            ? "Le paiement a été abandonné : rien n'a été débité. Vous pouvez le reprendre quand vous voulez."
            : "Votre banque n'a pas encore confirmé le paiement. Rien n'est perdu : actualisez cette page dans un instant, ou reprenez le règlement ci-dessous."}
        </li>
      </ul>
    </div>
  );
}
