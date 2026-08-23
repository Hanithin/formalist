import Link from "next/link";
import { etatDocument } from "@/domain/document/statuts";
import { Vide } from "@/components/liste/Vide";
import styles from "./TableauDeBord.module.css";

/**
 * Les blocs de l'accueil quand un seul dossier est ouvert.
 *
 * Portage de renderJourney, renderSideBySide et renderHelp de
 * public/dashboard.html : la frise des phases, les documents et l'activité côte à
 * côte, puis l'interlocuteur. La version Next s'était arrêtée au bandeau de tête -
 * l'écran d'un client à un seul dossier n'avait plus rien en dessous.
 *
 * Les todos passent par le même bloc que l'état à plusieurs dossiers : c'était
 * déjà la même carte dans la page d'origine.
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

/* ---------- Le dossier unique, en tête ---------- */

/** Rayon et circonférence de l'anneau, comme dans la page d'origine. */
const RAYON = 56;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

/**
 * Le dossier, quand c'est le seul.
 *
 * À un dossier, la page le disait trois fois : la ligne de chiffres (« 1 action
 * requise · 1 formalité en cours »), le bandeau de reprise, puis la table des
 * formalités en cours et son unique ligne. Trois présentations du même objet, dont
 * deux faites pour en comparer plusieurs.
 *
 * Il n'y a plus qu'un objet, repris de `renderSingleState()` de la page d'origine :
 * l'anneau d'avancement, ce que c'est, à qui c'est, et ce qui vient ensuite. Un
 * anneau plutôt qu'une barre parce qu'il porte son chiffre au centre - la barre
 * demandait un pourcentage posé à côté d'elle, et un bouton posé encore à côté.
 */
export function DossierUnique({
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
  const termine = pourcentage >= 100;

  return (
    <section className={styles.heros} aria-labelledby="dossier-unique">
      <div className={styles.herosAnneau}>
        <svg viewBox="0 0 132 132" aria-hidden="true">
          <circle className={styles.anneauFond} cx="66" cy="66" r={RAYON} />
          <circle
            className={styles.anneauTrait}
            cx="66"
            cy="66"
            r={RAYON}
            strokeDasharray={CIRCONFERENCE}
            strokeDashoffset={CIRCONFERENCE - (pourcentage / 100) * CIRCONFERENCE}
          />
        </svg>
        <div className={styles.anneauCentre}>
          <span className={styles.anneauValeur}>
            {termine ? <Coche epaisseur="2.4" /> : pourcentage + " %"}
          </span>
          <span className={styles.anneauLegende}>{termine ? "Terminé" : "Avancement"}</span>
        </div>
      </div>

      <div className={styles.herosCorps}>
        <span className={styles.herosEtiquette}>{type}</span>
        <h2 id="dossier-unique" className={styles.herosTitre}>
          {societe}
        </h2>
        <p className={styles.herosSuite}>{prochaineEtape}</p>
        <Link href={lien} className={styles.herosBouton}>
          {bouton}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>
      </div>
    </section>
  );
}

/* ---------- La frise des phases ---------- */

interface FriseProps {
  etapes: string[];
  etape: number;
  nomEtape: string;
}

export function Frise({ etapes, etape, nomEtape }: FriseProps) {
  return (
    <section className={styles.dashCard} aria-labelledby="votre-parcours">
      <div className={styles.dashCardHead}>
        <div>
          <h2 id="votre-parcours" className={styles.dashCardTitle}>
            Votre parcours
          </h2>
          <div className={styles.dashCardSub}>
            Étape {etape} sur {etapes.length} · {nomEtape}
          </div>
        </div>
      </div>

      <ol className={styles.journey}>
        {etapes.map((nom, i) => {
          const rang = i + 1;
          // « À venir » est l'état par défaut de la frise : il n'a pas de classe.
          const ton = rang < etape ? styles.jnDone : rang === etape ? styles.jnCurrent : "";

          return (
            <li key={nom} className={`${styles.jnStep} ${ton}`}>
              <span className={styles.jnMark}>{rang < etape ? <Coche /> : rang}</span>
              <span className={styles.jnLabel}>{nom}</span>
            </li>
          );
        })}
      </ol>
    </section>
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

/* ---------- L'interlocuteur ---------- */

/** « Me Claire Fontaine » donne CF : le titre ne fait pas partie des initiales. */
function initialesAvocat(nom: string): string {
  return nom
    .replace(/^(Me\.?|Maître)\s*/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]?.toUpperCase() ?? "")
    .join("");
}

export function Interlocuteur({ avocat }: { avocat: string | null }) {
  return (
    <section className={`${styles.dashCard} ${styles.helpCard}`}>
      <div className={styles.helpWho}>
        {avocat ? (
          <>
            <span className={styles.helpAvatar} aria-hidden="true">
              {initialesAvocat(avocat)}
            </span>
            <div>
              <div className={styles.helpName}>{avocat}</div>
              <div className={styles.helpRole}>Avocat en charge de votre dossier</div>
            </div>
          </>
        ) : (
          <>
            {/* Les initiales de la maison, tant qu'aucun avocat n'est nommé. */}
            <span className={`${styles.helpAvatar} ${styles.helpPending}`} aria-hidden="true">
              FL
            </span>
            <div>
              <div className={styles.helpName}>Un avocat vous sera assigné</div>
              <div className={styles.helpRole}>Dès que votre dossier entre en révision</div>
            </div>
          </>
        )}
      </div>

      <div className={styles.helpActions}>
        <Link
          href={avocat ? "/messagerie" : "/support"}
          className={`${styles.helpBtn} ${styles.helpPrimary}`}
        >
          {avocat ? "Écrire à votre avocat" : "Poser une question"}
        </Link>
        <Link href="/consultations" className={styles.helpBtn}>
          Prendre une consultation
        </Link>
        <Link href="/aide" className={styles.helpBtn}>
          Questions fréquentes
        </Link>
      </div>
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

/* ---------- Les autres dossiers ---------- */

export interface AutreDossier {
  id: number;
  nom: string;
  precision: string;
  lien: string;
  termine: boolean;
}

export function AutresDossiers({ dossiers }: { dossiers: AutreDossier[] }) {
  return (
    <section className={styles.roadmap} aria-labelledby="autres-dossiers">
      <h2 id="autres-dossiers" className={styles.roadmapTitle}>
        Vos autres dossiers
      </h2>
      <div className={styles.roadmapSubtitle}>
        {dossiers.length} élément{dossiers.length > 1 ? "s" : ""} en plus de votre société
      </div>

      <div className={styles.roadmapSteps}>
        {dossiers.slice(0, 5).map((d) => (
          <Link
            key={d.id}
            href={d.lien}
            className={d.termine ? `${styles.roadmapStep} ${styles.done}` : styles.roadmapStep}
          >
            <span className={styles.roadmapStepCheck} aria-hidden="true">
              <Coche />
            </span>
            <span className={styles.roadmapStepBody}>
              <span className={styles.roadmapStepTitle}>{d.nom}</span>
              <span className={styles.roadmapStepDesc}>{d.precision}</span>
            </span>
            <span className={styles.roadmapStepCta}>Ouvrir</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
