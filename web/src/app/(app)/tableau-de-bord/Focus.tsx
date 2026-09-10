import Link from "next/link";
import { etatDocument } from "@/domain/document/statuts";
import { Vide } from "@/components/liste/Vide";
import styles from "./TableauDeBord.module.css";

/**
 * Ce que porte le dossier, à droite de l'encadré de tête.
 *
 * Ce fichier tenait la disposition d'un compte à un seul dossier : un bandeau, une
 * frise, l'interlocuteur, les autres dossiers. La refonte de l'accueil met le dossier
 * en tête dans son propre encadré, avec sa frise et son avocat ; il n'en reste que ce
 * qui n'a pas d'autre endroit - les documents du dossier, et la feuille de route d'une
 * société qu'on vient d'immatriculer.
 *
 * Le reste a été retiré plutôt que laissé en réserve : du code mort qui a l'air vivant
 * se remet en service par inadvertance.
 */

function Coche({ epaisseur = "3" }: { epaisseur?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={epaisseur}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ---------- Les documents du dossier ---------- */

export interface DocumentDuDossier {
  id: number;
  nom: string;
  statut: string | null;
  motifRejet: string | null;
  fichier: string | null;
}

export interface EtapeApres {
  titre: string;
  explication: string;
}

/**
 * Ce qui se passera une fois la saisie finie.
 *
 * Un dossier qu'on remplit ne dit rien de ce qui l'attend : on voit sept étapes de
 * formulaire, on ne sait pas ce qu'on déclenche en les finissant. Le chemin vient du
 * suivi - le même que le client lira ensuite dans son dossier, propre à chaque nature
 * de formalité - lu à l'envers du temps.
 *
 * Numéroté, parce que c'en est une : ces étapes se suivent dans cet ordre, et chacune
 * attend la précédente.
 */
export function ApresLEnvoi({ etapes }: { etapes: EtapeApres[] }) {
  return (
    <section className={styles.dashCard} aria-labelledby="et-apres">
      <div className={styles.dashCardHead}>
        <div>
          <h2 id="et-apres" className={styles.dashCardTitle}>
            Et après ?
          </h2>
          <div className={styles.dashCardSub}>Une fois votre saisie terminée</div>
        </div>
      </div>

      <ol className={styles.apresListe}>
        {etapes.map((etape, rang) => (
          <li key={etape.titre} className={styles.apresEtape}>
            <span className={styles.apresRang} aria-hidden="true">
              {rang + 1}
            </span>
            <span className={styles.apresCorps}>
              <span className={styles.apresTitre}>{etape.titre}</span>
              <span className={styles.apresExplication}>{etape.explication}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function DocumentsDuDossier({ documents }: { documents: DocumentDuDossier[] }) {
  return (
    <section className={styles.dashCard} aria-labelledby="vos-documents">
      <div className={styles.dashCardHead}>
        <div>
          <h2 id="vos-documents" className={styles.dashCardTitle}>
            Vos documents
          </h2>
          <div className={styles.dashCardSub}>Générés et téléversés pour ce dossier</div>
        </div>
        <Link href="/documents" className={styles.dashCardLink}>
          Tout voir
        </Link>
      </div>

      {documents.length === 0 ? (
        <Vide
          ton="encart"
          texte="Aucun document pour l'instant. Les actes apparaîtront ici au fil des étapes."
        />
      ) : (
        <div className={styles.docList}>
          {documents.map((d) => {
            const etat = etatDocument({ status: d.statut, rejection_reason: d.motifRejet });
            // Les trois teintes de la page d'origine : neutre, verte quand la
            // pièce est acceptée, rouge quand elle est refusée. Un refus se lit
            // sur le motif, qui prime sur le statut.
            const ton = d.motifRejet
              ? styles.docRejected
              : etat.ton === "abouti"
                ? styles.docOk
                : "";

            const dedans = (
              <>
                <span className={styles.docIco} aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </span>
                <span className={styles.docName}>{d.nom}</span>
                <span className={`${styles.docState} ${ton}`}>{etat.libelle}</span>
              </>
            );

            if (!d.fichier) {
              return (
                <div key={d.id} className={styles.docRow}>
                  {dedans}
                </div>
              );
            }

            return (
              <a
                key={d.id}
                href={"/api/fichier?nom=" + encodeURIComponent(d.fichier)}
                className={styles.docRow}
              >
                {dedans}
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ---------- La feuille de route, une fois la société immatriculée ---------- */

interface Etape {
  titre: string;
  description: string;
  geste: string;
  lien?: string;
}

const APRES: Etape[] = [
  {
    titre: "Ouvrir un compte pro",
    description: "Nécessaire pour séparer vos finances",
    geste: "Démarrer",
  },
  {
    titre: "Rédiger un pacte d'associés",
    description: "Recommandé pour sécuriser la répartition",
    geste: "Démarrer",
    lien: "/contrats",
  },
  {
    titre: "Prévoir votre 1er dépôt de comptes",
    description: "À anticiper dans 9 mois",
    geste: "Plus tard",
  },
];

export function FeuilleDeRoute() {
  return (
    <section className={styles.roadmap} aria-labelledby="et-maintenant">
      <h2 id="et-maintenant" className={styles.roadmapTitle}>
        Et maintenant ?
      </h2>
      <div className={styles.roadmapSubtitle}>
        Les prochaines étapes pour démarrer votre activité
      </div>

      <div className={styles.roadmapSteps}>
        {APRES.map((e) => {
          const corps = (
            <>
              <span className={styles.roadmapStepCheck} aria-hidden="true">
                <Coche />
              </span>
              <span className={styles.roadmapStepBody}>
                <span className={styles.roadmapStepTitle}>{e.titre}</span>
                <span className={styles.roadmapStepDesc}>{e.description}</span>
              </span>
              <span className={styles.roadmapStepCta}>{e.geste}</span>
            </>
          );

          // La page d'origine renvoyait « Ouvrir un compte pro » vers un
          // partenaire bancaire et programmait un rappel qui n'existait pas côté
          // serveur. Sans destination réelle, l'étape s'affiche sans lien plutôt
          // que de promettre un geste qui ne se passe pas.
          if (!e.lien) {
            return (
              <div key={e.titre} className={styles.roadmapStep}>
                {corps}
              </div>
            );
          }

          return (
            <Link key={e.titre} href={e.lien} className={styles.roadmapStep}>
              {corps}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
