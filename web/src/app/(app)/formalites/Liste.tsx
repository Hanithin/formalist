"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  FILTRES,
  comptesParFiltre,
  correspond,
  dateRelative,
  pageDe,
  paginer,
  parModificationRecente,
  retenu,
  statistiques,
  type DossierListe,
  type ValeurFiltre,
  adresseDuDossier,
  gesteDuDossier,
} from "@/domain/formalite/liste";
import { avancementDuDossier, libelleDossier, tonDossier } from "@/domain/formalite/etapes";
import styles from "./Formalites.module.css";

/**
 * La liste des formalités, telle que la rendait public/formalites.html.
 *
 * Le filtre vit dans l'adresse : il se partage et survit à un rechargement, ce que
 * la page d'origine ne permettait pas. La recherche et la page, elles, restent ici -
 * une recherche doit répondre à la frappe, et changer de mot remet à la première
 * page, comme dans l'original.
 */

interface Props {
  dossiers: DossierListe[];
  filtre: ValeurFiltre;
}

/** Les tons du domaine, dans les classes de la page d'origine. */
const CLASSES_ETAT: Record<string, string> = {
  termine: styles.statusDone,
  attente: styles.statusPending,
  avance: styles.statusProgress,
};

const TRAITS = {
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function Liste({ dossiers, filtre }: Props) {
  const [recherche, setRecherche] = useState("");
  const [page, setPage] = useState(1);

  const comptes = useMemo(() => comptesParFiltre(dossiers), [dossiers]);

  const visibles = useMemo(
    () =>
      parModificationRecente(dossiers.filter((d) => retenu(d, filtre) && correspond(d, recherche))),
    [dossiers, filtre, recherche]
  );

  const stats = useMemo(
    () => statistiques(dossiers, visibles, filtre, recherche),
    [dossiers, visibles, filtre, recherche]
  );

  const pagination = paginer(visibles.length, page);
  const affiches = pageDe(visibles, pagination.page);

  return (
    <>
      {/* ---------- Les trois compteurs ---------- */}
      <ul className={styles.stats}>
        <Compteur stat={stats.enCours} teinte={styles.statCardIconBleu}>
          <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="1.7" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </Compteur>

        <Compteur stat={stats.termines} teinte={styles.statCardIconVert}>
          <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="1.7" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </Compteur>

        <Compteur stat={stats.total} teinte={styles.statCardIconGris}>
          <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="1.7" aria-hidden="true">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </Compteur>
      </ul>

      {/* ---------- Filtres et recherche ---------- */}
      <div className={styles.filterBar}>
        <nav className={styles.filterGroup} aria-label="Filtrer les formalités">
          {FILTRES.map((f) => (
            <Link
              key={f.valeur}
              href={f.valeur === "tous" ? "/formalites" : "/formalites?filtre=" + f.valeur}
              className={f.valeur === filtre ? `${styles.pill} ${styles.pillActive}` : styles.pill}
              aria-current={f.valeur === filtre ? "page" : undefined}
              onClick={() => setPage(1)}
            >
              {f.libelle} <span className={styles.pillCount}>{comptes[f.valeur]}</span>
            </Link>
          ))}
        </nav>

        <span className={styles.filterSpacer} />

        <div className={styles.searchWrapper}>
          <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <label htmlFor="recherche" className={styles.invisible}>
            Rechercher une formalité
          </label>
          <input
            id="recherche"
            className={styles.searchInput}
            type="text"
            value={recherche}
            placeholder="Rechercher..."
            onChange={(e) => {
              setRecherche(e.target.value);
              // Chercher remet à la première page : rester en page 3 sur deux
              // résultats montrerait une liste vide.
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* ---------- Les dossiers ---------- */}
      {affiches.length === 0 ? (
        <Rien filtre={filtre} recherche={recherche} aucunDossier={dossiers.length === 0} />
      ) : (
        <>
          <ul className={styles.dossiersGrid} aria-label="Formalités">
            {affiches.map((d) => (
              <li key={d.id}>
                <Carte dossier={d} />
              </li>
            ))}
          </ul>

          {pagination.pages > 1 && (
            <div className={styles.pagination}>
              <p className={styles.pgCount}>
                {pagination.premier} à {pagination.dernier} sur {pagination.total}
              </p>

              <div className={styles.pgControls}>
                <button
                  type="button"
                  className={
                    pagination.page === 1
                      ? `${styles.pgArrow} ${styles.pgArrowInactif}`
                      : styles.pgArrow
                  }
                  aria-label="Page précédente"
                  disabled={pagination.page === 1}
                  onClick={() => setPage(pagination.page - 1)}
                >
                  <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2" aria-hidden="true">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>

                {pagination.fenetre.map((n, i) =>
                  n === null ? (
                    <span key={"coupure-" + i} className={styles.pgGap}>
                      …
                    </span>
                  ) : (
                    <button
                      key={n}
                      type="button"
                      className={
                        n === pagination.page
                          ? `${styles.pgNum} ${styles.pgNumActive}`
                          : styles.pgNum
                      }
                      aria-label={"Page " + n}
                      aria-current={n === pagination.page ? "page" : undefined}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  )
                )}

                <button
                  type="button"
                  className={
                    pagination.page === pagination.pages
                      ? `${styles.pgArrow} ${styles.pgArrowInactif}`
                      : styles.pgArrow
                  }
                  aria-label="Page suivante"
                  disabled={pagination.page === pagination.pages}
                  onClick={() => setPage(pagination.page + 1)}
                >
                  <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

/** Un compteur de tête. À zéro, il s'efface plutôt que d'afficher un zéro. */
function Compteur({
  stat,
  teinte,
  children,
}: {
  stat: { valeur: number | null; libelle: string; sousTitre: string };
  teinte: string;
  children: React.ReactNode;
}) {
  return (
    <li
      className={
        stat.valeur === null ? `${styles.statCard} ${styles.statCardVide}` : styles.statCard
      }
    >
      <span className={`${styles.statCardIcon} ${teinte}`} aria-hidden="true">
        {children}
      </span>
      <span className={styles.statLabel}>{stat.libelle}</span>
      <span className={styles.statValue}>{stat.valeur ?? "-"}</span>
      <span className={styles.statSub}>{stat.sousTitre}</span>
    </li>
  );
}

/**
 * Où mène un dossier.
 *
 * Il n'existe pas de page de détail : cliquer un dossier rouvre le parcours là où il
 * en est, comme le faisait la liste d'origine (« /creation.html?id= »). La destination
 * suit le type - une modification ne se reprend pas dans le parcours de création.
 */
function Carte({ dossier }: { dossier: DossierListe }) {
  // Le type décide du vocabulaire : une auto-entreprise n'a ni capital ni signature.
  const pourcentage = avancementDuDossier(dossier);
  const etat = libelleDossier({
    type: dossier.type,
    status: dossier.status,
    phase: dossier.phase,
    banque: dossier.banque,
  });
  const ton = tonDossier({ status: dossier.status, phase: dossier.phase });

  return (
    <Link href={adresseDuDossier(dossier)} className={styles.dossierCard}>
      <div className={styles.dossierCardHeader}>
        <span
          className={
            dossier.forme ? styles.typeBadge : `${styles.typeBadge} ${styles.typeBadgeDefaut}`
          }
        >
          {dossier.forme || dossier.type || "Formalité"}
        </span>
        <span className={`${styles.statusBadge} ${CLASSES_ETAT[ton] ?? ""}`}>{etat}</span>
      </div>

      <span className={styles.dossierTitle}>
        {dossier.societe || "Sans nom"}
        {dossier.nonLus > 0 && (
          <span
            className={styles.notifBadge}
            aria-label={
              dossier.nonLus + (dossier.nonLus > 1 ? " messages non lus" : " message non lu")
            }
          >
            {dossier.nonLus}
          </span>
        )}
      </span>

      <span className={styles.dossierMeta}>{dateRelative(dossier.modifieLe)}</span>

      <div className={styles.dossierProgress}>
        <div className={styles.dossierProgressBar}>
          <div className={styles.dossierProgressFill} style={{ width: pourcentage + "%" }} />
        </div>
      </div>

      <div className={styles.dossierFooter}>
        <span className={styles.dossierDate}>{pourcentage}% complété</span>
        <span className={styles.dossierAction}>
          {gesteDuDossier(dossier)}
          <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      </div>
    </Link>
  );
}

/**
 * Rien à montrer.
 *
 * Un compte sans aucune formalité n'a pas le même besoin qu'un filtre trop étroit :
 * le premier veut une porte d'entrée, le second veut savoir qu'il suffit d'élargir.
 */
function Rien({
  filtre,
  recherche,
  aucunDossier,
}: {
  filtre: ValeurFiltre;
  recherche: string;
  aucunDossier: boolean;
}) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyStateIcon} aria-hidden="true">
        <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      </div>

      {aucunDossier ? (
        <>
          <p className={styles.emptyStateTitle}>Aucune formalité</p>
          <p className={styles.emptyStateDesc}>
            Vos créations, modifications et fermetures de société se suivent ici, étape par étape.
          </p>
          <div className={styles.emptyStateActions}>
            <Link href="/creation?type=creation" className={`${styles.pill} ${styles.pillActive}`}>
              Créer une société
            </Link>
            <Link href="/auto-entrepreneur" className={styles.pill}>
              Créer une auto-entreprise
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className={styles.emptyStateTitle}>Aucune formalité trouvée</p>
          <p className={styles.emptyStateDesc}>
            Modifiez vos filtres ou lancez une nouvelle démarche
          </p>
          <div className={styles.emptyStateActions}>
            {(filtre !== "tous" || recherche) && (
              <Link href="/formalites" className={styles.pill}>
                Voir toutes les formalités
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
