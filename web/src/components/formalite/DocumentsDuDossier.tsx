import { formaterDate } from "@/lib/dates";
import styles from "./Dossier.module.css";

export interface DocumentDuDossier {
  id: string;
  nom: string;
  /** Nul tant que l'acte est chez l'avocat : il n'y a rien avec quoi l'ouvrir. */
  fichier: string | null;
  creeLe: string | null;
}

/**
 * Les documents d'un dossier, dans le dossier.
 *
 * Ils vivaient dans la bibliothèque commune, rangés par société : y retrouver les
 * trois actes d'un dépôt supposait de traverser tout ce qu'on avait déjà déposé
 * ailleurs. Ceux-ci sont ceux de ce dossier, et rien d'autre.
 *
 * Un acte encore en relecture figure dans la liste sans son fichier : le cacher
 * donnerait un écran vide juste après le règlement, et l'ouvrir remettrait au client
 * un acte que l'avocat n'a pas encore relu.
 */
export function DocumentsDuDossier({ documents }: { documents: DocumentDuDossier[] }) {
  if (documents.length === 0) {
    return (
      <section className={styles.documents} aria-label="Documents du dossier">
        <p className={styles.vide}>
          Aucun document pour l&apos;instant. Vos actes apparaîtront ici dès que
          l&apos;avocat les aura relus.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.documents} aria-label="Documents du dossier">
      <ul className={styles.documentsListe}>
        {documents.map((document) => {
          const quand = document.creeLe ? formaterDate(new Date(document.creeLe)) : null;

          const corps = (
            <>
              <span className={styles.documentIcone} aria-hidden="true">
                <Feuille />
              </span>

              <span className={styles.documentCorps}>
                <span className={styles.documentNom}>{document.nom}</span>
                {quand && <span className={styles.documentQuand}>Établi le {quand}</span>}
              </span>

              {document.fichier ? (
                <span className={styles.documentTelecharger} aria-hidden="true">
                  <Fleche />
                </span>
              ) : (
                <span className={styles.documentAttente}>Chez l&apos;avocat</span>
              )}
            </>
          );

          return (
            <li key={document.id}>
              {document.fichier ? (
                <a
                  className={styles.document}
                  href={
                    "/api/fichier?nom=" +
                    encodeURIComponent(document.fichier) +
                    "&titre=" +
                    encodeURIComponent(document.nom)
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  {corps}
                </a>
              ) : (
                <div className={styles.document}>{corps}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Feuille() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function Fleche() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 4v12" />
      <polyline points="7 11 12 16 17 11" />
      <path d="M5 20h14" />
    </svg>
  );
}
