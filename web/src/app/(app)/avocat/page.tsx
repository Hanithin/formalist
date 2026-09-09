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
import { Recherche } from "./Recherche";
import { Tableau } from "./Tableau";
import { Pagination } from "./Pagination";
import { Vide } from "@/components/liste/Vide";
import styles from "./Avocat.module.css";

export const metadata: Metadata = {
  title: "Espace avocat - Formalist",
  robots: { index: false, follow: false },
};

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
        {nonLus > 0 && (
          <Link href="/messagerie" className={styles.messagesEnAttente}>
            <span className={styles.messagesPastille} aria-hidden="true" />
            {nonLus} message{nonLus > 1 ? "s" : ""} non lu{nonLus > 1 ? "s" : ""}
          </Link>
        )}

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

      {/*
        La phrase vaut pour tous les dossiers, non pour les seules créations.

        « jusqu'au Kbis » ne dit juste que d'une constitution : une modification rend un
        extrait à jour, une fermeture une radiation, un dépôt des comptes un récépissé.
        L'accomplissement de la formalité les couvre tous, et c'est le mot des actes.
      */}
      <p className={styles.introduction}>
        Les dossiers confiés au cabinet, de leur transmission à l&apos;accomplissement de
        la formalité.
      </p>

      {/*
        La barre d'onglets a disparu.

        « Dossiers · Consultations · Mes disponibilités » redisait trois entrées de la
        colonne, à deux centimètres d'elles : on choisissait deux fois le même chemin,
        et la page en héritait d'une rangée de plus avant son contenu.
      */}

      <div className={styles.content}>
        {dossiers.length === 0 ? (
          <Vide
            icone="/recherche-entreprise"
            titre="Aucun dossier pour le moment"
            texte="Vos dossiers clients apparaîtront ici dès qu'ils vous seront assignés. Vous pouvez aussi créer directement une formalité."
            action={{ libelle: "Créer une formalité", lien: "/creation?type=creation" }}
          />
        ) : (
          <>
            {/*
              Les quatre cartes de compteurs ont disparu.

              « À vérifier 2 », « En cours 3 », « Terminées 7 » : les trois mêmes mots et
              les trois mêmes nombres que les filtres, soixante pixels plus bas - à ceci
              près que les cartes ne se cliquaient pas. Trois cents pixels de haut avant
              le premier dossier, pour redire ce que la rangée suivante disait mieux.

              Les filtres portent déjà les nombres, et ils mènent quelque part. Reste ce
              qu'ils ne disaient pas : les messages non lus, qui ne sont pas un filtre de
              dossiers mais un travail en attente - il rejoint le titre, et ne paraît que
              s'il y en a.
            */}
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
