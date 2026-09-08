import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { dossierPourAvocat } from "@/infrastructure/db/depots/avocat";
import { statutsAMettreAJour } from "@/domain/modification/formalites";
import { typeDeDossier } from "@/domain/formalite/cabinet";
import { estUneModification } from "@/domain/modification/recapitulatif";
import { Statuts } from "../Statuts";
import styles from "../../Avocat.module.css";

export const metadata: Metadata = {
  title: "Les statuts - Espace avocat - Formalist",
  robots: { index: false, follow: false },
};

/**
 * L'éditeur des statuts, sur sa page.
 *
 * Il vivait au bas du dossier, sous les documents et sous le fil des échanges : le
 * bouton qui y menait n'était qu'une ancre, et l'on cliquait sans rien voir arriver -
 * la page avait défilé deux écrans plus bas. Rangé là, il perdait par ailleurs la
 * moitié de sa largeur au profit de la colonne du dossier, et les poignées des cadres
 * tombaient à sept pixels de côté : on ne saisit pas un cadre à cette taille.
 *
 * Ce n'est pas un panneau de lecture, c'est un plan de travail : pagination,
 * historique, annuler et refaire, cadres à poser au pixel. Il prend donc l'écran, et
 * son adresse - un rechargement ne fait plus perdre sa place.
 */
export default async function StatutsDuDossier({
  params,
}: {
  params: Promise<{ dossier: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  if (!utilisateur.roles.includes("avocat") && !utilisateur.roles.includes("admin")) notFound();

  const { dossier: identifiant } = await params;
  const vue = await dossierPourAvocat(utilisateur, Number(identifiant)).catch(() => null);
  if (!vue) notFound();

  const { dossier, donnees } = vue;

  /*
   * La retouche n'a de sens que sur une modification qui touche aux statuts.
   *
   * C'est la garde de la section qu'elle remplace : une adresse tapée à la main sur un
   * dépôt de comptes ouvrirait sinon un éditeur sans rien à éditer.
   */
  const codes = estUneModification(donnees) ? ((donnees.codes as string[]) ?? []) : [];
  if (typeDeDossier(dossier.type) !== "modification" || !statutsAMettreAJour(codes)) notFound();

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.statutsPleinePageTete}>
          <div>
            <h1 className={styles.statutsPleinePageTitre}>
              {dossier.societe || "Les statuts"}
            </h1>
            {/*
              Ce que l'écran garantit, plutôt que sa mécanique.

              « Chaque passage que les décisions changent est repris dans les statuts en
              vigueur » se lisait à l'envers : la phrase semblait dire qu'on écrit dans
              les statuts en vigueur, alors que ceux-ci ne bougent pas - c'est une copie
              qui est produite. Et « repris » ne dit pas ce qu'on fait au passage.
            */}
            <p className={styles.statutsPleinePageMention}>
              Seuls les passages que les décisions changent sont remplacés. Le reste des
              statuts ne bouge pas.
            </p>
          </div>

          {/*
            Le retour au dossier, collé en tête.

            Il avait aussi son jumeau en pied de page, pour la fin de la retouche : la
            page ne défile pas - l'éditeur remplit l'écran et fait défiler son document
            à l'intérieur - et ce second bouton était donc inatteignable. Celui-ci reste
            en vue quoi qu'il arrive.
          */}
          <Link href={"/avocat/" + dossier.id} className={styles.statutsRetour}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Revenir au dossier
          </Link>
        </div>

        {/* L'identifiant suit l'éditeur : la tâche du dossier et les essais le visent. */}
        <section id="statuts">
          <Statuts dossier={dossier.id} denomination={dossier.societe} />
        </section>

      </div>
    </main>
  );
}
