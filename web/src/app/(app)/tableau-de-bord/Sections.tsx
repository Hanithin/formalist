import Link from "next/link";
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

export interface Chiffre {
  valeur: number;
  libelle: string;
}

/**
 * Une ligne de chiffres, sous la salutation.
 *
 * Ils ont été essayés en bloc de quatre cases à droite de la reprise : ils y pesaient
 * autant qu'elle, alors qu'ils ne demandent rien, et le bloc venait toucher le bouton
 * de l'en-tête. En ligne, ils se lisent en passant - c'est leur rôle - et la reprise
 * retrouve toute la largeur, qui est ce qu'elle mérite puisqu'on vient pour elle.
 *
 * Un zéro ne s'écrit pas. « 0 échéance » occupe la place d'un chiffre et annonce une
 * absence là où l'on cherche une présence : on relit pour vérifier qu'on n'a rien
 * manqué.
 */
export function Indicateurs({ chiffres }: { chiffres: Chiffre[] }) {
  const montres = chiffres.filter((chiffre) => chiffre.valeur > 0);
  if (montres.length === 0) return null;

  return (
    <dl className={styles.indicateurs}>
      {montres.map((chiffre) => (
        <div className={styles.indicateur} key={chiffre.libelle}>
          {/*
            Tous les chiffres de la même encre.
            Le premier était doré pour dire qu'il appelle un geste : sur un fond clair,
            l'or vire au brun et se lit comme une couleur passée, non comme une alerte.
            L'ordre suffit - ce qui presse vient en premier.
          */}
          <dt className={styles.indicateurValeur}>{chiffre.valeur}</dt>
          <dd className={styles.indicateurLibelle}>{chiffre.libelle}</dd>
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
      {/*
        La nature en badge, non en préfixe du titre.
        « Fermeture · SASU STERLING PEAK » mettait sur la même ligne, au même corps, ce
        qu'on fait et à qui on le fait : le nom de la société s'y perdait alors qu'il
        est le sujet. En badge, la nature se lit d'un coup d'œil et rend sa place au nom.
      */}
      <div className={styles.reprendreTete}>
        <h2 id="reprendre" className={styles.reprendreEtiquette}>
          Reprendre
        </h2>
        <span className={styles.reprendreBadge}>{type}</span>
      </div>

      <p className={styles.reprendreTitre}>{societe}</p>

      {/*
        La suite en une phrase, sans intitulé.
        « PROCHAINE ÉTAPE » au-dessus d'une phrase qui dit déjà l'étape prenait une
        ligne pour répéter ce que la ligne suivante disait mieux.
      */}
      <p className={styles.reprendreSuite}>{prochaineEtape}</p>

      {/*
        La barre, le pourcentage et le bouton sur la même ligne.
        Le pourcentage était seul en haut à droite et le bouton seul en bas à droite :
        deux ancrages opposés pour une même information, et un grand vide entre les deux.
      */}
      <div className={styles.reprendrePied}>
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
        <span className={styles.reprendrePourcent}>{pourcentage} %</span>
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
                {/*
                  Le geste se lit, il ne se boutonne pas.
                  
                  La rangée entière est déjà un lien : poser un bouton dedans en
                  répétait la fonction, et vingt rangées faisaient vingt boutons
                  « Reprendre » alignés, qui pesaient plus que ce qu'ils annonçaient.
                  Le verbe reste - il n'est pas toujours le même - mais en texte, avec
                  le chevron qui dit que la ligne mène quelque part.
                */}
                <span className={styles.attentionGeste}>
                  {action.bouton}
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
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* --------------------------------------------------- La file de travail */

export interface LigneDeTravail {
  id: number;
  /** L'opération : « Création SASU », « Dépôt des comptes ». */
  type: string;
  /** Ce qu'elle attend, en une ligne. */
  precision: string;
  societe: string;
  pourcentage: number;
  etat: string;
  ton: Ton;
  geste: string;
  lien: string;
}

/** Cinq lignes à l'écran : au-delà, la file se lit sur sa propre page. */
export const LIGNES_MONTREES = 5;

/**
 * Les dossiers en cours, en table plutôt qu'en vignettes.
 *
 * Trois cartes suffisaient pour trois dossiers ; à vingt, elles ne montraient plus que
 * les trois premiers et occupaient toute la largeur pour le faire. Une table en montre
 * cinq dans la même hauteur, aligne les avancements - ce qui rend la comparaison
 * possible d'un coup d'œil - et laisse la place à une colonne latérale.
 */
export function FileDeTravail({
  lignes,
  total,
}: {
  lignes: LigneDeTravail[];
  total: number;
}) {
  return (
    <section className={styles.section} aria-labelledby="file">
      <div className={styles.sectionTete}>
        <h2 id="file" className={styles.sectionTitre}>
          Formalités en cours
          {total > 0 && <span className={styles.sectionCompte}>{total}</span>}
        </h2>
        {total > lignes.length && (
          <Link href="/formalites" className={styles.sectionLien}>
            Voir toute la file →
          </Link>
        )}
      </div>

      {lignes.length === 0 ? (
        <EtatVide
          titre="Aucune formalité en cours"
          texte="Lancez votre première démarche depuis le bouton de la colonne."
        />
      ) : (
        <div className={styles.file}>
          <div className={styles.fileEntete} aria-hidden="true">
            <span>Formalité</span>
            <span>Société</span>
            <span>Avancement</span>
            <span />
          </div>

          <ul className={styles.fileLignes}>
            {lignes.map((ligne) => (
              <li key={ligne.id} className={styles.fileLigne}>
                <span className={styles.fileCorps}>
                  <span className={styles.fileType}>{ligne.type}</span>
                  <span className={styles.filePrecision}>{ligne.precision}</span>
                </span>

                <span className={styles.fileSociete} title={ligne.societe}>
                  {ligne.societe}
                </span>

                <span className={styles.fileAvancement}>
                  <span
                    className={styles.jauge}
                    role="progressbar"
                    aria-valuenow={ligne.pourcentage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={"Avancement : " + ligne.pourcentage + " %"}
                  >
                    <span
                      className={styles.jaugeRemplie}
                      style={{ width: ligne.pourcentage + "%" }}
                    />
                  </span>
                  <span className={styles.filePourcent}>{ligne.pourcentage} %</span>
                </span>

                <Link href={ligne.lien} className={styles.fileGeste}>
                  {ligne.geste}
                </Link>
              </li>
            ))}
          </ul>

          {total > lignes.length && (
            <p className={styles.filePied}>
              {lignes.length} sur {total} affichées
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/* ----------------------------------------------------- Documents récents */

export interface DocumentRecent {
  id: string;
  nom: string;
  societe: string | null;
  fichier: string | null;
  creeLe: Date | string | null;
}

const JOUR_COURT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

/** L'extension, en majuscules : c'est ce qu'on cherche d'abord dans une liste de pièces. */
function extension(nom: string): string {
  const point = nom.lastIndexOf(".");
  return point > 0 ? nom.slice(point + 1).toUpperCase().slice(0, 4) : "DOC";
}

/**
 * Les quatre derniers documents.
 *
 * L'accueil n'en montrait aucun : on apprenait qu'un acte existait par la ligne
 * d'activité qui le disait, et il fallait ouvrir la bibliothèque pour le retrouver.
 * C'est pourtant ce qu'on vient chercher le lendemain d'un dépôt.
 */
export function DocumentsRecents({ documents }: { documents: DocumentRecent[] }) {
  if (documents.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="documents-recents">
      <div className={styles.sectionTete}>
        <h2 id="documents-recents" className={styles.sectionTitre}>
          Documents récents
        </h2>
        <Link href="/documents" className={styles.sectionLien}>
          Tous les documents
        </Link>
      </div>

      {/*
        Autant de colonnes que de documents, jamais plus de quatre.
        Des colonnes élastiques repliaient la quatrième carte sur une seconde ligne
        toute seule, dès que la largeur manquait de quelques pixels ; des colonnes
        fixes laissaient des emplacements vides quand il y en avait deux.
      */}
      <ul
        className={styles.pieces}
        style={{ gridTemplateColumns: "repeat(" + documents.length + ", minmax(0, 1fr))" }}
      >
        {documents.map((document) => (
          <li key={document.id} className={styles.piece}>
            <Link href="/documents" className={styles.pieceLien}>
              <span className={styles.pieceTete}>
                <span className={styles.pieceType}>{extension(document.nom)}</span>
                <span className={styles.pieceDate}>
                  {document.creeLe ? JOUR_COURT.format(new Date(document.creeLe)) : ""}
                </span>
              </span>
              <span className={styles.pieceNom} title={document.nom}>
                {document.nom}
              </span>
              <span className={styles.pieceSociete}>{document.societe ?? "Sans société"}</span>
            </Link>
          </li>
        ))}
      </ul>
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
 * n'a besoin tout de suite. En colonne serrée, huit lignes tiennent dans la place que
 * deux en prenaient : c'est un journal, pas un tableau de bord dans le tableau de bord.
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
          {activite.slice(0, 8).map((entree, rang) => {
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
