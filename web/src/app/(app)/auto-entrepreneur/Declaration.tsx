"use client";

import { useState, useTransition } from "react";
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
      <ol className={styles.etapes}>
        {etapes.map((e) => (
          <li
            key={e.numero}
            className={e.numero === etape.numero ? styles.etapeActive : styles.etape}
            aria-current={e.numero === etape.numero ? "step" : undefined}
          >
            <span className={styles.numero}>{e.numero}</span>
            {e.titre}
          </li>
        ))}
      </ol>

      <section className={styles.contenu}>
        <h2>{etape.titre}</h2>

        {etape.identifiant === "identite" && (
          <div className={styles.champs}>
            <label htmlFor="civilite">Civilité</label>
            <select
              id="civilite"
              value={donnees.civilite ?? ""}
              onChange={(e) => modifier("civilite", e.target.value)}
            >
              <option value="">Choisissez</option>
              <option value="Madame">Madame</option>
              <option value="Monsieur">Monsieur</option>
            </select>
            {erreur("civilite") && <p role="alert">{erreur("civilite")}</p>}

            <label htmlFor="nomNaissance">Nom de naissance</label>
            <input
              id="nomNaissance"
              value={donnees.nomNaissance ?? ""}
              onChange={(e) => modifier("nomNaissance", e.target.value)}
            />
            {erreur("nomNaissance") && <p role="alert">{erreur("nomNaissance")}</p>}

            <label htmlFor="nomUsage">Nom d&apos;usage (facultatif)</label>
            <input
              id="nomUsage"
              value={donnees.nomUsage ?? ""}
              onChange={(e) => modifier("nomUsage", e.target.value)}
            />

            <label htmlFor="prenoms">Prénoms</label>
            <input
              id="prenoms"
              value={donnees.prenoms ?? ""}
              onChange={(e) => modifier("prenoms", e.target.value)}
            />
            {erreur("prenoms") && <p role="alert">{erreur("prenoms")}</p>}

            <label htmlFor="dateNaissance">Date de naissance</label>
            <input
              id="dateNaissance"
              type="date"
              value={donnees.dateNaissance ?? ""}
              onChange={(e) => modifier("dateNaissance", e.target.value)}
            />
            {erreur("dateNaissance") && <p role="alert">{erreur("dateNaissance")}</p>}

            <label htmlFor="villeNaissance">Ville de naissance</label>
            <input
              id="villeNaissance"
              value={donnees.villeNaissance ?? ""}
              onChange={(e) => modifier("villeNaissance", e.target.value)}
            />
            {erreur("villeNaissance") && <p role="alert">{erreur("villeNaissance")}</p>}

            <label htmlFor="paysNaissance">Pays de naissance</label>
            <input
              id="paysNaissance"
              value={donnees.paysNaissance ?? "France"}
              onChange={(e) => modifier("paysNaissance", e.target.value)}
            />

            <label htmlFor="nationalite">Nationalité</label>
            <input
              id="nationalite"
              value={donnees.nationalite ?? ""}
              onChange={(e) => modifier("nationalite", e.target.value)}
            />
            {erreur("nationalite") && <p role="alert">{erreur("nationalite")}</p>}

            {/* Le guichet rattache l'auto-entreprise au régime social par ce numéro :
                sans lui, la déclaration est rejetée. */}
            <label htmlFor="numeroSecuriteSociale">Numéro de sécurité sociale</label>
            <input
              id="numeroSecuriteSociale"
              inputMode="numeric"
              placeholder="1 85 04 33 123 456 78"
              value={donnees.numeroSecuriteSociale ?? ""}
              onChange={(e) =>
                modifier("numeroSecuriteSociale", e.target.value.replace(/[^\d\s]/g, ""))
              }
            />
            {erreur("numeroSecuriteSociale") && (
              <p role="alert">{erreur("numeroSecuriteSociale")}</p>
            )}
          </div>
        )}

        {etape.identifiant === "adresse" && (
          <div className={styles.champs}>
            <label htmlFor="adresseVoie">Adresse du domicile</label>
            <input
              id="adresseVoie"
              value={donnees.adresseVoie ?? ""}
              onChange={(e) => modifier("adresseVoie", e.target.value)}
            />
            {erreur("adresseVoie") && <p role="alert">{erreur("adresseVoie")}</p>}

            <label htmlFor="adresseComplement">Complément d&apos;adresse (facultatif)</label>
            <input
              id="adresseComplement"
              placeholder="Bâtiment, étage, appartement"
              value={donnees.adresseComplement ?? ""}
              onChange={(e) => modifier("adresseComplement", e.target.value)}
            />

            <label htmlFor="codePostal">Code postal</label>
            <input
              id="codePostal"
              inputMode="numeric"
              maxLength={5}
              value={donnees.codePostal ?? ""}
              onChange={(e) => modifier("codePostal", e.target.value.replace(/\D/g, ""))}
            />
            {erreur("codePostal") && <p role="alert">{erreur("codePostal")}</p>}

            <label htmlFor="ville">Ville</label>
            <input
              id="ville"
              value={donnees.ville ?? ""}
              onChange={(e) => modifier("ville", e.target.value)}
            />
            {erreur("ville") && <p role="alert">{erreur("ville")}</p>}

            {/* Sous un régime communautaire, les biens de l'entreprise engagent aussi
                le conjoint : la déclaration le demande. */}
            <label htmlFor="situationMatrimoniale">Situation matrimoniale</label>
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
            {erreur("situationMatrimoniale") && (
              <p role="alert">{erreur("situationMatrimoniale")}</p>
            )}

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
                <label htmlFor="entrepriseVoie">Adresse de l&apos;activité</label>
                <input
                  id="entrepriseVoie"
                  value={donnees.entrepriseVoie ?? ""}
                  onChange={(e) => modifier("entrepriseVoie", e.target.value)}
                />
                {erreur("entrepriseVoie") && <p role="alert">{erreur("entrepriseVoie")}</p>}

                <label htmlFor="entrepriseComplement">
                  Complément d&apos;adresse de l&apos;activité (facultatif)
                </label>
                <input
                  id="entrepriseComplement"
                  value={donnees.entrepriseComplement ?? ""}
                  onChange={(e) => modifier("entrepriseComplement", e.target.value)}
                />

                <label htmlFor="entrepriseCodePostal">Code postal de l&apos;activité</label>
                <input
                  id="entrepriseCodePostal"
                  inputMode="numeric"
                  maxLength={5}
                  value={donnees.entrepriseCodePostal ?? ""}
                  onChange={(e) =>
                    modifier("entrepriseCodePostal", e.target.value.replace(/\D/g, ""))
                  }
                />
                {erreur("entrepriseCodePostal") && (
                  <p role="alert">{erreur("entrepriseCodePostal")}</p>
                )}

                <label htmlFor="entrepriseVille">Ville de l&apos;activité</label>
                <input
                  id="entrepriseVille"
                  value={donnees.entrepriseVille ?? ""}
                  onChange={(e) => modifier("entrepriseVille", e.target.value)}
                />
                {erreur("entrepriseVille") && <p role="alert">{erreur("entrepriseVille")}</p>}
              </>
            )}
          </div>
        )}

        {etape.identifiant === "activite" && (
          <div className={styles.champs}>
            <label htmlFor="natureActivite">Nature de l&apos;activité</label>
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
            {erreur("natureActivite") && <p role="alert">{erreur("natureActivite")}</p>}

            {regle && (
              <p className={styles.deduit}>
                Régime d&apos;imposition : {regimeFiscalDe(donnees.natureActivite)}. Plafond de
                chiffre d&apos;affaires : {regle.plafond.toLocaleString("fr-FR")} euros par an.
              </p>
            )}

            <label htmlFor="descriptionActivite">Description de l&apos;activité</label>
            <textarea
              id="descriptionActivite"
              rows={3}
              value={donnees.descriptionActivite ?? ""}
              onChange={(e) => modifier("descriptionActivite", e.target.value)}
            />
            {erreur("descriptionActivite") && <p role="alert">{erreur("descriptionActivite")}</p>}

            <label htmlFor="dateDebut">Date de début d&apos;activité</label>
            <input
              id="dateDebut"
              type="date"
              value={donnees.dateDebut ?? ""}
              onChange={(e) => modifier("dateDebut", e.target.value)}
            />
            {erreur("dateDebut") && <p role="alert">{erreur("dateDebut")}</p>}

            <label htmlFor="codeApe">Code APE souhaité (facultatif)</label>
            <input
              id="codeApe"
              placeholder="Ex : 6201Z"
              value={donnees.codeApe ?? ""}
              onChange={(e) => modifier("codeApe", e.target.value.toUpperCase())}
            />
            <p className={styles.deduit}>
              L&apos;INSEE l&apos;attribue à partir de votre description. Le préciser ne
              l&apos;impose pas, mais évite un contresens sur une activité peu courante.
            </p>

            <label htmlFor="lieuExercice">Lieu d&apos;exercice</label>
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
            {erreur("lieuExercice") && <p role="alert">{erreur("lieuExercice")}</p>}

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
              Votre patrimoine personnel est protégé de plein droit : depuis 2022, seuls
              les biens utiles à votre activité répondent de vos dettes professionnelles.
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

            <label htmlFor="filiationMere">Nom et prénoms de la mère</label>
            <input
              id="filiationMere"
              value={donnees.filiationMere ?? ""}
              onChange={(e) => modifier("filiationMere", e.target.value)}
            />
            {erreur("filiationMere") && <p role="alert">{erreur("filiationMere")}</p>}

            <label htmlFor="filiationPere">Nom et prénoms du père</label>
            <input
              id="filiationPere"
              value={donnees.filiationPere ?? ""}
              onChange={(e) => modifier("filiationPere", e.target.value)}
            />
            {erreur("filiationPere") && <p role="alert">{erreur("filiationPere")}</p>}

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
