"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  verifierEtape,
  avancementParcours,
  BANQUES,
  MODES_DOMICILIATION,
  OPTIONS_FISCALES,
  REGIMES_TVA,
  type Brouillon,
  type Etape,
} from "@/domain/formalite/parcours";
import { FORMES_PROPOSEES, FORMES, regle } from "@/domain/formalite/formes";
import { Adresse, Ville } from "./Adresse";
import { Associes } from "./Associes";
import { Actes, type ActeProduit } from "./Actes";
import { Capital } from "./Capital";
import { Dirigeants } from "./Dirigeants";
import { Offres } from "./Offres";
import { ObjetSocial } from "./ObjetSocial";
import { piecesAttendues } from "@/domain/formalite/documents";
import { Pieces } from "./Pieces";
import styles from "./Parcours.module.css";

interface Props {
  dossierId: number;
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
  const [brouillon, setBrouillon] = useState(brouillonInitial);
  const [anomalies, setAnomalies] = useState<Record<string, string>>({});
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

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

  async function enregistrer(suite: number) {
    // Les règles sont vérifiées ici pour l'affichage immédiat, et à nouveau côté
    // serveur : ce qui arrive du navigateur n'est jamais cru sur parole.
    const manques = verifierEtape(etape.numero, brouillon);
    if (manques.length > 0 && suite > etape.numero) {
      setAnomalies(Object.fromEntries(manques.map((a) => [a.champ, a.message])));
      return;
    }
    setAnomalies({});

    demarrer(async () => {
      await fetch("/api/formalites/brouillon", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier: dossierId, modifications: brouillon }),
      });
      router.push("/creation?dossier=" + dossierId + "&etape=" + suite);
      router.refresh();
    });
  }

  const titreDirigeant = regle(brouillon.forme)?.titreDirigeant ?? "Dirigeant";

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
                <span className={styles.stepLabel}>{e.titre}</span>
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
        <h2>{etape.titre}</h2>
        <p className={styles.formDesc}>{etape.description}</p>

        <div className={styles.formGrid}>
          {etape.identifiant === "societe" && (
            <>
              <Champ id="forme" libelle="Forme juridique" requis anomalie={anomalies.forme}>
                <select
                  id="forme"
                  value={brouillon.forme ?? ""}
                  onChange={(e) => modifier("forme", e.target.value)}
                >
                  <option value="">Choisissez une forme</option>
                  {FORMES_PROPOSEES.map((f) => (
                    <option key={f} value={f}>
                      {FORMES[f].libelle} - {FORMES[f].description}
                    </option>
                  ))}
                </select>
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
                  surCompletion={(codePostal, ville) =>
                    modifierPlusieurs({ codePostal, ville })
                  }
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
                <select
                  id="modeDomiciliation"
                  value={brouillon.modeDomiciliation ?? ""}
                  onChange={(e) => modifier("modeDomiciliation", e.target.value)}
                >
                  <option value="">Choisir...</option>
                  {MODES_DOMICILIATION.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Champ>

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
                <select
                  id="banque"
                  value={brouillon.banque ?? ""}
                  onChange={(e) => modifier("banque", e.target.value)}
                >
                  <option value="">Choisir...</option>
                  {BANQUES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
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
                    <input
                      id="banqueVille"
                      value={brouillon.banqueAutre?.ville ?? ""}
                      onChange={(e) => modifierBanque("ville", e.target.value)}
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
                <input
                  id="dateDebutActivite"
                  type="date"
                  value={brouillon.dateDebutActivite ?? ""}
                  onChange={(e) => modifier("dateDebutActivite", e.target.value)}
                />
              </Champ>

              <Champ
                id="dateCloturePremierExercice"
                libelle="Date de clôture de la première année"
              >
                <input
                  id="dateCloturePremierExercice"
                  type="date"
                  value={brouillon.dateCloturePremierExercice ?? ""}
                  onChange={(e) => modifier("dateCloturePremierExercice", e.target.value)}
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
                <select
                  id="optionFiscale"
                  value={brouillon.optionFiscale ?? ""}
                  onChange={(e) => modifier("optionFiscale", e.target.value)}
                >
                  <option value="">Choisir...</option>
                  {OPTIONS_FISCALES.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </Champ>

              <Champ id="regimeTva" libelle="Régime TVA">
                <select
                  id="regimeTva"
                  value={brouillon.regimeTva ?? ""}
                  onChange={(e) => modifier("regimeTva", e.target.value)}
                >
                  <option value="">Choisir...</option>
                  {REGIMES_TVA.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
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

          {/* Les associés font partie de l'étape « Société » : c'est le
              découpage du parcours d'origine. */}
          {etape.identifiant === "societe" && (
            <Associes
              associes={brouillon.associes ?? []}
              surChangement={(v) => modifier("associes", v)}
              anomalies={anomalies}
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

          {etape.identifiant === "documents" && (
            <>
              <div className={styles.full}>
                <Pieces
                  dossierId={dossierId}
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

          {etape.identifiant === "actes" && (
            <Actes
              dossierId={dossierId}
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
        </div>
      </section>
    </>
  );
}

