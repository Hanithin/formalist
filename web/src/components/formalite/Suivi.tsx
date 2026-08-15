import Link from "next/link";
import { etapesDuSuivi, avancementDuSuivi, type EtatDuDossier } from "@/domain/formalite/suivi";
import styles from "./Suivi.module.css";

interface Props {
  etat: EtatDuDossier;
  /** Où mène le geste attendu, quand il y en a un. */
  lienAction?: string;
}

/**
 * Où en est le dossier, dit au client.
 *
 * Il ne savait rien : les notifications n'étaient lues nulle part, et l'écran ne
 * portait qu'un état technique - « en attente de validation » - qui ne dit ni qui
 * attend, ni ce qu'on attend de lui.
 *
 * La forme reprend le cycle de vie de la page d'origine : une suite d'étapes, celle
 * du moment mise en avant avec son explication, et le geste attendu quand il est du
 * côté du client.
 */
export function Suivi({ etat, lienAction }: Props) {
  const etapes = etapesDuSuivi(etat);
  const courante = etapes.find((e) => e.etat === "en_cours");
  const avancement = avancementDuSuivi(etat);

  return (
    <section className={styles.bloc} aria-label="Avancement du dossier">
      <div className={styles.tete}>
        <h2 className={styles.titre}>Où en est votre dossier</h2>
        <span className={styles.part}>{avancement}%</span>
      </div>

      <div className={styles.jauge} aria-hidden="true">
        <span className={styles.remplie} style={{ width: avancement + "%" }} />
      </div>

      {/* L'étape du moment, détachée : c'est la seule qu'on vient lire. */}
      {courante && (
        <div className={courante.main === "vous" ? `${styles.focus} ${styles.aVous}` : styles.focus}>
          <span className={styles.main}>
            {courante.main === "vous" ? "À vous de jouer" : "L'avocat s'en occupe"}
          </span>
          <p className={styles.focusTitre}>{courante.titre}</p>
          <p className={styles.focusTexte}>{courante.explication}</p>

          {courante.action && lienAction && (
            <Link href={lienAction} className={styles.action}>
              {courante.action}
            </Link>
          )}
        </div>
      )}

      <ol className={styles.etapes}>
        {etapes.map((etape) => (
          <li key={etape.identifiant} className={`${styles.etape} ${styles[etape.etat]}`}>
            <span className={styles.puce} aria-hidden="true">
              {etape.etat === "faite" ? <Coche /> : null}
            </span>
            <span className={styles.nom}>{etape.titre}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Coche() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
