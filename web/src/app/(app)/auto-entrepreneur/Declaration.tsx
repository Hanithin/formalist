"use client";

import { ChampChoix } from "@/components/formulaire/ChampChoix";
import { Fragment, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  verifierEtape,
  regimeFiscalDe,
  regleActivite,
  ACTIVITES,
  SITUATIONS,
  LIEUX_EXERCICE,
  coutVersementLiberatoire,
  piecesDeclaration,
  type Declaration as Donnees,
  type Etape,
} from "@/domain/auto-entrepreneur/declaration";
import {
  ACTIVITES_REGLEMENTEES,
  REPONSES,
  activiteReglementee,
  reponseValide,
  type ReponseReglementation,
} from "@/domain/auto-entrepreneur/reglementation";
import {
  INTITULE,
  PRESTATIONS,
  DELAI,
  FRANCHISE,
  FRAIS_ANNONCES,
  FRAIS_AGENT_COMMERCIAL,
  detailDuPrix,
} from "@/domain/auto-entrepreneur/offre";
import { Adresse, Ville } from "@/components/formulaire/Adresse";
import { Pieces } from "@/components/formulaire/Pieces";
import { ChampDate } from "@/components/formulaire/ChampDate";
import styles from "./AutoEntrepreneur.module.css";
import partage from "../modification/Modification.module.css";
import { EnTetePage } from "@/components/page/EnTetePage";
/* L'étape 7 a déjà son `Recapitulatif`, qui est un écran : celui-ci est la colonne. */
import { Recapitulatif as ColonneDuDossier } from "./Recapitulatif";
import { nomDeLaPersonne } from "@/domain/auto-entrepreneur/colonne";
import Link from "next/link";

interface Props {
  /** Nul tant que rien n'a été saisi : la déclaration naît au premier enregistrement. */
  dossierId: number | null;
  etapes: Etape[];
  etapeCourante: number;
  declarationInitiale: Donnees;
  /** Ce qui a déjà été remis, pour que les cartes le disent. */
  piecesDeposees: { type: string | null; nom: string }[];
  /** Vrai au retour de Stripe, le temps d'annoncer que c'est réglé. */
  regleALInstant?: boolean;
  /** Vrai quand on revient de Stripe sans avoir payé. */
  paiementAnnule?: boolean;
  /** La date de la ligne de tête, posée par le serveur pour que les tests la figent. */
  quand?: Date;
  /**
   * Le suivi du dossier confié.
   *
   * Rendu par la page, qui seule peut le lire en base, mais placé ici : il va sous la
   * ligne de tête, et c'est ce formulaire qui la porte - le titre suit la frappe.
   */
  suivi?: React.ReactNode;
}

/**
 * Un champ : son libellé, sa saisie, et son refus juste dessous.
 *
 * C'est le bloc qui manquait pour poser deux champs côte à côte : les libellés et les
 * saisies étaient des frères, et une grille les séparait en deux colonnes - le libellé
 * à gauche, sa saisie à droite - au lieu d'apparier chaque champ. Le même composant
 * existe pour la création de société, avec le même rôle.
 */
function Champ({
  id,
  libelle,
  pleineLargeur = false,
  anomalie,
  children,
}: {
  id?: string;
  /** Un nœud, non une chaîne : les libellés portent des apostrophes échappées. */
  libelle: React.ReactNode;
  /** Les textes longs et les listes de cases prennent toute la ligne. */
  pleineLargeur?: boolean;
  anomalie?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={pleineLargeur ? `${styles.champ} ${styles.pleineLargeur}` : styles.champ}>
      <label htmlFor={id}>{libelle}</label>
      {children}
      {anomalie && <p role="alert">{anomalie}</p>}
    </div>
  );
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

export function Declaration({
  dossierId,
  etapes,
  etapeCourante,
  declarationInitiale,
  piecesDeposees,
  regleALInstant = false,
  paiementAnnule = false,
  quand,
  suivi,
}: Props) {
  const [donnees, setDonnees] = useState(declarationInitiale);
  const [anomalies, setAnomalies] = useState<Record<string, string>>({});
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
  const regle = regleActivite(donnees.natureActivite);

  function modifier(champ: keyof Donnees, valeur: unknown) {
    setDonnees((actuelles) => ({ ...actuelles, [champ]: valeur }));
  }

  /**
   * Plusieurs champs d'un coup.
   *
   * Choisir une adresse remplit la voie, le code postal et la ville : trois appels
   * successifs à modifier() partiraient du même état et les deux derniers
   * écraseraient le premier.
   */
  function modifierPlusieurs(valeurs: Partial<Donnees>) {
    setDonnees((actuelles) => ({ ...actuelles, ...valeurs }));
  }

  function aller(suite: number) {
    // Un enregistrement déjà parti suffit : le second ouvrirait un dossier de plus.
    if (enCours) return;

    const manques = verifierEtape(etape.numero, donnees);
    if (manques.length > 0 && suite > etape.numero) {
      setAnomalies(Object.fromEntries(manques.map((a) => [a.champ, a.message])));
      return;
    }
    setAnomalies({});

    demarrer(async () => {
      // La déclaration s'ouvre au premier enregistrement, une fois les règles de
      // l'étape passées : ce qui est écrit en base porte alors une information.
      let identifiant = dossier;
      if (identifiant === null) {
        const reponse = await fetch("/api/auto-entrepreneur", { method: "POST" });
        const corps = await reponse.json().catch(() => ({}));
        if (!reponse.ok || typeof corps.dossier !== "number") {
          setAnomalies({ activite: "La déclaration n'a pas pu être ouverte" });
          return;
        }
        identifiant = corps.dossier;
        setDossier(identifiant);
      }

      await fetch("/api/auto-entrepreneur", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier: identifiant, modifications: donnees }),
      });
      router.push("/auto-entrepreneur?dossier=" + identifiant + "&etape=" + suite);
      router.refresh();
    });
  }

  const erreur = (champ: string) => anomalies[champ];

  const nom = nomDeLaPersonne(donnees);

  return (
    <div className={styles.parcours}>
      {/*
        La date cède la place au retour.

        « Samedi 29 août 2026 » situe une liste d'échéances ; sur un formulaire, elle
        n'apprend rien - on sait quel jour on remplit son dossier - et occupait le seul
        coin d'où l'on pouvait repartir.
      */}
      <div className={`${styles.tete} ${partage.pleineLargeur}`}>
        <EnTetePage
          titre={nom ?? "Nouvelle auto-entreprise"}
          sousTitre={
            nom
              ? "Création d'une auto-entreprise"
              : "Création d'une auto-entreprise · enregistrée dès la première étape validée"
          }
          quand={quand}
          sansDate
          action={
            <Link href="/formalites" className={styles.retour}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              Mes formalités
            </Link>
          }
        />
      </div>

      {suivi && <div className={partage.pleineLargeur}>{suivi}</div>}

      {/* Le paiement mérite d'être annoncé : sans cela on revient sur l'offre qu'on
          vient de régler, et on doute d'avoir payé. Un abandon aussi : revenir sur
          l'offre sans un mot laisse craindre un débit. */}
      {regleALInstant && dossier !== null && (
        <div className={partage.pleineLargeur}>
          <FinDePaiement dossierId={dossier} issue="regle" />
        </div>
      )}
      {paiementAnnule && !regleALInstant && dossier !== null && (
        <div className={partage.pleineLargeur}>
          <FinDePaiement dossierId={dossier} issue="annule" />
        </div>
      )}

      {/*
        Le même fil que la création : horizontal, au-dessus du formulaire.
        En colonne à gauche, il volait un quart de la largeur à la saisie et ne
        ressemblait à aucun autre parcours du site.

        Les segments sont des frères des étapes, non leurs enfants : ce sont eux qui
        absorbent la largeur restante entre deux pastilles.
      */}
      {/*
        Le fil d'étapes disparaît sur un dossier confié.
        
        Il sert à parcourir un formulaire ; quand il n'y a plus rien à parcourir, il
        n'est qu'un obstacle qui repousse le récapitulatif d'un écran vers le bas.
      */}
      {!donnees.paye && (
        <nav
          className={`${styles.stepper} ${partage.pleineLargeur}`}
          aria-label="Étapes du parcours"
        >
          {etapes.map((e, i) => {
            const franchie = e.numero < etape.numero;
            const courante = e.numero === etape.numero;
            const ton = courante ? styles.active : franchie ? styles.done : "";

            return (
              <Fragment key={e.numero}>
                <div
                  className={`${styles.step} ${ton}`}
                  aria-current={courante ? "step" : undefined}
                >
                  <span className={styles.stepCircle}>{franchie ? <Coche /> : e.numero}</span>
                  <span className={styles.stepLabel}>{e.libelleCourt}</span>
                </div>
                {i < etapes.length - 1 && (
                  <span
                    className={
                      franchie ? `${styles.stepSegment} ${styles.done}` : styles.stepSegment
                    }
                    aria-hidden="true"
                  />
                )}
              </Fragment>
            );
          })}
        </nav>
      )}

      <section className={styles.contenu}>
        <h2>{etape.titre}</h2>

        {etape.identifiant === "identite" && (
          <div className={styles.champs}>
            <Champ id="civilite" libelle={<>Civilité</>} anomalie={erreur("civilite")}>
              <ChampChoix
                id="civilite"
                valeur={donnees.civilite ?? ""}
                options={["Madame", "Monsieur"]}
                invite="Choisissez"
                surChangement={(v) => modifier("civilite", v)}
              />
            </Champ>

            <Champ
              id="nomNaissance"
              libelle={<>Nom de naissance</>}
              anomalie={erreur("nomNaissance")}
            >
              <input
                id="nomNaissance"
                value={donnees.nomNaissance ?? ""}
                onChange={(e) => modifier("nomNaissance", e.target.value)}
              />
            </Champ>

            <Champ id="nomUsage" libelle={<>Nom d&apos;usage (facultatif)</>}>
              <input
                id="nomUsage"
                value={donnees.nomUsage ?? ""}
                onChange={(e) => modifier("nomUsage", e.target.value)}
              />
            </Champ>

            <Champ id="prenoms" libelle={<>Prénoms</>} anomalie={erreur("prenoms")}>
              <input
                id="prenoms"
                value={donnees.prenoms ?? ""}
                onChange={(e) => modifier("prenoms", e.target.value)}
              />
            </Champ>

            <Champ
              id="dateNaissance"
              libelle={<>Date de naissance</>}
              anomalie={erreur("dateNaissance")}
            >
              <ChampDate
                id="dateNaissance"
                valeur={donnees.dateNaissance ?? ""}
                surChangement={(iso) => modifier("dateNaissance", iso)}
              />
            </Champ>

            <Champ
              id="villeNaissance"
              libelle={<>Ville de naissance</>}
              anomalie={erreur("villeNaissance")}
            >
              <input
                id="villeNaissance"
                value={donnees.villeNaissance ?? ""}
                onChange={(e) => modifier("villeNaissance", e.target.value)}
              />
            </Champ>

            <Champ id="paysNaissance" libelle={<>Pays de naissance</>}>
              <input
                id="paysNaissance"
                value={donnees.paysNaissance ?? "France"}
                onChange={(e) => modifier("paysNaissance", e.target.value)}
              />
            </Champ>

            <Champ id="nationalite" libelle={<>Nationalité</>} anomalie={erreur("nationalite")}>
              <input
                id="nationalite"
                value={donnees.nationalite ?? ""}
                onChange={(e) => modifier("nationalite", e.target.value)}
              />
            </Champ>

            {/* Le guichet rattache l'auto-entreprise au régime social par ce numéro :
                sans lui, la déclaration est rejetée. */}
            <Champ
              id="numeroSecuriteSociale"
              libelle={<>Numéro de sécurité sociale</>}
              anomalie={erreur("numeroSecuriteSociale")}
            >
              <input
                id="numeroSecuriteSociale"
                inputMode="numeric"
                placeholder="1 85 04 33 123 456 78"
                value={donnees.numeroSecuriteSociale ?? ""}
                onChange={(e) =>
                  modifier("numeroSecuriteSociale", e.target.value.replace(/[^\d\s]/g, ""))
                }
              />
            </Champ>
          </div>
        )}

        {etape.identifiant === "adresse" && (
          <div className={styles.champs}>
            <Champ
              id="adresseVoie"
              libelle={<>Adresse du domicile</>}
              pleineLargeur
              anomalie={erreur("adresseVoie")}
            >
              {/* La Base Adresse Nationale remplit aussi le code postal et la ville :
                  les recopier à la main est justement là où l'erreur se glisse. */}
              <Adresse
                id="adresseVoie"
                valeur={donnees.adresseVoie ?? ""}
                surChangement={(v) => modifier("adresseVoie", v)}
                surCompletion={(codePostal, ville) => modifierPlusieurs({ codePostal, ville })}
                placeholder="Rechercher l'adresse..."
              />
            </Champ>

            <Champ
              id="adresseComplement"
              libelle={<>Complément d&apos;adresse (facultatif)</>}
              pleineLargeur
            >
              <input
                id="adresseComplement"
                placeholder="Bâtiment, étage, appartement"
                value={donnees.adresseComplement ?? ""}
                onChange={(e) => modifier("adresseComplement", e.target.value)}
              />
            </Champ>

            <Champ id="codePostal" libelle={<>Code postal</>} anomalie={erreur("codePostal")}>
              <input
                id="codePostal"
                inputMode="numeric"
                maxLength={5}
                value={donnees.codePostal ?? ""}
                onChange={(e) => modifier("codePostal", e.target.value.replace(/\D/g, ""))}
              />
            </Champ>

            <Champ id="ville" libelle={<>Ville</>} anomalie={erreur("ville")}>
              <Ville
                id="ville"
                valeur={donnees.ville ?? ""}
                surChangement={(v) => modifier("ville", v)}
                surCompletion={(codePostal) => modifier("codePostal", codePostal)}
              />
            </Champ>

            {/* Sous un régime communautaire, les biens de l'entreprise engagent aussi
                le conjoint : la déclaration le demande. */}
            <Champ
              id="situationMatrimoniale"
              libelle={<>Situation matrimoniale</>}
              anomalie={erreur("situationMatrimoniale")}
            >
              <ChampChoix
                id="situationMatrimoniale"
                valeur={donnees.situationMatrimoniale ?? ""}
                options={SITUATIONS}
                invite="Choisissez"
                surChangement={(v) => modifier("situationMatrimoniale", v)}
              />
            </Champ>

            <label className={styles.case}>
              <input
                type="checkbox"
                checked={!!donnees.adresseEntrepriseDistincte}
                onChange={(e) => modifier("adresseEntrepriseDistincte", e.target.checked)}
              />
              L&apos;activité est exercée à une autre adresse
            </label>

            {donnees.adresseEntrepriseDistincte && (
              <>
                <Champ
                  id="entrepriseVoie"
                  libelle={<>Adresse de l&apos;activité</>}
                  pleineLargeur
                  anomalie={erreur("entrepriseVoie")}
                >
                  <Adresse
                    id="entrepriseVoie"
                    valeur={donnees.entrepriseVoie ?? ""}
                    surChangement={(v) => modifier("entrepriseVoie", v)}
                    surCompletion={(entrepriseCodePostal, entrepriseVille) =>
                      modifierPlusieurs({ entrepriseCodePostal, entrepriseVille })
                    }
                    placeholder="Rechercher l'adresse..."
                  />
                </Champ>

                <Champ
                  id="entrepriseComplement"
                  libelle={<>Complément d&apos;adresse de l&apos;activité (facultatif)</>}
                  pleineLargeur
                >
                  <input
                    id="entrepriseComplement"
                    value={donnees.entrepriseComplement ?? ""}
                    onChange={(e) => modifier("entrepriseComplement", e.target.value)}
                  />
                </Champ>

                <Champ
                  id="entrepriseCodePostal"
                  libelle={<>Code postal de l&apos;activité</>}
                  anomalie={erreur("entrepriseCodePostal")}
                >
                  <input
                    id="entrepriseCodePostal"
                    inputMode="numeric"
                    maxLength={5}
                    value={donnees.entrepriseCodePostal ?? ""}
                    onChange={(e) =>
                      modifier("entrepriseCodePostal", e.target.value.replace(/\D/g, ""))
                    }
                  />
                </Champ>

                <Champ
                  id="entrepriseVille"
                  libelle={<>Ville de l&apos;activité</>}
                  anomalie={erreur("entrepriseVille")}
                >
                  <Ville
                    id="entrepriseVille"
                    valeur={donnees.entrepriseVille ?? ""}
                    surChangement={(v) => modifier("entrepriseVille", v)}
                    surCompletion={(entrepriseCodePostal) =>
                      modifier("entrepriseCodePostal", entrepriseCodePostal)
                    }
                  />
                </Champ>
              </>
            )}
          </div>
        )}

        {etape.identifiant === "activite" && (
          <div className={styles.champs}>
            <Champ
              id="natureActivite"
              libelle={<>Nature de l&apos;activité</>}
              anomalie={erreur("natureActivite")}
            >
              <ChampChoix
                id="natureActivite"
                valeur={donnees.natureActivite ?? ""}
                options={Object.values(ACTIVITES).map((a) => ({
                  valeur: a.code,
                  libelle: a.libelle,
                }))}
                invite="Choisissez"
                surChangement={(v) => modifier("natureActivite", v)}
              />
            </Champ>

            {regle && (
              <p className={styles.deduit}>
                Régime d&apos;imposition : {regimeFiscalDe(donnees.natureActivite)}. Plafond de
                chiffre d&apos;affaires : {regle.plafond.toLocaleString("fr-FR")} euros par an.
              </p>
            )}

            <Champ
              id="descriptionActivite"
              libelle={<>Description de l&apos;activité</>}
              pleineLargeur
              anomalie={erreur("descriptionActivite")}
            >
              <textarea
                id="descriptionActivite"
                rows={3}
                value={donnees.descriptionActivite ?? ""}
                onChange={(e) => modifier("descriptionActivite", e.target.value)}
              />
            </Champ>

            <Champ
              id="dateDebut"
              libelle={<>Date de début d&apos;activité</>}
              anomalie={erreur("dateDebut")}
            >
              <ChampDate
                id="dateDebut"
                valeur={donnees.dateDebut ?? ""}
                surChangement={(iso) => modifier("dateDebut", iso)}
              />
            </Champ>

            <Champ id="codeApe" libelle={<>Code APE souhaité (facultatif)</>}>
              <input
                id="codeApe"
                placeholder="Ex : 6201Z"
                value={donnees.codeApe ?? ""}
                onChange={(e) => modifier("codeApe", e.target.value.toUpperCase())}
              />
            </Champ>
            <p className={styles.deduit}>
              L&apos;INSEE l&apos;attribue à partir de votre description. Le préciser ne
              l&apos;impose pas, mais évite un contresens sur une activité peu courante.
            </p>

            <Champ
              id="lieuExercice"
              libelle={<>Lieu d&apos;exercice</>}
              anomalie={erreur("lieuExercice")}
            >
              <ChampChoix
                id="lieuExercice"
                valeur={donnees.lieuExercice ?? ""}
                options={LIEUX_EXERCICE}
                invite="Choisissez"
                surChangement={(v) => modifier("lieuExercice", v)}
              />
            </Champ>

            <Reglementation
              reponse={donnees.reponseReglementation}
              categorie={donnees.categorieReglementee}
              surReponse={(reponse) =>
                modifierPlusieurs({
                  reponseReglementation: reponse,
                  // Changer d'avis efface le métier retenu : le garder ferait
                  // réclamer une pièce au titre d'une réponse qu'on vient de retirer.
                  categorieReglementee:
                    reponse === "oui" ? donnees.categorieReglementee : undefined,
                })
              }
              surCategorie={(categorie) => modifier("categorieReglementee", categorie)}
              anomalieReponse={erreur("reponseReglementation")}
              anomalieCategorie={erreur("categorieReglementee")}
            />
          </div>
        )}

        {etape.identifiant === "options" && (
          <div className={styles.champs}>
            <label className={styles.case}>
              <input
                type="checkbox"
                checked={!!donnees.versementLiberatoire}
                onChange={(e) => modifier("versementLiberatoire", e.target.checked)}
              />
              Opter pour le versement libératoire de l&apos;impôt sur le revenu
            </label>
            {regle && (
              <p className={styles.deduit}>
                {regle.tauxVersementLiberatoire} % du chiffre d&apos;affaires, prélevés avec les
                cotisations. Sur 30 000 euros, cela représente{" "}
                {coutVersementLiberatoire(donnees.natureActivite, 30_000)?.toLocaleString("fr-FR")}{" "}
                euros.
              </p>
            )}

            <label className={styles.case}>
              <input
                type="checkbox"
                checked={!!donnees.acre}
                onChange={(e) => modifier("acre", e.target.checked)}
              />
              Demander l&apos;ACRE, l&apos;exonération de début d&apos;activité
            </label>

            {/*
              L'option EIRL du formulaire d'origine n'est pas reprise : la loi du
              14 février 2022 a supprimé ce statut, et sa création est impossible
              depuis le 15 février 2022. Le statut unique d'entrepreneur individuel,
              en vigueur depuis le 15 mai 2022, sépare de plein droit le patrimoine
              professionnel du patrimoine personnel : il n'y a plus rien à choisir.
            */}
            <p className={styles.deduit}>
              Votre patrimoine personnel est protégé de plein droit : depuis 2022, seuls les biens
              utiles à votre activité répondent de vos dettes professionnelles.
            </p>
          </div>
        )}

        {etape.identifiant === "pieces" && (
          <div className={styles.pieces}>
            <p className={styles.deduit}>
              Déposez-les maintenant. Un dossier incomplet est le premier motif de refus au guichet,
              et l&apos;avocat ne peut pas déposer sans elles.
            </p>

            {/* Le même dépôt que la création de société : glisser-déposer, contrôle du
                format à l'arrivée, et la carte passe au vert. */}
            {/* Le dossier existe forcément ici : on n'atteint pas cette étape sans
                avoir franchi la première, qui l'ouvre. La garde est un filet. */}
            {dossier !== null && (
              <Pieces
                dossierId={dossier}
                pieces={piecesDeclaration(donnees)}
                deposees={piecesDeposees}
              />
            )}
          </div>
        )}

        {etape.identifiant === "filiation" && (
          <div className={styles.champs}>
            <p className={styles.deduit}>
              Ces informations figurent sur l&apos;acte de naissance et sont exigées par le guichet
              des formalités.
            </p>

            <Champ
              id="filiationMere"
              libelle={<>Nom et prénoms de la mère</>}
              anomalie={erreur("filiationMere")}
            >
              <input
                id="filiationMere"
                value={donnees.filiationMere ?? ""}
                onChange={(e) => modifier("filiationMere", e.target.value)}
              />
            </Champ>

            <Champ
              id="filiationPere"
              libelle={<>Nom et prénoms du père</>}
              anomalie={erreur("filiationPere")}
            >
              <input
                id="filiationPere"
                value={donnees.filiationPere ?? ""}
                onChange={(e) => modifier("filiationPere", e.target.value)}
              />
            </Champ>

            <label className={styles.case}>
              <input
                type="checkbox"
                checked={!!donnees.certifie}
                onChange={(e) => modifier("certifie", e.target.checked)}
              />
              Je certifie l&apos;exactitude des informations déclarées
            </label>
            {erreur("certifie") && <p role="alert">{erreur("certifie")}</p>}
          </div>
        )}

        {etape.identifiant === "recapitulatif" && <Recapitulatif donnees={donnees} />}

        {etape.identifiant === "paiement" && dossier !== null && (
          <Paiement dossierId={dossier} declaration={donnees} surEtape={aller} />
        )}

        {/* Une déclaration réglée ne se reprend plus : elle est chez l'avocat. */}
        <div className={donnees.paye ? styles.actionsMuettes : styles.actions}>
          {etape.numero > 1 && !donnees.paye && (
            <button type="button" onClick={() => aller(etape.numero - 1)} disabled={enCours}>
              Étape précédente
            </button>
          )}
          {etape.numero < etapes.length && !donnees.paye && (
            <button
              type="button"
              className={styles.principal}
              onClick={() => aller(etape.numero + 1)}
              disabled={enCours}
            >
              {enCours ? "Enregistrement" : "Continuer"}
            </button>
          )}
        </div>
      </section>

      <ColonneDuDossier declaration={donnees} pieces={piecesDeposees} />
    </div>
  );
}

/**
 * Votre métier est-il réglementé ?
 *
 * On ne demande plus de trancher : on montre la liste, et la personne reconnaît son
 * métier - ou ne le reconnaît pas. La troisième réponse est la plus importante :
 * « je ne sais pas » n'est pas une absence de réponse, c'est un dossier que l'avocat
 * regardera. Sans elle, il ne reste que deux issues fausses - cocher à tort et
 * réclamer un diplôme inutile, ou ne rien cocher et se faire refuser au guichet.
 *
 * La liste est celle de l'article L121-1 du code de l'artisanat. Elle ne couvre que
 * l'artisanat : c'est dit, plutôt que laissé croire.
 */
function Reglementation({
  reponse,
  categorie,
  surReponse,
  surCategorie,
  anomalieReponse,
  anomalieCategorie,
}: {
  reponse?: string;
  categorie?: string;
  surReponse: (reponse: ReponseReglementation) => void;
  surCategorie: (categorie: string) => void;
  anomalieReponse?: string;
  anomalieCategorie?: string;
}) {
  const choisie = reponseValide(reponse);

  return (
    <fieldset className={styles.reglementation}>
      <legend>Votre métier demande-t-il une qualification ?</legend>
      <p className={styles.reglementationTexte}>
        Certaines activités ne peuvent s&apos;exercer qu&apos;avec un diplôme ou trois ans
        d&apos;expérience. Reconnaissez-vous votre métier dans cette liste ?
      </p>

      <ul className={styles.metiers}>
        {ACTIVITES_REGLEMENTEES.map((activite) => (
          <li key={activite.code}>
            <span className={styles.metierIntitule}>{activite.intitule}</span>
            <span className={styles.metierExemples}>{activite.exemples.join(", ")}</span>
          </li>
        ))}
      </ul>

      <div className={styles.reponses}>
        {REPONSES.map((r) => (
          <label
            key={r.valeur}
            className={choisie === r.valeur ? styles.reponseChoisie : styles.reponse}
          >
            <input
              type="radio"
              name="reponseReglementation"
              value={r.valeur}
              checked={choisie === r.valeur}
              onChange={() => surReponse(r.valeur)}
            />
            <span>
              <span className={styles.reponseLibelle}>{r.libelle}</span>
              <span className={styles.reponseTexte}>{r.explication}</span>
            </span>
          </label>
        ))}
      </div>

      {anomalieReponse && <p role="alert">{anomalieReponse}</p>}

      {/* « Oui » engage une pièce : on ne sait laquelle qu'une fois le métier nommé. */}
      {choisie === "oui" && (
        <div className={styles.precision}>
          <label htmlFor="categorieReglementee">Laquelle ?</label>
          <ChampChoix
            id="categorieReglementee"
            valeur={categorie ?? ""}
            options={ACTIVITES_REGLEMENTEES.map((activite) => ({
              valeur: activite.code,
              libelle: activite.exemples[0] + " - " + activite.intitule,
            }))}
            invite="Choisissez"
            surChangement={surCategorie}
          />
          {anomalieCategorie && <p role="alert">{anomalieCategorie}</p>}
        </div>
      )}
    </fieldset>
  );
}

/** Une ligne du récapitulatif. Un champ vide s'affiche « - » plutôt que de manquer. */
function Ligne({ intitule, valeur }: { intitule: string; valeur?: string | null }) {
  return (
    <div>
      <dt>{intitule}</dt>
      <dd>{valeur?.trim() ? valeur : <span className={styles.absent}>-</span>}</dd>
    </div>
  );
}

/** « 2026-09-01 » se lit « 1 septembre 2026 » : personne ne déclare en ISO. */
function enFrancais(iso: string | undefined): string | null {
  if (!iso) return null;
  const jour = new Date(iso + "T12:00:00");
  if (Number.isNaN(jour.getTime())) return iso;
  return jour.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Le récapitulatif, complet.
 *
 * Il montrait quatre lignes sur une déclaration qui en compte trente : on ne pouvait
 * pas relire ce qu'on s'apprêtait à déposer. Un récapitulatif qui cache la moitié de
 * ce qu'il récapitule ne sert qu'à donner l'impression d'avoir vérifié.
 */
function Recapitulatif({ donnees }: { donnees: Donnees }) {
  const activite = regleActivite(donnees.natureActivite);
  const metier = activiteReglementee(donnees.categorieReglementee);
  const reponse = REPONSES.find((r) => r.valeur === donnees.reponseReglementation);

  const adresse = [
    donnees.adresseVoie,
    donnees.adresseComplement,
    [donnees.codePostal, donnees.ville].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const adresseActivite = donnees.adresseEntrepriseDistincte
    ? [
        donnees.entrepriseVoie,
        donnees.entrepriseComplement,
        [donnees.entrepriseCodePostal, donnees.entrepriseVille].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(", ")
    : "Identique au domicile";

  return (
    <div className={styles.recap}>
      <p className={styles.deduit}>
        {donnees.paye
          ? "Ce qui a été confié à l'avocat. Une correction se demande par la messagerie : le dossier ne se modifie plus depuis ici."
          : "Relisez avant de confier votre dossier à un avocat. Chaque ligne se corrige en revenant à son étape."}
      </p>

      <section>
        <h3>Identité</h3>
        <dl className={styles.recapitulatif}>
          <Ligne intitule="Civilité" valeur={donnees.civilite} />
          <Ligne
            intitule="Nom et prénoms"
            valeur={[donnees.prenoms, donnees.nomUsage || donnees.nomNaissance]
              .filter(Boolean)
              .join(" ")}
          />
          {donnees.nomUsage && <Ligne intitule="Nom de naissance" valeur={donnees.nomNaissance} />}
          <Ligne intitule="Né(e) le" valeur={enFrancais(donnees.dateNaissance)} />
          <Ligne
            intitule="Lieu de naissance"
            valeur={[donnees.villeNaissance, donnees.paysNaissance].filter(Boolean).join(", ")}
          />
          <Ligne intitule="Nationalité" valeur={donnees.nationalite} />
          <Ligne intitule="Sécurité sociale" valeur={donnees.numeroSecuriteSociale} />
        </dl>
      </section>

      <section>
        <h3>Adresse et situation</h3>
        <dl className={styles.recapitulatif}>
          <Ligne intitule="Domicile" valeur={adresse} />
          <Ligne intitule="Adresse de l'activité" valeur={adresseActivite} />
          <Ligne intitule="Situation matrimoniale" valeur={donnees.situationMatrimoniale} />
        </dl>
      </section>

      <section>
        <h3>Activité</h3>
        <dl className={styles.recapitulatif}>
          <Ligne intitule="Nature" valeur={activite?.libelle} />
          <Ligne intitule="Description" valeur={donnees.descriptionActivite} />
          <Ligne intitule="Début" valeur={enFrancais(donnees.dateDebut)} />
          <Ligne intitule="Lieu d'exercice" valeur={donnees.lieuExercice} />
          <Ligne intitule="Code APE souhaité" valeur={donnees.codeApe} />
          <Ligne
            intitule="Métier réglementé"
            valeur={metier ? metier.exemples[0] : reponse?.libelle}
          />
        </dl>
      </section>

      <section>
        <h3>Fiscalité et social</h3>
        <dl className={styles.recapitulatif}>
          <Ligne intitule="Régime d'imposition" valeur={regimeFiscalDe(donnees.natureActivite)} />
          <Ligne
            intitule="Plafond de chiffre d'affaires"
            valeur={activite ? activite.plafond.toLocaleString("fr-FR") + " euros par an" : null}
          />
          <Ligne
            intitule="Versement libératoire"
            valeur={donnees.versementLiberatoire ? "Oui" : "Non"}
          />
          <Ligne intitule="ACRE demandée" valeur={donnees.acre ? "Oui" : "Non"} />
        </dl>
      </section>

      <section>
        <h3>Filiation</h3>
        <dl className={styles.recapitulatif}>
          <Ligne intitule="Mère" valeur={donnees.filiationMere} />
          <Ligne intitule="Père" valeur={donnees.filiationPere} />
        </dl>
      </section>
    </div>
  );
}

/**
 * Confier le dossier à un avocat.
 *
 * C'est la dernière étape, et la seule payante. Ce qui est vendu n'est pas la
 * démarche - elle est gratuite sur le guichet de l'INPI, et le dire franchement vaut
 * mieux que de le laisser découvrir - mais le fait qu'un avocat s'en charge et
 * réponde de ce qu'il dépose.
 *
 * Une fois réglé, le dossier part chez les avocats et le client n'a plus rien à
 * faire : il est prévenu à chaque étape, jusqu'au SIRET.
 */
function Paiement({
  dossierId,
  declaration,
  surEtape,
}: {
  dossierId: number;
  declaration: Donnees;
  /** Où aller quand le refus nomme l'étape qui bloque. */
  surEtape?: (numero: number) => void;
}) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const prix = detailDuPrix();

  if (declaration.paye) {
    return (
      <div className={styles.regle}>
        <h3>C&apos;est réglé, votre dossier est parti</h3>
        <p>
          Un avocat le prend en charge. Vous serez prévenu ici et par courriel à chaque étape,
          jusqu&apos;à la réception de votre SIRET. Il n&apos;y a plus rien à faire de votre côté.
        </p>
      </div>
    );
  }

  async function payer() {
    setEnCours(true);
    setErreur(null);

    const reponse = await fetch("/api/auto-entrepreneur/paiement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dossier: dossierId }),
    });

    if (!reponse.ok) {
      const donnees = await reponse.json().catch(() => ({}));
      setErreur((donnees.error as string) ?? "Le paiement n'a pas pu s'ouvrir. Réessayez.");
      setEnCours(false);

      /*
       * Le refus dit quelle étape bloque : on y va.
       *
       * Le serveur renvoyait déjà `etape` et personne ne la lisait : « Complétez votre
       * déclaration avant de la confier » s'affichait au bas de l'offre, sans dire ce
       * qui manquait ni où le remplir - à sept écrans de là dans le pire des cas.
       */
      if (typeof donnees.etape === "number") surEtape?.(donnees.etape);
      return;
    }

    // La page de paiement est chez Stripe : on quitte l'application.
    const { adresse } = await reponse.json();
    window.location.href = adresse;
  }

  return (
    <div className={styles.offre}>
      <div className={styles.offreTete}>
        <h3>{INTITULE}</h3>
        <p className={styles.offreDelai}>{DELAI}</p>
      </div>

      <ul className={styles.prestations}>
        {PRESTATIONS.map((prestation) => (
          <li key={prestation}>
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
            {prestation}
          </li>
        ))}
      </ul>

      <div className={styles.prix}>
        <span className={styles.prixMontant}>{prix.ht}</span>
        <span className={styles.prixMention}>
          hors taxes, soit {prix.ttc} TTC. Payable une fois.
        </span>
      </div>

      {/* Les frais, dits avant plutôt que facturés après. */}
      <p className={styles.frais}>
        <strong>{FRAIS_ANNONCES}</strong>
        <span>{FRAIS_AGENT_COMMERCIAL}</span>
      </p>

      {erreur && (
        <p className={styles.erreurPaiement} role="alert">
          {erreur}
        </p>
      )}

      <button type="button" className={styles.payer} onClick={payer} disabled={enCours}>
        {enCours ? "Ouverture du paiement…" : "Confier mon dossier à un avocat"}
      </button>

      <p className={styles.franchise}>{FRANCHISE}</p>
    </div>
  );
}

/**
 * Ce qu'on dit au retour de Stripe, réglé ou non.
 *
 * Les deux issues méritent un mot. Réglé sans annonce, on revient sur l'offre qu'on
 * vient de payer et on doute d'avoir payé ; abandonné sans annonce, on revient au même
 * endroit et on craint d'avoir été débité quand même.
 *
 * Elle se ferme en nettoyant l'adresse : la référence de session n'a rien à faire dans
 * une barre d'adresse qu'on recopie ou met en favori, et rouvrir la page ne doit pas
 * rejouer l'annonce.
 *
 * L'animation n'est pas décorative. Un paiement est le moment où l'on doute le plus :
 * un cercle qui se trace et une coche qui s'inscrit disent « c'est fait » mieux qu'une
 * ligne de texte apparue sans transition. L'abandon, lui, n'a rien à célébrer : son
 * cercle se trace sans coche.
 */
function FinDePaiement({ dossierId, issue }: { dossierId: number; issue: "regle" | "annule" }) {
  const [ouverte, setOuverte] = useState(true);
  const router = useRouter();

  function fermer() {
    setOuverte(false);

    /*
     * Réglé, on quitte le parcours pour la liste des formalités.
     *
     * Il n'y a plus rien à y faire, et c'est de là qu'on suit un dossier confié. Y
     * rester renverrait vers l'offre qu'on vient de payer - le routeur ressert
     * d'ailleurs la version en cache de cette adresse, celle d'avant le paiement.
     */
    if (issue === "regle") {
      router.push("/formalites");
      return;
    }

    /*
     * Abandonné, on reste sur l'offre, l'adresse nettoyée du marqueur - sans quoi
     * recharger rejouerait l'annonce. `refresh` relit la page côté serveur : sans
     * lui, le routeur ressert la version qu'il a déjà en mémoire.
     */
    router.replace("/auto-entrepreneur?dossier=" + dossierId + "&etape=8");
    router.refresh();
  }

  useEffect(() => {
    function auClavier(e: KeyboardEvent) {
      if (e.key === "Escape") fermer();
    }
    document.addEventListener("keydown", auClavier);
    return () => document.removeEventListener("keydown", auClavier);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ouverte) return null;

  const regle = issue === "regle";

  return (
    <div className={styles.voile} onClick={fermer}>
      <div
        className={styles.confirmation}
        role="dialog"
        aria-modal="true"
        aria-label={regle ? "Paiement confirmé" : "Paiement annulé"}
        onClick={(e) => e.stopPropagation()}
      >
        <span
          className={regle ? styles.marque : `${styles.marque} ${styles.marqueNeutre}`}
          aria-hidden="true"
        >
          <svg viewBox="0 0 52 52">
            <circle className={styles.cercle} cx="26" cy="26" r="24" fill="none" />
            {regle && <path className={styles.coche} fill="none" d="M14 27l8 8 16-16" />}
          </svg>
        </span>

        {regle ? (
          <>
            <h2>Paiement confirmé</h2>
            <p>
              Votre dossier part chez nos avocats. Le premier disponible le prend en charge, et vous
              êtes prévenu ici et par courriel à chaque étape, jusqu&apos;à votre SIRET.
            </p>
            <p className={styles.confirmationDetail}>
              Un reçu vous a été envoyé par courriel. Il n&apos;y a plus rien à faire de votre côté.
            </p>
          </>
        ) : (
          <>
            <h2>Paiement annulé</h2>
            <p>
              <strong>Rien n&apos;a été débité.</strong> Votre déclaration est intacte, telle que
              vous l&apos;avez laissée.
            </p>
            <p className={styles.confirmationDetail}>
              Vous pouvez la reprendre quand vous voulez : elle reste dans vos formalités.
            </p>
          </>
        )}

        <button type="button" className={styles.payer} onClick={fermer}>
          {regle ? "Voir mon dossier" : "Revenir à l'offre"}
        </button>
      </div>
    </div>
  );
}
