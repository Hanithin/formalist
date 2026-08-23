import Link from "next/link";
import { accorder } from "@/domain/formalite/etapes";
import { ATTENTES_MONTREES } from "@/domain/formalite/actions";
import type { ActionDeDossier } from "@/domain/formalite/actions";
import { enRetard, type Echeance, type Indicateurs, type Ton } from "@/domain/formalite/accueil";
import { dateRelative, phraseJournal, seSuffitAElleMeme } from "@/domain/formalite/journal";
import type { EntreeJournal } from "@/domain/formalite/journal";
import { ToutesLesAttentes } from "./ToutesLesAttentes";
import styles from "./TableauDeBord.module.css";

/**
 * Les sections de l'accueil.
 *
 * Chacune répond à une question, et à une seule. Elles sont écrites ici plutôt que
 * dans la page pour deux raisons : la page devenait une suite de trois cents lignes de
 * balisage où l'on ne voyait plus la structure, et une section qui échoue ne doit pas
 * emporter les autres.
 */

/* ------------------------------------------------------------ Les chiffres */

/**
 * Trois nombres sur une ligne, séparés par un filet.
 *
 * Pas des cartes : ce ne sont pas des indicateurs financiers qu'on vient contempler,
 * mais un état des lieux qu'on lit en passant. Un zéro s'affiche - « 0 action
 * requise » est une bonne nouvelle qu'il faut pouvoir lire.
 */
export function Indicateurs({ chiffres }: { chiffres: Indicateurs }) {
  const lignes = [
    { valeur: chiffres.enCours, libelle: accorder(chiffres.enCours, "formalité en cours", "formalités en cours").replace(/^\d+\s/, "") },
    { valeur: chiffres.actionsRequises, libelle: chiffres.actionsRequises > 1 ? "actions requises" : "action requise" },
    { valeur: chiffres.enValidation, libelle: "en validation" },
  ];

  return (
    <dl className={styles.indicateurs}>
      {lignes.map((ligne) => (
        <div className={styles.indicateur} key={ligne.libelle}>
          <dt className={styles.indicateurValeur}>{ligne.valeur}</dt>
          <dd className={styles.indicateurLibelle}>{ligne.libelle}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------------------------------------------------------- Ce qu'on reprend */

/**
 * Le dossier mis en avant.
 *
 * Il portait un fond jaune plein, qui se lisait comme une alerte alors qu'il n'annonce
 * rien de grave : c'est une invitation à reprendre. La teinte est ramenée à un fond
 * crème, et le jaune franc reste réservé aux statuts qui demandent une action.
 */
export function Reprendre({
  type,
  societe,
  pourcentage,
  prochaineEtape,
  bouton,
  lien,
}: {
  type: string;
  societe: string;
  pourcentage: number;
  prochaineEtape: string;
  bouton: string;
  lien: string;
}) {
  return (
    <section className={styles.reprendre} aria-labelledby="reprendre">
      <div className={styles.reprendreTete}>
        <h2 id="reprendre" className={styles.reprendreEtiquette}>
          Reprendre
        </h2>
        <span className={styles.reprendrePourcent}>{pourcentage} %</span>
      </div>

      <p className={styles.reprendreTitre}>
        {type} · <strong>{societe}</strong>
      </p>

      {/* La barre porte son état en texte : une couleur seule ne se lit pas. */}
      <div
        className={styles.jauge}
        role="progressbar"
        aria-valuenow={pourcentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={"Avancement : " + pourcentage + " %"}
      >
        <span className={styles.jaugeRemplie} style={{ width: pourcentage + "%" }} />
      </div>

      <div className={styles.reprendrePied}>
        <span className={styles.reprendreSuite}>
          <span className={styles.reprendreSuiteEtiquette}>Prochaine étape</span>
          {prochaineEtape}
        </span>
        <Link href={lien} className={styles.reprendreBouton}>
          {bouton}
        </Link>
      </div>
    </section>
  );
}

/* ------------------------------------------------- Ce qui requiert l'attention */

export function Attention({ actions }: { actions: ActionDeDossier[] }) {
  const montrees = actions.slice(0, ATTENTES_MONTREES);

  return (
    <section className={styles.section} aria-labelledby="attention">
      <div className={styles.sectionTete}>
        <h2 id="attention" className={styles.sectionTitre}>
          Ce qui requiert votre attention
        </h2>
        {actions.length > ATTENTES_MONTREES && (
          <ToutesLesAttentes actions={actions} plusieurs />
        )}
      </div>

      {actions.length === 0 ? (
        <EtatVide
          titre="Tout est à jour"
          texte="Vous n'avez aucune action requise pour le moment."
        />
      ) : (
        <ul className={styles.attentions}>
          {montrees.map((action, rang) => (
            <li key={action.dossierId + "-" + rang}>
              <Link
                href={action.lien}
                className={
                  action.urgent ? `${styles.attention} ${styles.urgente}` : styles.attention
                }
              >
                <span className={styles.attentionPastille} aria-hidden="true" />
                <span className={styles.attentionCorps}>
                  <span className={styles.attentionTitre}>{action.titre}</span>
                  <span className={styles.attentionDetail}>
                    <strong>{action.societe}</strong> · {action.precision}
                  </span>
                </span>
                <span className={styles.attentionGeste}>{action.bouton}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------- Les formalités en cours */

export interface CarteFormalite {
  id: number;
  type: string;
  societe: string;
  pourcentage: number;
  etat: string;
  ton: Ton;
  geste: string;
  lien: string;
}

export function FormalitesEnCours({
  cartes,
  total,
}: {
  cartes: CarteFormalite[];
  total: number;
}) {
  return (
    <section className={styles.section} aria-labelledby="formalites-en-cours">
      <div className={styles.sectionTete}>
        <h2 id="formalites-en-cours" className={styles.sectionTitre}>
          Formalités en cours
        </h2>
        {total > cartes.length && (
          <Link href="/formalites" className={styles.sectionLien}>
            Voir tout
          </Link>
        )}
      </div>

      {cartes.length === 0 ? (
        <EtatVide
          titre="Aucune formalité en cours"
          texte="Lancez votre première démarche depuis le bouton de la colonne."
        />
      ) : (
        <ul className={styles.formalites}>
          {cartes.map((carte) => (
            <li key={carte.id} className={styles.formalite}>
              <div className={styles.formaliteTete}>
                <span className={styles.formaliteType}>{carte.type}</span>
                <StatutBadge ton={carte.ton} libelle={carte.etat} />
              </div>

              <p className={styles.formaliteSociete} title={carte.societe}>
                {carte.societe}
              </p>

              <div
                className={styles.jauge}
                role="progressbar"
                aria-valuenow={carte.pourcentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={"Avancement : " + carte.pourcentage + " %"}
              >
                <span
                  className={styles.jaugeRemplie}
                  style={{ width: carte.pourcentage + "%" }}
                />
              </div>

              <div className={styles.formalitePied}>
                <span className={styles.formalitePourcent}>{carte.pourcentage} %</span>
                <Link href={carte.lien} className={styles.formaliteGeste}>
                  {carte.geste}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------- Les échéances */

const MOIS_LISIBLE = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function dateLisible(iso: string): string {
  const date = new Date(iso + "T00:00:00Z");
  return Number.isNaN(date.getTime()) ? iso : MOIS_LISIBLE.format(date);
}

export function Echeances({ echeances }: { echeances: Echeance[] }) {
  return (
    <section className={styles.section} aria-labelledby="echeances">
      <div className={styles.sectionTete}>
        <h2 id="echeances" className={styles.sectionTitre}>
          Échéances à venir
        </h2>
      </div>

      {echeances.length === 0 ? (
        <EtatVide
          titre="Aucune échéance à venir"
          texte="Nous afficherons ici les prochaines obligations juridiques de vos sociétés."
        />
      ) : (
        <ul className={styles.echeances}>
          {echeances.slice(0, 4).map((echeance) => {
            const passee = enRetard(echeance);
            return (
              <li key={echeance.cle} className={styles.echeance}>
                <span className={styles.echeanceCorps}>
                  <span className={styles.echeanceIntitule}>{echeance.intitule}</span>
                  <span className={styles.echeanceSociete}>{echeance.societe}</span>
                </span>
                <span
                  className={
                    passee ? `${styles.echeanceDate} ${styles.depassee}` : styles.echeanceDate
                  }
                >
                  {passee ? "Dépassée le " : ""}
                  {dateLisible(echeance.limite)}
                </span>
                <Link href={echeance.lien} className={styles.echeanceGeste}>
                  {echeance.bouton}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* --------------------------------------------------------- L'activité */

type Entree = EntreeJournal & { dossierId: number; societe: string };

/**
 * L'activité, en une colonne serrée.
 *
 * Elle occupait une grande carte à deux colonnes, pour une information dont personne
 * n'a besoin tout de suite. Cinq lignes suffisent : c'est un journal, pas un tableau
 * de bord dans le tableau de bord.
 */
export function ActiviteRecente({
  activite,
  lienDossier,
}: {
  activite: Entree[];
  lienDossier: (id: number) => string;
}) {
  return (
    <section className={styles.section} aria-labelledby="activite">
      <div className={styles.sectionTete}>
        <h2 id="activite" className={styles.sectionTitre}>
          Activité récente
        </h2>
      </div>

      {activite.length === 0 ? (
        <EtatVide texte="Aucune activité récente." />
      ) : (
        <ul className={styles.activites}>
          {activite.slice(0, 5).map((entree, rang) => {
            const cestMoi = entree.auteurRole === "user";
            const qui = cestMoi ? "Vous" : (entree.auteur ?? "Formalist");

            return (
              <li key={rang}>
                <Link href={lienDossier(entree.dossierId)} className={styles.activite}>
                  <span className={styles.activitePastille} aria-hidden="true" />
                  <span className={styles.activiteCorps}>
                    <span className={styles.activiteSociete}>{entree.societe}</span>
                    <span className={styles.activiteTexte}>
                      {seSuffitAElleMeme(entree) ? (
                        entree.valeur
                      ) : (
                        <>
                          {qui} {phraseJournal(entree, cestMoi)}
                        </>
                      )}
                    </span>
                  </span>
                  <span className={styles.activiteQuand}>{dateRelative(entree.quand)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------ Les communs */

export function StatutBadge({ ton, libelle }: { ton: Ton; libelle: string }) {
  /*
   * Le mot porte l'information, la couleur ne fait que l'appuyer.
   *
   * Un badge qui ne se distinguerait que par sa teinte serait illisible pour qui ne
   * distingue pas les couleurs - et sur une capture en noir et blanc.
   */
  const teinte =
    ton === "action"
      ? styles.badgeAction
      : ton === "termine"
        ? styles.badgeTermine
        : ton === "validation"
          ? styles.badgeValidation
          : "";

  return <span className={`${styles.badge} ${teinte}`}>{libelle}</span>;
}

export function EtatVide({ titre, texte }: { titre?: string; texte: string }) {
  return (
    <div className={styles.vide}>
      {titre && <p className={styles.videTitre}>{titre}</p>}
      <p className={styles.videTexte}>{texte}</p>
    </div>
  );
}
