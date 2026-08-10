import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { dossiersDuCabinet } from "@/infrastructure/db/depots/avocat";
import { comptes, dateCourte, depuis, estFiltre, etatCabinet, FILTRES, retenir } from "@/domain/formalite/avocat";
import { SousNavigation } from "./SousNavigation";
import styles from "./Avocat.module.css";

export const metadata: Metadata = {
  title: "Espace avocat - Formalist",
  robots: { index: false, follow: false },
};

/** « 1 490 € » : les centimes n'apparaissent pas dans un tableau de suivi. */
function montant(centimes: number): string {
  return Math.round(centimes / 100).toLocaleString("fr-FR") + " €";
}

function majuscule(mot: string): string {
  return mot.charAt(0).toUpperCase() + mot.slice(1);
}

/** Le type est enregistré sans accent : il s'écrit correctement à l'affichage. */
const TYPES: Record<string, string> = {
  creation: "Création",
  modification: "Modification",
  fermeture: "Fermeture",
  depot: "Dépôt des comptes",
};

export default async function EspaceAvocat({
  searchParams,
}: {
  searchParams: Promise<{ filtre?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();

  // Un client n'a rien à faire ici. On rend un 404 plutôt qu'un refus explicite,
  // comme pour les dossiers et les fichiers : la réponse ne doit pas renseigner
  // sur ce qui existe.
  if (!utilisateur.roles.includes("avocat") && !utilisateur.roles.includes("admin")) notFound();

  const dossiers = await dossiersDuCabinet(utilisateur);
  const filtre = estFiltre((await searchParams).filtre);
  const retenus = retenir(dossiers, filtre);
  const nombres = comptes(dossiers);

  const nonLus = dossiers.reduce((n, d) => n + d.nonLus, 0);

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <h1>Espace avocat</h1>
        <span className={styles.spaceBadge}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Cabinet
        </span>
      </div>

      <SousNavigation actif="dossiers" aVerifier={nombres.verifier} />

      <div className={styles.content}>
        {dossiers.length === 0 ? (
          <div className={styles.emptyStateHero}>
            <div className={styles.emptyIcon}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              </svg>
            </div>
            <h3>Aucun dossier pour le moment</h3>
            <p>
              Vos dossiers clients apparaîtront ici dès qu&apos;ils vous seront assignés, ou créez
              directement une formalité.
            </p>
            <div className={styles.emptyActions}>
              <Link href="/creation?type=creation" className={styles.btnPrimary}>
                Créer une formalité
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.counters}>
              <div className={styles.counterCard}>
                <div className={styles.counterLabel}>
                  <span className={`${styles.counterDot} ${styles.orange}`} /> À vérifier
                </div>
                <div className={styles.counterValue}>{nombres.verifier}</div>
              </div>
              <div className={styles.counterCard}>
                <div className={styles.counterLabel}>
                  <span className={`${styles.counterDot} ${styles.blue}`} /> En cours
                </div>
                <div className={styles.counterValue}>{nombres.encours}</div>
              </div>
              <div className={styles.counterCard}>
                <div className={styles.counterLabel}>
                  <span className={`${styles.counterDot} ${styles.green}`} /> Terminées
                </div>
                <div className={styles.counterValue}>{nombres.termines}</div>
              </div>
              <div className={styles.counterCard}>
                <div className={styles.counterLabel}>
                  <span className={`${styles.counterDot} ${styles.red}`} /> Messages non lus
                </div>
                <div className={styles.counterValue}>{nonLus}</div>
              </div>
            </div>

            <nav className={styles.filterTabs} aria-label="Filtrer les dossiers">
              {FILTRES.map((f) => (
                <Link
                  key={f.cle}
                  href={f.cle === "tous" ? "/avocat" : "/avocat?filtre=" + f.cle}
                  className={
                    f.cle === filtre ? `${styles.filterTab} ${styles.active}` : styles.filterTab
                  }
                  aria-current={f.cle === filtre ? "page" : undefined}
                >
                  {f.libelle}
                  <span className={styles.filterCount}>{nombres[f.cle]}</span>
                </Link>
              ))}
            </nav>

            {retenus.length === 0 ? (
              <div className={styles.emptyStateHero}>
                <div className={styles.emptyIcon}>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
                <h3>Aucun résultat</h3>
                <p>Aucun dossier ne correspond à ce filtre.</p>
                <div className={styles.emptyActions}>
                  <Link href="/avocat" className={styles.btnSecondary}>
                    Voir tous les dossiers
                  </Link>
                </div>
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.dossiersTable}>
                  <thead>
                    <tr>
                      <th>Réf.</th>
                      <th>Société</th>
                      <th>Type</th>
                      <th>Offre</th>
                      <th>Phase</th>
                      <th>Client</th>
                      <th>Créée</th>
                      <th>Modifiée</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {retenus.map((d) => {
                      const etat = etatCabinet(d);
                      const type =
                        (TYPES[d.type] ?? majuscule(d.type)) +
                        (d.sousType ? " (" + d.sousType.replace(/_/g, " ") + ")" : "");

                      return (
                        <tr key={d.id}>
                          <td className={styles.ref}>{d.reference}</td>
                          <td>
                            {/* Le lien porte le nom : une ligne entière cliquable
                                ne s'atteint pas au clavier. */}
                            <Link href={"/avocat/" + d.id}>
                              <strong>{d.societe}</strong>
                            </Link>
                            {d.nonLus > 0 && (
                              <>
                                {" "}
                                <span className={`${styles.badge} ${styles.unread}`}>{d.nonLus}</span>
                              </>
                            )}
                            {d.monDossier && (
                              <>
                                {" "}
                                <span className={`${styles.badge} ${styles.purple}`}>
                                  Assigné à vous
                                </span>
                              </>
                            )}
                            {d.creePar === "avocat" && (
                              <>
                                {" "}
                                <span className={`${styles.badge} ${styles.avocatCreated}`}>
                                  Avocat
                                </span>
                              </>
                            )}
                            <br />
                            <span className={styles.sousTitre}>
                              {d.forme}
                              {d.capital
                                ? " au capital de " + Number(d.capital).toLocaleString("fr-FR") + " €"
                                : ""}
                            </span>
                          </td>
                          <td>{type}</td>
                          <td>
                            <span className={`${styles.badge} ${styles[d.offre ?? "starter"] ?? ""}`}>
                              {majuscule(d.offre ?? "starter")}
                            </span>
                            {d.payeCentimes > 0 && (
                              <div className={styles.paye}>{montant(d.payeCentimes)} payés</div>
                            )}
                          </td>
                          <td>
                            <span className={`${styles.badge} ${styles[etat.teinte]}`}>
                              {etat.libelle}
                            </span>
                          </td>
                          <td>{d.client}</td>
                          <td className={styles.quand}>{dateCourte(d.creeLe)}</td>
                          <td className={styles.quand}>{depuis(d.majLe)}</td>
                          <td style={{ textAlign: "right" }}>
                            <svg
                              className={styles.chevron}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              aria-hidden="true"
                            >
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
