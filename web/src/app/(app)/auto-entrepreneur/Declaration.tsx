"use client";

import { Fragment, useState, useTransition } from "react";
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
import styles from "./AutoEntrepreneur.module.css";

interface Props {
  dossierId: number;
  etapes: Etape[];
  etapeCourante: number;
  declarationInitiale: Donnees;
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

export function Declaration({ dossierId, etapes, etapeCourante, declarationInitiale }: Props) {
  const [donnees, setDonnees] = useState(declarationInitiale);
  const [anomalies, setAnomalies] = useState<Record<string, string>>({});
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  const etape = etapes.find((e) => e.numero === etapeCourante) ?? etapes[0];
  const regle = regleActivite(donnees.natureActivite);

  function modifier(champ: keyof Donnees, valeur: unknown) {
    setDonnees((actuelles) => ({ ...actuelles, [champ]: valeur }));
  }

  function aller(suite: number) {
    const manques = verifierEtape(etape.numero, donnees);
    if (manques.length > 0 && suite > etape.numero) {
      setAnomalies(Object.fromEntries(manques.map((a) => [a.champ, a.message])));
      return;
    }
    setAnomalies({});

    demarrer(async () => {
      await fetch("/api/auto-entrepreneur", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier: dossierId, modifications: donnees }),
      });
      router.push("/auto-entrepreneur?dossier=" + dossierId + "&etape=" + suite);
      router.refresh();
    });
  }

  const erreur = (champ: string) => anomalies[champ];

  return (
    <div className={styles.parcours}>
      {/*
        Le même fil que la création : horizontal, au-dessus du formulaire.
        En colonne à gauche, il volait un quart de la largeur à la saisie et ne
        ressemblait à aucun autre parcours du site.

        Les segments sont des frères des étapes, non leurs enfants : ce sont eux qui
        absorbent la largeur restante entre deux pastilles.
      */}
      <nav className={styles.stepper} aria-label="Étapes du parcours">
        {etapes.map((e, i) => {
          const franchie = e.numero < etape.numero;
          const courante = e.numero === etape.numero;
          const ton = courante ? styles.active : franchie ? styles.done : "";

          return (
            <Fragment key={e.numero}>
              <div className={`${styles.step} ${ton}`} aria-current={courante ? "step" : undefined}>
                <span className={styles.stepCircle}>{franchie ? <Coche /> : e.numero}</span>
                <span className={styles.stepLabel}>{e.libelleCourt}</span>
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

      <section className={styles.contenu}>
        <h2>{etape.titre}</h2>

        {etape.identifiant === "identite" && (
          <div className={styles.champs}>
            <Champ id="civilite" libelle={<>Civilité</>} anomalie={erreur("civilite")}>
              <select
                id="civilite"
                value={donnees.civilite ?? ""}
                onChange={(e) => modifier("civilite", e.target.value)}
              >
                <option value="">Choisissez</option>
                <option value="Madame">Madame</option>
                <option value="Monsieur">Monsieur</option>
              </select>
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
              <input
                id="dateNaissance"
                type="date"
                value={donnees.dateNaissance ?? ""}
                onChange={(e) => modifier("dateNaissance", e.target.value)}
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
              <input
                id="adresseVoie"
                value={donnees.adresseVoie ?? ""}
                onChange={(e) => modifier("adresseVoie", e.target.value)}
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
              <input
                id="ville"
                value={donnees.ville ?? ""}
                onChange={(e) => modifier("ville", e.target.value)}
              />
            </Champ>

            {/* Sous un régime communautaire, les biens de l'entreprise engagent aussi
                le conjoint : la déclaration le demande. */}
            <Champ
              id="situationMatrimoniale"
              libelle={<>Situation matrimoniale</>}
              anomalie={erreur("situationMatrimoniale")}
            >
              <select
                id="situationMatrimoniale"
                value={donnees.situationMatrimoniale ?? ""}
                onChange={(e) => modifier("situationMatrimoniale", e.target.value)}
              >
                <option value="">Choisissez</option>
                {SITUATIONS.map((situation) => (
                  <option key={situation} value={situation}>
                    {situation}
                  </option>
                ))}
              </select>
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
                  <input
                    id="entrepriseVoie"
                    value={donnees.entrepriseVoie ?? ""}
                    onChange={(e) => modifier("entrepriseVoie", e.target.value)}
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
                  <input
                    id="entrepriseVille"
                    value={donnees.entrepriseVille ?? ""}
                    onChange={(e) => modifier("entrepriseVille", e.target.value)}
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
              <select
                id="natureActivite"
                value={donnees.natureActivite ?? ""}
                onChange={(e) => modifier("natureActivite", e.target.value)}
              >
                <option value="">Choisissez</option>
                {Object.values(ACTIVITES).map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.libelle}
                  </option>
                ))}
              </select>
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
              <input
                id="dateDebut"
                type="date"
                value={donnees.dateDebut ?? ""}
                onChange={(e) => modifier("dateDebut", e.target.value)}
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
              <select
                id="lieuExercice"
                value={donnees.lieuExercice ?? ""}
                onChange={(e) => modifier("lieuExercice", e.target.value)}
              >
                <option value="">Choisissez</option>
                {LIEUX_EXERCICE.map((lieu) => (
                  <option key={lieu} value={lieu}>
                    {lieu}
                  </option>
                ))}
              </select>
            </Champ>

            {/* Coiffure, bâtiment, transport, restauration : le guichet réclame le
                diplôme ou l'autorisation avant d'immatriculer. Mieux vaut le demander
                ici que de le découvrir au dépôt. */}
            <label className={styles.case}>
              <input
                type="checkbox"
                checked={!!donnees.activiteReglementee}
                onChange={(e) => modifier("activiteReglementee", e.target.checked)}
              />
              Mon activité est réglementée (diplôme ou autorisation exigés)
            </label>
            {donnees.activiteReglementee && (
              <p className={styles.deduit}>
                Un justificatif de qualification professionnelle ou l&apos;autorisation
                d&apos;exercer vous sera demandé à l&apos;étape des pièces.
              </p>
            )}
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
              Rassemblez-les avant de continuer. Le guichet refuse un dossier incomplet, et
              c&apos;est le motif de refus le plus courant.
            </p>

            <ul className={styles.listePieces}>
              {piecesDeclaration(donnees).map((piece) => (
                <li key={piece.identifiant} className={styles.piece}>
                  <span className={styles.pieceTitre}>{piece.titre}</span>
                  <span className={styles.pieceTexte}>{piece.description}</span>
                  <span className={styles.pieceFormats}>
                    {piece.formats.join(", ")} - 10 Mo au plus
                  </span>
                </li>
              ))}
            </ul>

            <p className={styles.deduit}>
              Le dépôt se fait depuis vos documents, une fois la déclaration enregistrée.
            </p>
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

        {etape.identifiant === "recapitulatif" && (
          <dl className={styles.recapitulatif}>
            <div>
              <dt>Déclarant</dt>
              <dd>
                {donnees.prenoms} {donnees.nomUsage || donnees.nomNaissance}
              </dd>
            </div>
            <div>
              <dt>Activité</dt>
              <dd>{regle?.libelle}</dd>
            </div>
            <div>
              <dt>Régime</dt>
              <dd>{regimeFiscalDe(donnees.natureActivite)}</dd>
            </div>
            <div>
              <dt>Début</dt>
              <dd>{donnees.dateDebut}</dd>
            </div>
          </dl>
        )}

        <div className={styles.actions}>
          {etape.numero > 1 && (
            <button type="button" onClick={() => aller(etape.numero - 1)} disabled={enCours}>
              Étape précédente
            </button>
          )}
          {etape.numero < etapes.length && (
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
    </div>
  );
}
