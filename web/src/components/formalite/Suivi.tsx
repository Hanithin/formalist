import Link from "next/link";
import {
  etapesDuSuivi,
  etapeAMettreEnAvant,
  avancementDuSuivi,
  type EtatDuDossier,
} from "@/domain/formalite/suivi";
import styles from "./Suivi.module.css";

interface Props {
  etat: EtatDuDossier;
  /**
   * Où mène le geste attendu.
   *
   * Deux destinations, car les gestes ne sont pas de même nature : « Déposer
   * l'attestation » se fait dans le dossier, « Voir ce qui est demandé » dans le fil.
   * Un lien unique envoyait le premier vers une conversation où il n'y a rien à
   * déposer.
   */
  lienAction?: string;
  lienMessagerie?: string;
  /**
   * Ce que l'avocat demande de reprendre, mot pour mot.
   *
   * « À vous de jouer » sans dire de quoi il s'agit renvoie à une devinette : le motif
   * existait au journal d'audit, que le client ne voit pas, et l'écran se contentait
   * d'un bouton qui menait au formulaire sans un mot d'explication.
   */
  demande?: string | null;
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
export function Suivi({ etat, lienAction, lienMessagerie, demande }: Props) {
  const etapes = etapesDuSuivi(etat);
  const courante = etapeAMettreEnAvant(etat);
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

          {/*
            La demande ne s'affiche que si elle est en cours.
            Elle se montrait dès que la main était au client : un dossier renvoyé en
            mars, corrigé depuis, affichait encore ce motif sous « Attestation de
            dépôt de capital ».
          */}
          {etat.status === "corrections_demandees" && demande && (
            <blockquote className={styles.demande}>
              <span className={styles.demandeQui}>Ce que l&apos;avocat demande</span>
              <span className={styles.demandeTexte}>{demande}</span>
            </blockquote>
          )}

          {courante.action &&
            (courante.ou === "messagerie" ? lienMessagerie : lienAction) && (
              <Link
                href={(courante.ou === "messagerie" ? lienMessagerie : lienAction) as string}
                className={styles.action}
              >
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
