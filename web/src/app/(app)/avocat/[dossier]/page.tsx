import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { dossierPourAvocat } from "@/infrastructure/db/depots/avocat";
import { etatCabinet } from "@/domain/formalite/avocat";
import { libelleEtat } from "@/domain/formalite/transitions";
import { etatDocument } from "@/domain/document/statuts";
import { Notes } from "./Notes";
import { Verification } from "./Verification";
import { Avancement } from "./Avancement";
import { TYPE_KBIS, TYPE_RBE } from "@/infrastructure/db/depots/suivi";
import { Vide } from "@/components/liste/Vide";
import {
  estUneModification,
  recapitulatifDeModification,
} from "@/domain/modification/recapitulatif";
import styles from "../Avocat.module.css";

export const metadata: Metadata = {
  title: "Dossier - Espace avocat - Formalist",
  robots: { index: false, follow: false },
};

/** Les champs du brouillon, présentés avec le mot du métier. */
const CHAMPS: { cle: string; libelle: string }[] = [
  { cle: "denomination", libelle: "Dénomination" },
  { cle: "forme", libelle: "Forme juridique" },
  { cle: "activite", libelle: "Activité" },
  { cle: "adresse", libelle: "Adresse du siège" },
  { cle: "codePostal", libelle: "Code postal" },
  { cle: "ville", libelle: "Ville" },
  { cle: "capital", libelle: "Capital social" },
  { cle: "capitalLibere", libelle: "Capital libéré" },
];

const ONGLETS = ["recapitulatif", "avancement", "pieces", "notes", "journal"] as const;
type Onglet = (typeof ONGLETS)[number];

const NOMS: Record<Onglet, string> = {
  recapitulatif: "Récapitulatif",
  avancement: "Avancement",
  pieces: "Pièces",
  notes: "Notes internes",
  journal: "Journal",
};

/** La teinte du picto d'une entrée de journal, selon ce qu'elle raconte. */
function teinteJournal(action: string): string {
  if (action.includes("valide")) return "green";
  if (action.includes("refuse") || action.includes("rejet")) return "red";
  if (action.includes("document")) return "blue";
  if (action.includes("etat") || action.includes("avocat")) return "violet";
  return "gray";
}

function initiales(nom: string): string {
  return nom
    .split(" ")
    .map((mot) => mot[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function quand(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export default async function DossierAvocat({
  params,
  searchParams,
}: {
  params: Promise<{ dossier: string }>;
  searchParams: Promise<{ onglet?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  if (!utilisateur.roles.includes("avocat") && !utilisateur.roles.includes("admin")) notFound();

  const { dossier: identifiant } = await params;
  const vue = await dossierPourAvocat(utilisateur, Number(identifiant)).catch(() => null);
  if (!vue) notFound();

  const { dossier, client, documents, notes, historique, donnees, nonLus } = vue;

  const demande = (await searchParams).onglet;
  const onglet: Onglet = ONGLETS.includes(demande as Onglet)
    ? (demande as Onglet)
    : "recapitulatif";

  /*
   * Une modification ne se range pas comme une création.
   *
   * Elle porte la société, les changements décidés et leurs valeurs dans des
   * sous-objets, là où une création écrit ses champs à la racine. Chercher les uns
   * dans l'autre faisait annoncer « le client n'a encore rien renseigné » sur un
   * dossier réglé et complet - au moment précis où l'avocat l'ouvre pour le réviser.
   */
  const sectionsModification = estUneModification(donnees)
    ? recapitulatifDeModification(donnees)
    : null;

  const renseignes = CHAMPS.filter((c) => {
    const valeur = donnees[c.cle];
    return valeur !== undefined && valeur !== null && String(valeur).trim() !== "";
  });
  const manquants = CHAMPS.filter((c) => !renseignes.includes(c));

  const etat = etatCabinet({
    status: dossier.status,
    phase: dossier.phase ?? 1,
    sousPhase: dossier.business_sub_phase,
    creePar: dossier.created_by_avocat ? "avocat" : "client",
  });

  const aVerifier = documents.filter((d) => d.status === "uploaded").length;
  // Un document refusé ne compte pas comme remis : il attend son remplacement.
  const remis = (type: string) =>
    documents.some((d) => d.type === type && !d.rejection_reason);
  const adresse = (o: Onglet) => "/avocat/" + dossier.id + "?onglet=" + o;

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <div className={styles.topbarTitre}>
          <h1>{dossier.societe || "Sans nom"}</h1>
          <div className={styles.detailBadges}>
            <span className={styles.detailBadge}>{dossier.forme}</span>
            <span className={`${styles.detailBadge} ${styles.phase}`}>{etat.libelle}</span>
            <span className={`${styles.detailBadge} ${styles.muted}`}>
              {libelleEtat(dossier.status)}
            </span>
          </div>
        </div>
        <Link href="/avocat" className={styles.topbarBack}>
          ← Tous les dossiers
        </Link>
      </div>

      <div className={styles.content}>
        <nav className={styles.detailTabs} aria-label="Sections du dossier">
          {ONGLETS.map((o) => (
            <Link
              key={o}
              href={adresse(o)}
              className={o === onglet ? `${styles.detailTab} ${styles.active}` : styles.detailTab}
              aria-current={o === onglet ? "page" : undefined}
            >
              {NOMS[o]}
              {o === "notes" && notes.length > 0 && (
                <span className={styles.tabCount}>{notes.length}</span>
              )}
              {o === "pieces" && aVerifier > 0 && (
                <span className={styles.tabCount}>{aVerifier} à vérifier</span>
              )}
            </Link>
          ))}
        </nav>

        {onglet === "avancement" && (
          <Avancement
            dossierId={dossier.id}
            sousPhase={dossier.business_sub_phase}
            aLeKbis={remis(TYPE_KBIS)}
            aLeRbe={remis(TYPE_RBE)}
          />
        )}

        {onglet === "recapitulatif" && (
          <div className={styles.recapGrid}>
            <div className={styles.recapGridLeft}>
              <div className={styles.recapCard}>
                {sectionsModification ? (
                  sectionsModification.map((section) => (
                    <div key={section.titre} className={styles.recapSection}>
                      <h2 className={styles.recapTitle}>{section.titre}</h2>
                      {section.faits.map((fait, rang) => (
                        <div key={rang} className={styles.recapRow}>
                          <span className={styles.recapLabel}>{fait.libelle}</span>
                          <span className={styles.recapValue}>{fait.valeur}</span>
                        </div>
                      ))}
                    </div>
                  ))
                ) : (
                  <>
                    <div className={styles.recapSection}>
                      {/* Un titre de section reste un titre : la page d'origine le posait
                          en div, invisible à la navigation par titres. */}
                      <h2 className={styles.recapTitle}>Informations du dossier</h2>

                      {renseignes.map((c) => (
                        <div key={c.cle} className={styles.recapRow}>
                          <span className={styles.recapLabel}>{c.libelle}</span>
                          <span className={styles.recapValue}>{String(donnees[c.cle])}</span>
                        </div>
                      ))}

                      {renseignes.length === 0 && (
                        <Vide ton="encart" texte="Le client n'a encore rien renseigné." />
                      )}
                    </div>

                    {manquants.length > 0 && (
                      <div className={styles.recapSection}>
                        <h2 className={styles.recapTitle}>Pas encore renseigné par le client</h2>
                        {manquants.map((c) => (
                          <div key={c.cle} className={styles.recapRow}>
                            <span className={styles.recapLabel}>{c.libelle}</span>
                            <span className={styles.recapValue}>-</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className={styles.recapGridRight}>
              <div className={styles.recapSideCard}>
                <h3>Client</h3>
                <div className={styles.clientTete}>
                  <span className={styles.clientAvatar}>{initiales(client?.name ?? "?")}</span>
                  <span className={styles.clientIdentite}>
                    <span className={styles.clientNom}>{client?.name ?? "-"}</span>
                    <span className={styles.clientMail}>{client?.email ?? ""}</span>
                  </span>
                </div>
                <div className={styles.recapSideRow}>
                  <span className={styles.lbl}>Offre</span>
                  <span className={styles.val}>
                    {dossier.offer.charAt(0).toUpperCase() + dossier.offer.slice(1)}
                  </span>
                </div>
                <div className={styles.recapSideRow}>
                  <span className={styles.lbl}>Créé le</span>
                  <span className={styles.val}>{quand(dossier.created_at)}</span>
                </div>
                {!!dossier.created_by_avocat && (
                  <div className={styles.recapSideRow}>
                    <span className={styles.lbl}>Origine</span>
                    <span className={styles.val}>Cabinet</span>
                  </div>
                )}
              </div>

              <div className={styles.recapSideCard}>
                <h3>Aperçu</h3>
                <div className={styles.recapSideRow}>
                  <span className={styles.lbl}>Pièces déposées</span>
                  <span className={styles.val}>{documents.length}</span>
                </div>
                <div className={styles.recapSideRow}>
                  <span className={styles.lbl}>Pièces à vérifier</span>
                  <span className={styles.val}>{aVerifier}</span>
                </div>
                <div className={styles.recapSideRow}>
                  <span className={styles.lbl}>Notes internes</span>
                  <span className={styles.val}>{notes.length}</span>
                </div>
                <div className={styles.recapSideRow}>
                  <span className={styles.lbl}>Messages non lus</span>
                  <span className={styles.val}>{nonLus}</span>
                </div>
              </div>

              <div className={styles.recapSideCard}>
                <h3>Actions rapides</h3>
                <div className={styles.recapQuickActions}>
                  <Link href={adresse("pieces")}>Vérifier les pièces</Link>
                  <Link href={"/messagerie?dossier=" + dossier.id}>
                    Ouvrir la messagerie
                    {nonLus > 0 && <span className={styles.pastilleRouge}>{nonLus}</span>}
                  </Link>
                  <Link href={adresse("notes")}>Écrire une note interne</Link>
                  <Link href={adresse("journal")}>Voir le journal</Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {onglet === "pieces" &&
          (documents.length === 0 ? (
            <Vide ton="encart" texte="Aucune pièce déposée." />
          ) : (
            documents.map((d) => {
              const etatPiece = etatDocument({
                status: d.status,
                rejection_reason: d.rejection_reason,
              });

              return (
                <div
                  key={d.id}
                  className={
                    d.rejection_reason ? `${styles.docCard} ${styles.docRejected}` : styles.docCard
                  }
                >
                  <div className={styles.docIcon}>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>

                  <div className={styles.docInfo}>
                    <div className={styles.docName}>{d.name}</div>
                    <div className={styles.docMeta}>
                      <span>{etatPiece.libelle}</span>
                      {d.created_at && <span>· {quand(d.created_at)}</span>}
                    </div>
                    {etatPiece.motif && (
                      <div className={styles.docRejectionInfo}>Motif : {etatPiece.motif}</div>
                    )}
                  </div>

                  <div className={styles.docActions}>
                    {d.file_path && (
                      <a href={"/api/fichier?nom=" + encodeURIComponent(d.file_path)}>Ouvrir</a>
                    )}
                    {d.status === "uploaded" && <Verification documentId={d.id} />}
                  </div>
                </div>
              );
            })
          ))}

        {onglet === "notes" && (
          <>
            <div className={styles.notesIntro}>
              Visibles de votre équipe seulement. Le client ne les voit jamais.
            </div>
            <Notes
              dossierId={dossier.id}
              notes={notes.map((n) => ({
                id: n.id,
                contenu: n.content,
                auteur: n.users?.name ?? "Inconnu",
                date: n.created_at?.toISOString() ?? null,
              }))}
            />
          </>
        )}

        {onglet === "journal" &&
          (historique.length === 0 ? (
            <Vide ton="encart" texte="Aucune intervention enregistrée." />
          ) : (
            <div className={styles.auditTimeline}>
              {historique.map((h) => (
                <div key={h.id} className={styles.auditItem}>
                  <span className={`${styles.auditIcon} ${styles[teinteJournal(h.action)]}`}>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </span>

                  <div className={styles.auditBody}>
                    <div className={styles.auditLabel}>
                      <em>{h.users?.name ?? "Système"}</em> · {h.action}
                      {h.target_field ? " · " + h.target_field : ""}
                    </div>

                    {(h.before_value || h.after_value) && (
                      <div className={styles.auditDiff}>
                        {h.before_value && (
                          <span className={styles.auditBefore}>{h.before_value}</span>
                        )}
                        {h.before_value && h.after_value && <span>&nbsp;→&nbsp;</span>}
                        {h.after_value && (
                          <span className={styles.auditAfter}>{h.after_value}</span>
                        )}
                      </div>
                    )}

                    {h.comment && <div className={styles.auditComment}>{h.comment}</div>}
                    <div className={styles.auditDate}>{quand(h.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
      </div>
    </main>
  );
}
