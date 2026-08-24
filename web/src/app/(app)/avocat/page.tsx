import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { dossiersDuCabinet } from "@/infrastructure/db/depots/avocat";
import {
  comptes,
  estFiltre,
  estTri,
  correspond,
  trier,
  dansLaPeriode,
  periodeIncoherente,
  paginer,
  FILTRES,
  retenir,
} from "@/domain/formalite/avocat";
import { SousNavigation } from "./SousNavigation";
import { Recherche } from "./Recherche";
import { Tableau } from "./Tableau";
import { Pagination } from "./Pagination";
import { Vide } from "@/components/liste/Vide";
import styles from "./Avocat.module.css";

export const metadata: Metadata = {
  title: "Espace avocat - Formalist",
  robots: { index: false, follow: false },
};

/**
 * Un compteur du cabinet.
 *
 * Zéro s'écrit « - », en gris : le chiffre zéro se lit comme une valeur qu'on vient
 * chercher, alors qu'il ne dit qu'une absence, et quatre zéros noirs en gros
 * caractères se lisaient comme une alerte.
 *
 * Le tiret est lu « aucun » par les lecteurs d'écran, qui l'annonceraient sinon comme
 * un signe de ponctuation.
 */
function Compteur({
  teinte,
  libelle,
  valeur,
}: {
  teinte: "orange" | "blue" | "green" | "red";
  libelle: string;
  valeur: number;
}) {
  const vide = valeur === 0;

  return (
    <div className={vide ? `${styles.counterCard} ${styles.counterVide}` : styles.counterCard}>
      <div className={styles.counterLabel}>
        <span className={`${styles.counterDot} ${styles[teinte]}`} /> {libelle}
      </div>
      <div className={styles.counterValue}>{vide ? <span aria-label="aucun">-</span> : valeur}</div>
    </div>
  );
}

export default async function EspaceAvocat({
  searchParams,
}: {
  searchParams: Promise<{
    filtre?: string;
    q?: string;
    tri?: string;
    du?: string;
    au?: string;
    page?: string;
  }>;
}) {
  const utilisateur = await exigerUtilisateur();

  // Un client n'a rien à faire ici. On rend un 404 plutôt qu'un refus explicite,
  // comme pour les dossiers et les fichiers : la réponse ne doit pas renseigner
  // sur ce qui existe.
  if (!utilisateur.roles.includes("avocat") && !utilisateur.roles.includes("admin")) notFound();

  const dossiers = await dossiersDuCabinet(utilisateur);
  const criteres = await searchParams;
  const filtre = estFiltre(criteres.filtre);
  const nombres = comptes(dossiers);

  /*
   * Les critères s'appliquent dans cet ordre : filtre, recherche, période, tri, page.
   *
   * Les compteurs des onglets, eux, portent sur la liste entière : ils disent ce qui
   * existe, non ce que la recherche en cours laisse voir.
   */
  const terme = criteres.q ?? "";
  const periode = { du: criteres.du, au: criteres.au };
  const tri = estTri(criteres.tri);
  const incoherente = periodeIncoherente(periode);

  const retenus = trier(
    retenir(dossiers, filtre).filter(
      (d) => correspond(d, terme) && (incoherente || dansLaPeriode(d, periode))
    ),
    tri
  );

  const tranche = paginer(retenus, Number(criteres.page) || 1);

  const nonLus = dossiers.reduce((n, d) => n + d.nonLus, 0);

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <h1>Espace avocat</h1>
        {/*
          Ce que la pastille doit dire, c'est que le client ne voit rien d'ici.
          
          « Cabinet » sous un bouclier ne le disait pas : on y lisait un nom d'espace,
          quand la question que se pose l'avocat devant un écran de travail est de
          savoir ce qui, de ce qu'il écrit, remonte au client.
        */}
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
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
          Espace interne au cabinet, invisible du client
        </span>
      </div>

      <p className={styles.introduction}>
        Les dossiers confiés au cabinet, du premier envoi jusqu&apos;au Kbis.
      </p>

      <SousNavigation actif="dossiers" aVerifier={nombres.verifier} />

      <div className={styles.content}>
        {dossiers.length === 0 ? (
          <Vide
            icone="/avocat"
            titre="Aucun dossier pour le moment"
            texte="Vos dossiers clients apparaîtront ici dès qu'ils vous seront assignés. Vous pouvez aussi créer directement une formalité."
            action={{ libelle: "Créer une formalité", lien: "/creation?type=creation" }}
          />
        ) : (
          <>
            <div className={styles.counters}>
              <Compteur teinte="orange" libelle="À vérifier" valeur={nombres.verifier} />
              <Compteur teinte="blue" libelle="En cours" valeur={nombres.encours} />
              <Compteur teinte="green" libelle="Terminées" valeur={nombres.termines} />
              <Compteur teinte="red" libelle="Messages non lus" valeur={nonLus} />
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
                  {/* Un « 0 » à côté d'un filtre invite à cliquer sur du vide. */}
                  {nombres[f.cle] > 0 && (
                    <span className={styles.filterCount}>{nombres[f.cle]}</span>
                  )}
                </Link>
              ))}
            </nav>

            <Recherche />

            {incoherente && (
              <p className={styles.avertissement} role="alert">
                La fin de la période précède son début : la période n&apos;est pas appliquée.
              </p>
            )}

            {retenus.length === 0 ? (
              <Vide
                ton="filtre"
                icone="/recherche-entreprise"
                titre="Aucun résultat"
                texte={
                  terme
                    ? "Aucun dossier ne correspond à « " + terme + " »."
                    : "Aucun dossier ne correspond à ces critères."
                }
                action={{ libelle: "Voir tous les dossiers", lien: "/avocat" }}
              />
            ) : (
              <>
                <Tableau
                  lignes={tranche.visibles.map((d) => ({
                    ...d,
                    creeLe: d.creeLe.toISOString(),
                    majLe: d.majLe.toISOString(),
                  }))}
                />

                <Pagination
                  page={tranche.page}
                  pages={tranche.pages}
                  premier={tranche.premier}
                  dernier={tranche.dernier}
                  total={tranche.total}
                  criteres={{
                    filtre: filtre === "tous" ? undefined : filtre,
                    q: terme || undefined,
                    tri: tri === "recent" ? undefined : tri,
                    du: criteres.du,
                    au: criteres.au,
                  }}
                />
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
