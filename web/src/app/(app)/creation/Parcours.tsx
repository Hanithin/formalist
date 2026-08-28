"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  verifierEtape,
  avancementParcours,
  libellesDesAssocies,
  motAssocie,
  BANQUES,
  MODES_DOMICILIATION,
  OCCUPATIONS_DOMICILE,
  OPTIONS_FISCALES,
  REGIMES_TVA,
  type Brouillon,
  type Etape,
} from "@/domain/formalite/parcours";
import { valeursParDefaut, clotureDepuis } from "@/domain/formalite/valeurs-par-defaut";
import { FORMES_PROPOSEES, FORMES, regle } from "@/domain/formalite/formes";
import { Adresse, Ville } from "@/components/formulaire/Adresse";
import { Choix } from "./Choix";
import { DateChoisie } from "./DateChoisie";
import { Associes } from "./Associes";
import { Actes, type ActeProduit } from "./Actes";
import { Capital } from "./Capital";
import { Dirigeants } from "./Dirigeants";
import { Offres } from "./Offres";
import { ObjetSocial } from "./ObjetSocial";
import { piecesAttendues } from "@/domain/formalite/documents";
import { Pieces } from "@/components/formulaire/Pieces";
import styles from "./Parcours.module.css";

interface Props {
  /** Nul tant que rien n'a été saisi : le dossier naît au premier enregistrement. */
  dossierId: number | null;
  etapes: Etape[];
  etapeCourante: number;
  brouillonInitial: Brouillon;
  piecesDeposees: { type: string | null; nom: string }[];
  actesProduits: ActeProduit[];
}

/** La coche des étapes franchies. */
function Coche() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/** Un champ : son libellé, sa saisie, et son refus juste dessous. */
function Champ({
  id,
  libelle,
  requis = false,
  pleineLargeur = false,
  anomalie,
  children,
}: {
  id: string;
  libelle: string;
  requis?: boolean;
  pleineLargeur?: boolean;
  anomalie?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={pleineLargeur ? `${styles.field} ${styles.full}` : styles.field}>
      {/* L'astérisque est posée par le style, pas écrite dans le libellé : dans
          le texte, elle ferait partie du nom du champ. */}
      <label htmlFor={id} className={requis ? styles.requis : undefined}>
        {libelle}
      </label>
      {children}
      {anomalie && <p role="alert">{anomalie}</p>}
    </div>
  );
}

export function Parcours({
  dossierId,
  etapes,
  etapeCourante,
  brouillonInitial,
  piecesDeposees,
  actesProduits,
}: Props) {
  /*
   * Les réponses courantes sont écrites dès l'ouverture, pas à la génération : elles
   * doivent se voir et se corriger. Le calcul a lieu une fois, à la première mise en
   * état - le refaire à chaque rendu ramènerait la valeur d'origine sur un champ
   * qu'on vient de vider.
   */
  const [brouillon, setBrouillon] = useState(() => ({
    ...brouillonInitial,
    ...valeursParDefaut(brouillonInitial, new Date()),
  }));
  const [anomalies, setAnomalies] = useState<Record<string, string>>({});
  /*
   * Les champs que la personne a elle-même renseignés.
   *
   * La clôture du premier exercice se déduit de la date de début : elle doit suivre
   * tant qu'on ne l'a pas fixée, et cesser de bouger dès qu'on l'a fixée.
   */
  const [touches, setTouches] = useState<Set<string>>(new Set());
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  /*
   * L'identifiant du dossier, une fois qu'il existe.
   *
   * Il arrive nul quand on entre sur le parcours : rien n'est écrit tant que rien
   * n'est saisi. Le premier enregistrement l'ouvre et le retient ici, parce que
   * `router.push` ne rafraîchit pas la page tout de suite - sans cette mémoire, un
   * second « Continuer » arrivé entre-temps ouvrirait un deuxième dossier.
   */
  const [dossier, setDossier] = useState<number | null>(dossierId);

  const etape = etapes.find((e) => e.numero === etapeCourante) ?? etapes[0];
  const avancement = avancementParcours(brouillon);

  function modifier(champ: keyof Brouillon, valeur: unknown) {
    setBrouillon((actuel) => ({ ...actuel, [champ]: valeur }));
  }

  /**
   * Plusieurs champs d'un coup.
   *
   * Choisir une adresse remplit la voie, le code postal et la ville : trois
   * appels successifs à modifier() partiraient du même état et les deux derniers
   * écraseraient le premier.
   */
  function modifierPlusieurs(valeurs: Partial<Brouillon>) {
    setBrouillon((actuel) => ({ ...actuel, ...valeurs }));
  }

  function modifierBanque(champ: "nom" | "adresse" | "ville" | "codePostal", valeur: string) {
    setBrouillon((actuel) => ({
      ...actuel,
      banqueAutre: { ...actuel.banqueAutre, [champ]: valeur },
    }));
  }

  /* Plusieurs champs de la banque d'un coup, quand une commune est retenue. */
  function modifierBanquePlusieurs(champs: Record<string, string>) {
    setBrouillon((actuel) => ({
      ...actuel,
      banqueAutre: { ...actuel.banqueAutre, ...champs },
    }));
  }

  function modifierDomiciliataire(champ: "denomination" | "siren" | "agrement", valeur: string) {
    setBrouillon((actuel) => ({
      ...actuel,
      domiciliataire: { ...actuel.domiciliataire, [champ]: valeur },
    }));
  }

  /** Un champ renseigné à la main ne se laisse plus recalculer. */
  function marquerTouche(champ: string) {
    setTouches((actuels) => (actuels.has(champ) ? actuels : new Set(actuels).add(champ)));
  }

  /**
   * La date de début d'activité entraîne la clôture du premier exercice.
   *
   * Tant que la clôture n'a pas été fixée à la main, elle suit : sans cela, choisir un
   * début en octobre laissait une clôture calculée sur la date du jour, c'est-à-dire
   * fausse et écrite d'avance - le pire des deux.
   */
  function modifierDebutDActivite(iso: string) {
    setBrouillon((actuel) => {
      const suite = { ...actuel, dateDebutActivite: iso };
      if (touches.has("dateCloturePremierExercice")) return suite;
      return { ...suite, dateCloturePremierExercice: clotureDepuis(iso, new Date()) };
    });
  }

  async function enregistrer(suite: number) {
    // Un enregistrement déjà parti suffit : le second ouvrirait un dossier de plus.
    if (enCours) return;

    // Les règles sont vérifiées ici pour l'affichage immédiat, et à nouveau côté
    // serveur : ce qui arrive du navigateur n'est jamais cru sur parole.
    const manques = verifierEtape(etape.numero, brouillon);
    if (manques.length > 0 && suite > etape.numero) {
      setAnomalies(Object.fromEntries(manques.map((a) => [a.champ, a.message])));
      return;
    }
    setAnomalies({});

    demarrer(async () => {
      // Le dossier s'ouvre au premier enregistrement, une fois les règles de
      // l'étape passées : ce qui est écrit en base porte alors une information.
      let identifiant = dossier;
      if (identifiant === null) {
        const reponse = await fetch("/api/formalites/brouillon", { method: "POST" });
        const corps = await reponse.json().catch(() => ({}));
        if (!reponse.ok || typeof corps.dossier !== "number") {
          setAnomalies({ forme: "Le dossier n'a pas pu être ouvert" });
          return;
        }
        identifiant = corps.dossier;
        setDossier(identifiant);
      }

      await fetch("/api/formalites/brouillon", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier: identifiant, modifications: brouillon }),
      });
      router.push("/creation?dossier=" + identifiant + "&etape=" + suite);
      router.refresh();
    });
  }

  const titreDirigeant = regle(brouillon.forme)?.titreDirigeant ?? "Dirigeant";

  /**
   * L'étape des associés change de nom : une société par actions a des
   * actionnaires, et le pluriel n'apparaît qu'au deuxième. Les autres étapes
   * gardent le titre de leur description.
   */
  const libellesAssocies = libellesDesAssocies(brouillon.forme, (brouillon.associes ?? []).length);
  const titreDe = (e: Etape) => (e.identifiant === "associes" ? libellesAssocies.titre : e.titre);
  const descriptionDe = (e: Etape) =>
    e.identifiant === "associes" ? libellesAssocies.description : e.description;
  const libelleCourtDe = (e: Etape) =>
    e.identifiant === "associes" ? libellesAssocies.libelleCourt : e.libelleCourt;

  return (
    <>
      {/* Les segments sont des frères des étapes, pas leurs enfants : c'est eux
          qui absorbent la largeur restante entre deux pastilles. */}
      <nav className={styles.stepper} aria-label="Étapes du parcours">
        {etapes.map((e, i) => {
          const franchie = e.numero < etape.numero;
          const courante = e.numero === etape.numero;
          const ton = courante ? styles.active : franchie ? styles.done : "";

          return (
            <Fragment key={e.numero}>
              <div className={`${styles.step} ${ton}`} aria-current={courante ? "step" : undefined}>
                <span className={styles.stepCircle}>{franchie ? <Coche /> : e.numero}</span>
                <span className={styles.stepLabel}>{libelleCourtDe(e)}</span>
              </div>
              {i < etapes.length - 1 && (
                <span
                  className={franchie ? `${styles.stepSegment} ${styles.done}` : styles.stepSegment}
                  aria-hidden="true"
                />
              )}
            </Fragment>
          );
        })}
      </nav>

      <section className={styles.formCard}>
        <p className={styles.avancement}>{avancement}% renseigné</p>
        <h2>{titreDe(etape)}</h2>
        <p className={styles.formDesc}>{descriptionDe(etape)}</p>

        <div className={styles.formGrid}>
          {etape.identifiant === "societe" && (
            <>
              <Champ id="forme" libelle="Forme juridique" requis anomalie={anomalies.forme}>
                <Choix
                  id="forme"
                  valeur={brouillon.forme ?? ""}
                  placeholder="Choisissez une forme"
                  options={FORMES_PROPOSEES.map((f) => ({
                    valeur: f,
                    libelle: FORMES[f].libelle + " - " + FORMES[f].description,
                  }))}
                  surChangement={(v) => modifier("forme", v)}
                />
              </Champ>

              <Champ
                id="denomination"
                libelle="Nom de la société"
                requis
                anomalie={anomalies.denomination}
              >
                <input
                  id="denomination"
                  value={brouillon.denomination ?? ""}
                  onChange={(e) => modifier("denomination", e.target.value)}
                />
              </Champ>

              {/* L'adresse est complétée sur la Base Adresse Nationale, qui
                  remplit aussi le code postal et la ville. */}
              <Champ
                id="adresse"
                libelle="Adresse du siège"
                requis
                pleineLargeur
                anomalie={anomalies.adresse}
              >
                <Adresse
                  id="adresse"
                  valeur={brouillon.adresse ?? ""}
                  surChangement={(v) => modifier("adresse", v)}
                  surCompletion={(codePostal, ville) => modifierPlusieurs({ codePostal, ville })}
                  placeholder="Rechercher l'adresse..."
                />
              </Champ>

              <Champ id="codePostal" libelle="Code postal" requis anomalie={anomalies.codePostal}>
                <input
                  id="codePostal"
                  inputMode="numeric"
                  maxLength={5}
                  value={brouillon.codePostal ?? ""}
                  onChange={(e) => modifier("codePostal", e.target.value.replace(/\D/g, ""))}
                />
              </Champ>

              <Champ id="ville" libelle="Ville" requis anomalie={anomalies.ville}>
                <Ville
                  id="ville"
                  valeur={brouillon.ville ?? ""}
                  surChangement={(v) => modifier("ville", v)}
                  surCompletion={(codePostal) => modifier("codePostal", codePostal)}
                />
              </Champ>

              <Champ id="modeDomiciliation" libelle="Mode de domiciliation">
                <Choix
                  id="modeDomiciliation"
                  valeur={brouillon.modeDomiciliation ?? ""}
                  options={MODES_DOMICILIATION.map((m) => ({ valeur: m, libelle: m }))}
                  surChangement={(v) => modifier("modeDomiciliation", v)}
                />
              </Champ>

              {/*
               * Le domicile du dirigeant : à quel titre il l'occupe, et si quelque
               * chose s'y oppose.
               *
               * L'attestation écrivait « propriétaire » pour tout le monde, locataires
               * compris, et annonçait une durée bornée à cinq ans tout en certifiant
               * que rien ne s'y opposait : les deux ne peuvent pas être vrais ensemble.
               * L'article L. 123-11-1 du code de commerce ne borne que le cas où un
               * bail ou un règlement de copropriété l'interdit.
               */}
              {brouillon.modeDomiciliation === "Domicile personnel du dirigeant" && (
                <>
                  <Champ id="occupationDomicile" libelle="Vous occupez ce logement en tant que">
                    <Choix
                      id="occupationDomicile"
                      valeur={brouillon.occupationDomicile ?? ""}
                      options={OCCUPATIONS_DOMICILE.map((o) => ({ valeur: o, libelle: o }))}
                      surChangement={(v) => modifier("occupationDomicile", v)}
                    />
                  </Champ>

                  <Champ
                    id="domiciliationRestreinte"
                    libelle="Votre bail ou votre règlement de copropriété l'interdit-il ?"
                    pleineLargeur
                  >
                    <Choix
                      id="domiciliationRestreinte"
                      valeur={brouillon.domiciliationRestreinte === true ? "Oui" : "Non"}
                      options={[
                        { valeur: "Non", libelle: "Non : rien ne s'y oppose" },
                        { valeur: "Oui", libelle: "Oui : une clause l'interdit ou le restreint" },
                      ]}
                      surChangement={(v) => modifier("domiciliationRestreinte", v === "Oui")}
                    />
                  </Champ>

                  <p className={styles.note} role="note">
                    Si rien ne s&apos;y oppose, la domiciliation n&apos;a pas de terme. Dans le
                    cas contraire, la loi la borne à cinq ans et vous devrez prévenir votre
                    bailleur ou votre syndic dans le mois de l&apos;immatriculation.
                  </p>
                </>
              )}

              {/*
               * Une société de domiciliation engage trois informations que le greffe
               * exige : le domicilié déclare au registre la dénomination et
               * l'immatriculation de son domiciliataire, et l'agrément préfectoral
               * doit figurer au contrat - sans lui, l'attestation est refusée.
               */}
              {brouillon.modeDomiciliation === "Société de domiciliation" && (
                <>
                  <p className={styles.note} role="note">
                    Ces informations figurent sur votre contrat de domiciliation. Le greffe les
                    exige : l&apos;attestation est refusée sans le numéro d&apos;agrément.
                  </p>

                  <Champ
                    id="domiciliataireNom"
                    libelle="Nom de la société de domiciliation"
                    requis
                    anomalie={anomalies["domiciliataire.denomination"]}
                  >
                    <input
                      id="domiciliataireNom"
                      placeholder="Ex : SeDomicilier"
                      value={brouillon.domiciliataire?.denomination ?? ""}
                      onChange={(e) => modifierDomiciliataire("denomination", e.target.value)}
                    />
                  </Champ>

                  <Champ
                    id="domiciliataireSiren"
                    libelle="SIREN de la société de domiciliation"
                    requis
                    anomalie={anomalies["domiciliataire.siren"]}
                  >
                    <input
                      id="domiciliataireSiren"
                      inputMode="numeric"
                      maxLength={9}
                      placeholder="9 chiffres"
                      value={brouillon.domiciliataire?.siren ?? ""}
                      onChange={(e) =>
                        modifierDomiciliataire("siren", e.target.value.replace(/\D/g, ""))
                      }
                    />
                  </Champ>

                  <Champ
                    id="domiciliataireAgrement"
                    libelle="Numéro d'agrément préfectoral"
                    requis
                    pleineLargeur
                    anomalie={anomalies["domiciliataire.agrement"]}
                  >
                    <input
                      id="domiciliataireAgrement"
                      placeholder="Ex : 2023 A 00123"
                      value={brouillon.domiciliataire?.agrement ?? ""}
                      onChange={(e) => modifierDomiciliataire("agrement", e.target.value)}
                    />
                  </Champ>
                </>
              )}

              {/* Le montant du capital est saisi ici, comme dans le parcours
                  d'origine ; sa répartition en parts vient à l'étape « Capital ». */}
              <Champ id="capital" libelle="Capital social" requis anomalie={anomalies.capital}>
                <span className={styles.suffix}>
                  <input
                    id="capital"
                    inputMode="decimal"
                    value={brouillon.capital ?? ""}
                    onChange={(e) => modifier("capital", Number(e.target.value) || 0)}
                  />
                  <span>€</span>
                </span>
              </Champ>

              <Champ id="banque" libelle="Banque">
                <Choix
                  id="banque"
                  valeur={brouillon.banque ?? ""}
                  options={BANQUES.map((b) => ({ valeur: b, libelle: b }))}
                  surChangement={(v) => modifier("banque", v)}
                />
              </Champ>

              {/* « Autre » ouvre la saisie : c'est le nom qui figure sur
                  l'attestation de dépôt du capital. */}
              {brouillon.banque === "Autre" && (
                <>
                  <Champ
                    id="banqueNom"
                    libelle="Nom de la banque"
                    requis
                    anomalie={anomalies["banqueAutre.nom"]}
                  >
                    <input
                      id="banqueNom"
                      placeholder="Ex : Crédit Agricole"
                      value={brouillon.banqueAutre?.nom ?? ""}
                      onChange={(e) => modifierBanque("nom", e.target.value)}
                    />
                  </Champ>

                  <Champ id="banqueAdresse" libelle="Adresse de la banque">
                    <Adresse
                      id="banqueAdresse"
                      valeur={brouillon.banqueAutre?.adresse ?? ""}
                      surChangement={(v) => modifierBanque("adresse", v)}
                      surCompletion={(codePostal, ville) =>
                        modifier("banqueAutre", {
                          ...brouillon.banqueAutre,
                          codePostal,
                          ville,
                        })
                      }
                      placeholder="Rechercher l'adresse..."
                    />
                  </Champ>

                  <Champ id="banqueVille" libelle="Ville de la banque">
                    {/* Comme ailleurs : la commune rapporte son code postal. */}
                    <Ville
                      id="banqueVille"
                      valeur={brouillon.banqueAutre?.ville ?? ""}
                      surChangement={(ville) => modifierBanque("ville", ville)}
                      surCompletion={(codePostal, ville) =>
                        modifierBanquePlusieurs({ ville, codePostal })
                      }
                    />
                  </Champ>

                  <Champ id="banqueCp" libelle="Code postal de la banque">
                    <input
                      id="banqueCp"
                      inputMode="numeric"
                      maxLength={5}
                      value={brouillon.banqueAutre?.codePostal ?? ""}
                      onChange={(e) =>
                        modifierBanque("codePostal", e.target.value.replace(/\D/g, ""))
                      }
                    />
                  </Champ>
                </>
              )}

              <Champ id="dateDebutActivite" libelle="Date de début d'activité">
                <DateChoisie
                  id="dateDebutActivite"
                  valeur={brouillon.dateDebutActivite ?? ""}
                  surChangement={modifierDebutDActivite}
                />
              </Champ>

              <Champ id="dateCloturePremierExercice" libelle="Date de clôture de la première année">
                <DateChoisie
                  id="dateCloturePremierExercice"
                  valeur={brouillon.dateCloturePremierExercice ?? ""}
                  surChangement={(iso) => {
                    marquerTouche("dateCloturePremierExercice");
                    modifier("dateCloturePremierExercice", iso);
                  }}
                />
              </Champ>

              <Champ id="dureeDeVie" libelle="Durée de vie (années)">
                <input
                  id="dureeDeVie"
                  inputMode="numeric"
                  /* 99 ans : la durée que portent les statuts par défaut. */
                  placeholder="99"
                  value={brouillon.dureeDeVie ?? ""}
                  onChange={(e) => modifier("dureeDeVie", Number(e.target.value) || undefined)}
                />
              </Champ>

              <Champ id="optionFiscale" libelle="Option fiscale">
                <Choix
                  id="optionFiscale"
                  valeur={brouillon.optionFiscale ?? ""}
                  options={OPTIONS_FISCALES.map((o) => ({ valeur: o, libelle: o }))}
                  surChangement={(v) => modifier("optionFiscale", v)}
                />
              </Champ>

              <Champ id="regimeTva" libelle="Régime TVA">
                <Choix
                  id="regimeTva"
                  valeur={brouillon.regimeTva ?? ""}
                  options={REGIMES_TVA.map((r) => ({ valeur: r, libelle: r }))}
                  surChangement={(v) => modifier("regimeTva", v)}
                />
              </Champ>

              <Champ
                id="activite"
                libelle="Objet social / Activité de l'entreprise"
                requis
                pleineLargeur
                anomalie={undefined}
              >
                <ObjetSocial
                  valeur={brouillon.activite ?? ""}
                  surChangement={(v) => modifier("activite", v)}
                  description={brouillon.descriptionActivite ?? ""}
                  surDescription={(v) => modifier("descriptionActivite", v)}
                  anomalie={anomalies.activite}
                />
              </Champ>
            </>
          )}

          {etape.identifiant === "associes" && (
            <Associes
              associes={brouillon.associes ?? []}
              surChangement={(v) => modifier("associes", v)}
              anomalies={anomalies}
              mot={motAssocie(brouillon.forme)}
            />
          )}

          {etape.identifiant === "dirigeants" && (
            <Dirigeants
              libelle={titreDirigeant}
              dirigeants={brouillon.dirigeants ?? []}
              associes={brouillon.associes ?? []}
              surChangement={(v) => modifier("dirigeants", v)}
              anomalies={anomalies}
            />
          )}

          {etape.identifiant === "capital" && (
            <Capital
              brouillon={brouillon}
              surChangement={modifierPlusieurs}
              surAssocies={(v) => modifier("associes", v)}
              anomalies={anomalies}
            />
          )}

          {/* Le dossier existe forcément ici : on n'atteint pas la cinquième étape
              sans avoir franchi la première, qui l'ouvre. La garde est un filet. */}
          {etape.identifiant === "documents" && dossier !== null && (
            <>
              <div className={styles.full}>
                <Pieces
                  dossierId={dossier}
                  pieces={piecesAttendues(brouillon.forme)}
                  deposees={piecesDeposees}
                />
              </div>

              {/* Les paraphes figurent en pied de chaque page des actes. */}
              <Champ id="paraphes" libelle="Paraphes / Initiales">
                <input
                  id="paraphes"
                  maxLength={10}
                  placeholder="Ex : CD"
                  value={brouillon.paraphes ?? ""}
                  onChange={(e) => modifier("paraphes", e.target.value)}
                />
              </Champ>
            </>
          )}

          {etape.identifiant === "offres" && (
            <Offres
              choisie={brouillon.offre}
              surChangement={(code) => modifier("offre", code)}
              anomalie={anomalies.offre}
            />
          )}

          {etape.identifiant === "actes" && dossier !== null && (
            <Actes
              dossierId={dossier}
              brouillon={brouillon}
              actes={actesProduits}
              surNote={(texte) => modifier("noteAvocat", texte)}
            />
          )}
        </div>

        <div className={styles.formActions}>
          {etape.numero > 1 && (
            <button
              type="button"
              className={styles.btnBack}
              onClick={() => enregistrer(etape.numero - 1)}
              disabled={enCours}
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
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Étape précédente
            </button>
          )}
          {etape.numero < etapes.length && (
            <button
              type="button"
              className={styles.btnNext}
              onClick={() => enregistrer(etape.numero + 1)}
              disabled={enCours}
            >
              {enCours ? "Enregistrement" : "Continuer"}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}

          {/* La dernière étape n'a rien à continuer : elle ramenait au tableau de
              bord, comme le #btnRetourDashboard de creation.html. */}
          {etape.numero === etapes.length && (
            <Link href="/tableau-de-bord" className={styles.btnNext}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="7" height="9" rx="1" />
                <rect x="14" y="3" width="7" height="5" rx="1" />
                <rect x="14" y="12" width="7" height="9" rx="1" />
                <rect x="3" y="16" width="7" height="5" rx="1" />
              </svg>
              Retour au tableau de bord
            </Link>
          )}
        </div>
      </section>
    </>
  );
}
