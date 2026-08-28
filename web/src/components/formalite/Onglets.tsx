import Link from "next/link";
import styles from "./Dossier.module.css";

/**
 * Les trois faces d'un dossier, du côté du client.
 *
 * Tout tenait sur une page, et ce qui n'y tenait pas partait ailleurs : les documents
 * dans la bibliothèque commune, où il fallait retrouver son dossier parmi ceux des
 * autres sociétés ; les messages dans la messagerie, où il fallait retrouver le bon
 * fil. Ce qui concerne un dossier se lit dans son dossier.
 */
export const ONGLETS_DOSSIER = ["suivi", "documents", "communication"] as const;

export type OngletDossier = (typeof ONGLETS_DOSSIER)[number];

const NOMS: Record<OngletDossier, string> = {
  suivi: "Suivi du dossier",
  documents: "Documents",
  communication: "Communication",
};

/** L'onglet demandé dans l'adresse, ou le suivi : c'est ce qu'on vient lire. */
export function ongletDemande(valeur: string | undefined): OngletDossier {
  return ONGLETS_DOSSIER.includes(valeur as OngletDossier)
    ? (valeur as OngletDossier)
    : "suivi";
}

export function Onglets({
  base,
  actif,
  comptes,
}: {
  /** L'adresse de la page, sans l'onglet : « /depot-des-comptes?dossier=12 ». */
  base: string;
  actif: OngletDossier;
  /** Ce qu'il y a derrière chaque onglet, quand il y a de quoi le dire. */
  comptes?: Partial<Record<OngletDossier, number>>;
}) {
  const adresse = (onglet: OngletDossier) =>
    base + (base.includes("?") ? "&" : "?") + "onglet=" + onglet;

  return (
    <nav aria-label="Sections du dossier">
      <ul className={styles.onglets}>
        {ONGLETS_DOSSIER.map((onglet) => {
          const compte = comptes?.[onglet] ?? 0;

          return (
            <li key={onglet}>
              <Link
                href={adresse(onglet)}
                className={
                  onglet === actif ? `${styles.onglet} ${styles.ongletActif}` : styles.onglet
                }
                aria-current={onglet === actif ? "page" : undefined}
              >
                {NOMS[onglet]}
                {compte > 0 && <span className={styles.ongletCompte}>{compte}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
