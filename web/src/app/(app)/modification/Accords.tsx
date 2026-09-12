"use client";

import { useRef, useState } from "react";
import {
  anomaliesDuTour,
  divisionRecommandee,
  repartition,
  type ContratAir,
} from "@/domain/modification/air";
import { actesAProduire } from "@/domain/modification/gabarit";
import type { Valeurs } from "@/domain/modification/types";
import { gardeDeBoucle } from "@/components/formulaire/garde-de-boucle";
import { DepotDesAccords } from "./DepotDesAccords";
import styles from "./Modification.module.css";

/** Un accord tel que le dossier le porte : ce qui a été lu, et d'où il vient. */
export interface AccordDepose extends ContratAir {
  fichier: string;
  /** Le titre sous lequel le PDF est enregistré : il voyage avec la ligne, il ne se perd pas. */
  document?: string;
  manques?: string[];
}

const EUROS = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const PRIX = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/**
 * Les accords d'investissement rapide, déposés puis relus.
 *
 * Le tour entier se résout ici et nulle part ailleurs. Chaque accord retient sa propre
 * valorisation, et la formule de chacun renvoie au nombre total d'actions après
 * conversion : aucun ne se calcule seul. Le tableau montre donc le résultat commun, et
 * il se recalcule à chaque correction.
 *
 * Rien de ce qui est lu n'est tenu pour acquis. Un montant de travers ne se voit pas
 * dans un acte, il se voit dans un capital faux trois ans plus tard : les quatre
 * colonnes de gauche sont modifiables, et la lecture ne fait que les remplir d'avance.
 */
export function Accords({
  dossier,
  accords,
  actionsExistantes,
  division,
  surAccords,
  surDivision,
}: {
  dossier: number;
  accords: AccordDepose[];
  /** Le nombre d'actions avant conversion, division du nominal comprise. */
  actionsExistantes: number;
  division: number;
  surAccords: (accords: AccordDepose[]) => void;
  surDivision: (division: number) => void;
}) {
  /* Voir `garde-de-boucle` : un dépôt a déjà figé un onglet sans laisser de trace. */
  gardeDeBoucle("Les accords d'investissement");

  /* Le dépôt passe par une fenêtre : on voit ce qu'on dépose avant que le dossier ne
     soit touché. Voir DepotDesAccords. */
  const [fenetreOuverte, setFenetreOuverte] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const differe = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * Les corrections s'enregistrent d'elles-mêmes, un peu après la frappe.
   *
   * La liste n'accompagne pas l'enregistrement général du parcours : celui-ci n'envoie
   * que les champs saisis, et le tableau se perdrait en changeant d'étape. Elle part
   * donc par sa propre route, une demi-seconde après la dernière touche - le temps
   * d'écrire un nom sans provoquer vingt appels.
   */
  function enregistrer(suivants: AccordDepose[]) {
    surAccords(suivants);
    if (differe.current) clearTimeout(differe.current);
    differe.current = setTimeout(() => {
      fetch("/api/formalites/modification/air", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier, air: suivants }),
      }).catch(() => setErreur("Les corrections n'ont pas pu être enregistrées"));
    }, 500);
  }

  const apresDivision = actionsExistantes * division;
  const contrats = accords.filter((a) => a.montant > 0 && a.valorisation > 0);

  /*
   * Trois calculs à chaque rendu, sans mémoïsation.
   *
   * Ce sont des sommes et des divisions sur quelques dizaines de lignes : les garder en
   * mémoire coûterait une empreinte du tableau à comparer, soit plus de travail que le
   * calcul lui-même, et une occasion d'afficher un total qui ne suit plus la saisie.
   */
  /*
   * La répartition porte sur toutes les lignes, pas seulement les complètes.
   *
   * Un accord dont le montant ou la valorisation manque a une part nulle : il pèse zéro
   * dans le total et reçoit zéro action, ce qui est exactement juste. Le calculer avec
   * les autres garde les rangs alignés sur le tableau - retrouver sa ligne par le nom et
   * le montant confondait deux souscripteurs qui auraient investi la même somme.
   */
  const calcul = repartition(apresDivision, accords);
  const anomalies = anomaliesDuTour(apresDivision, contrats);
  const conseillee = divisionRecommandee(actionsExistantes, contrats);

  function corriger(rang: number, champ: keyof AccordDepose, valeur: string) {
    const suivants = accords.map((accord, i) =>
      i !== rang
        ? accord
        : {
            ...accord,
            [champ]:
              champ === "montant" || champ === "valorisation"
                ? Number(valeur.replace(/[^\d]/g, "")) || 0
                : valeur,
            /* Corrigé à la main, un champ n'est plus un manque. */
            manques: (accord.manques ?? []).filter((m) => !manqueDe(champ, m)),
          }
    );
    enregistrer(suivants);
  }

  function retirer(rang: number) {
    enregistrer(accords.filter((_, i) => i !== rang));
  }

  return (
    <section className={styles.accords}>
      <h4 className={styles.champsGroupe}>Les accords convertis</h4>
      <p className={styles.accordsIntro}>
        Déposez les accords signés : leur souscripteur, leur montant, leur valorisation et leur date
        se lisent seuls. Relisez-les ensuite - ce sont ces chiffres qui fixent le nombre
        d&apos;actions à créer, et aucun acte ne les redemandera.
      </p>

      {/*
        Un seul chemin vers le tableau, et il passe par la relecture.

        L'envoi direct a disparu : il déposait, lisait et ajoutait d'un geste, si bien
        qu'un fichier choisi par erreur entrait au dossier avant qu'on ait pu le voir.
      */}
      <div className={styles.accordsDepot}>
        <button
          type="button"
          className={styles.accordsBouton}
          onClick={() => setFenetreOuverte(true)}
        >
          Déposer des accords (PDF)
        </button>
        <span className={styles.accordsPrecision}>
          Plusieurs fichiers à la fois. Chacun est lu et présenté avant d&apos;être ajouté.
        </span>
      </div>

      {fenetreOuverte && (
        <DepotDesAccords
          dossier={dossier}
          surFermeture={() => setFenetreOuverte(false)}
          surDepot={(suivants) => surAccords(suivants)}
        />
      )}

      {erreur && (
        <p className={styles.accordsErreur} role="alert">
          {erreur}
        </p>
      )}

      {accords.length > 0 && (
        <>
          <div className={styles.accordsTableau}>
            <table>
              {/* Les largeurs sont posées ici : la mise en page fixe du tableau les
                  suit, et un nom de fichier long n'écrase plus les champs de saisie. */}
              <colgroup>
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>Souscripteur</th>
                  <th>Montant</th>
                  <th>Valorisation</th>
                  <th>Signé le</th>
                  {/* Deux colonnes en une : le prix et le nombre d'actions disent la
                      même chose de la même ligne, et séparés ils prenaient la place
                      des quatre champs qu'on vient saisir. */}
                  <th>Conversion</th>
                  <th>
                    <span className={styles.accordsInvisible}>Retirer</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {accords.map((accord, rang) => {
                  const part = calcul.investisseurs[rang];
                  /*
                   * Chaque case porte son nom.
                   *
                   * Un en-tête de colonne se lit à l'œil, non au lecteur d'écran qui
                   * annonce la case seule. « Montant investi par FIGTUS » dit ce que
                   * « Montant » ne dit pas quand on arrive dessus à la tabulation.
                   */
                  const de = accord.investisseur || accord.fichier;
                  return (
                    <tr key={accord.fichier + rang}>
                      <td>
                        <input
                          value={accord.investisseur}
                          aria-label={"Souscripteur de l'accord " + accord.fichier}
                          placeholder="À compléter"
                          onChange={(e) => corriger(rang, "investisseur", e.target.value)}
                        />
                        {/* Sur une ligne, écourté : le nom entier se lit au survol.
                            Étalé, un « COMPANY - FAST INVESTMENT AGREEMENT - BSA AIR VF
                            copie (signed).pdf » prenait cinq lignes et triplait la
                            hauteur de chaque rangée. */}
                        <span className={styles.accordsFichierNom} title={accord.fichier}>
                          {accord.fichier}
                        </span>
                      </td>
                      <td>
                        <input
                          inputMode="numeric"
                          aria-label={"Montant investi par " + de}
                          value={accord.montant ? EUROS.format(accord.montant) : ""}
                          placeholder="0"
                          onChange={(e) => corriger(rang, "montant", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          inputMode="numeric"
                          aria-label={"Valorisation retenue pour " + de}
                          value={accord.valorisation ? EUROS.format(accord.valorisation) : ""}
                          placeholder="0"
                          onChange={(e) => corriger(rang, "valorisation", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          aria-label={"Date de signature de l'accord de " + de}
                          value={accord.signeLe ?? ""}
                          onChange={(e) => corriger(rang, "signeLe", e.target.value)}
                        />
                      </td>
                      <td className={styles.accordsCalcule}>
                        {/* Sans actions existantes, le prix par action divise par zéro :
                            « ∞ € » est vrai en arithmétique et ne dit rien à personne. */}
                        {part && part.part > 0 && Number.isFinite(part.actions) ? (
                          <>
                            <span className={styles.accordsActions}>
                              {EUROS.format(part.actions)} actions
                            </span>
                            {Number.isFinite(part.prix) && (
                              <span className={styles.accordsPrix}>
                                {PRIX.format(part.prix)} € l&apos;une
                              </span>
                            )}
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.accordsRetirer}
                          onClick={() => retirer(rang)}
                          aria-label={"Retirer " + (accord.investisseur || accord.fichier)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <dl className={styles.accordsBilan}>
            <div>
              <dt>Actions avant</dt>
              <dd>{EUROS.format(apresDivision)}</dd>
            </div>
            <div>
              <dt>Actions créées</dt>
              <dd>{EUROS.format(calcul.actionsCreees)}</dd>
            </div>
            <div>
              <dt>Actions après</dt>
              <dd>{EUROS.format(calcul.actionsApres)}</dd>
            </div>
            <div>
              <dt>Part des fondateurs</dt>
              <dd>
                {calcul.actionsApres > 0
                  ? ((calcul.actionsExistantes / calcul.actionsApres) * 100).toFixed(2) + " %"
                  : "-"}
              </dd>
            </div>
          </dl>

          {/*
            La division proposée, avec sa raison.
            Un bouton qui pose un nombre sans dire pourquoi ne s'utilise pas : il dit ce
            que la division change, et ce qu'elle coûte de ne pas la faire.
          */}
          {conseillee > division && (
            <p className={styles.accordsConseil}>
              À {EUROS.format(apresDivision)} actions, le plus petit souscripteur reçoit un nombre
              d&apos;actions trop éloigné de ses droits. Divisez la valeur nominale par{" "}
              {EUROS.format(conseillee)} pour ramener tous les arrondis sous 1 %.{" "}
              <button type="button" onClick={() => surDivision(conseillee)}>
                Appliquer
              </button>
            </p>
          )}

          {anomalies.map((anomalie, rang) => (
            <p
              key={rang}
              className={
                anomalie.gravite === "bloquant" ? styles.accordsBloquant : styles.accordsAvertit
              }
            >
              {anomalie.message}
            </p>
          ))}
        </>
      )}
    </section>
  );
}

/** Un manque nomme ce qui n'a pas été lu : le corriger le fait disparaître. */
function manqueDe(champ: keyof AccordDepose, manque: string): boolean {
  if (champ === "investisseur") return manque.includes("souscripteur");
  if (champ === "montant") return manque.includes("montant");
  if (champ === "valorisation") return manque.includes("valorisation");
  if (champ === "signeLe") return manque.includes("date");
  return false;
}

/**
 * Ce qu'on est en train de faire, dit avant de le faire.
 *
 * Ce changement-ci ne ressemble à aucun autre du parcours : il n'y a rien à décider, et
 * l'acte final n'est pas un procès-verbal d'assemblée. Sans ces quelques lignes, un
 * avocat qui coche « Constatation » attend le formulaire d'une augmentation ordinaire et
 * ne comprend ni pourquoi on ne lui demande pas de capital cible, ni pourquoi on lui
 * parle de division du nominal.
 */
export function ExplicationConstatation() {
  return (
    <div className={styles.explication}>
      <p>
        Des bons de souscription ont été exercés. L&apos;augmentation de capital est donc
        <strong> déjà réalisée</strong> : l&apos;article L. 225-149 du code de commerce la tient
        pour acquise du seul fait de l&apos;exercice des droits. Il n&apos;y a rien à faire décider
        par une assemblée - le président la constate, sur délégation, et met les statuts à jour.
      </p>
      <p>
        Deux conséquences pratiques. Le dossier ne produit pas de procès-verbal d&apos;assemblée
        générale. Et aucune attestation de dépôt des fonds n&apos;est due : le même texte écarte les
        formalités de dépôt des souscriptions.
      </p>
      <p>
        Le capital d&apos;après ne se saisit pas, il se calcule : chaque accord porte sa propre
        valorisation, et le nombre d&apos;actions à créer ne se lit qu&apos;en les résolvant tous
        ensemble. C&apos;est l&apos;objet du tableau, plus bas.
      </p>
    </div>
  );
}

/**
 * Les actes qui sortiront, et pourquoi chacun.
 *
 * Les réponses aux quatre questions du haut décident du jeu d'actes : ratifier une
 * émission irrégulière en appelle deux de plus, convertir avant le terme en appelle un
 * troisième. Le lien entre une case cochée et un document produit ne se voit nulle part
 * ailleurs qu'ici - à l'étape des actes, il est trop tard pour changer d'avis.
 */
export function ActesPrevus({ valeurs, forme }: { valeurs: Valeurs; forme?: string | null }) {
  const actes = actesAProduire(["constatation_augmentation"], forme, valeurs, 2).filter((acte) =>
    acte.gabarit.startsWith("modif-air-")
  );

  return (
    <div className={styles.actesPrevus}>
      <h4 className={styles.champsGroupe}>Les actes que ce dossier produira</h4>
      <ul>
        {actes.map((acte) => (
          <li key={acte.gabarit}>
            <span>{acte.titre}</span>
            <span className={styles.actesPourquoi}>{POURQUOI[acte.gabarit]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** La raison d'être de chaque acte, en une phrase qui tient dans une ligne. */
const POURQUOI: Record<string, string> = {
  "modif-air-decisions-collectives.docx":
    "Divise la valeur nominale et ratifie l'émission des bons, que le président avait consentie seul.",
  "modif-air-renonciation-dps.docx":
    "Chaque associé renonce à son droit de souscrire, ce qui évite de désigner un commissaire aux comptes.",
  "modif-air-avenant-conversion.docx":
    "Recueille l'accord de chaque souscripteur pour convertir avant le terme, et son adhésion au pacte.",
  "modif-air-constatation.docx":
    "La décision du président qui constate l'augmentation et modifie les statuts. C'est l'acte que le greffe attend.",
};
