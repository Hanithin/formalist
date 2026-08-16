import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirBrouillon, commencerFormalite } from "@/infrastructure/db/depots/brouillons";
import { documentsDuDossier } from "@/infrastructure/db/depots/documents";
import { etapeAccessible, ETAPES } from "@/domain/formalite/parcours";
import { Parcours } from "./Parcours";
import { Suivi } from "@/components/formalite/Suivi";
import { etatDuDossier } from "@/infrastructure/db/depots/suivi";
import { derniereDemandeDeCorrections } from "@/infrastructure/db/depots/avocat";
import styles from "./Parcours.module.css";

export const metadata: Metadata = {
  title: "Créer une société - Formalist",
  robots: { index: false, follow: false },
};

export default async function Creation({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string; etape?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { dossier, etape } = await searchParams;

  // Pas de dossier : on en ouvre un et on redirige, pour que l'adresse porte
  // l'identifiant. Sans ça, un rechargement créerait un dossier de plus.
  if (!dossier) {
    const nouveau = await commencerFormalite(utilisateur);
    redirect("/creation?dossier=" + nouveau);
  }

  const { dossier: ligne, brouillon } = await ouvrirBrouillon(utilisateur, Number(dossier));

  /*
   * Chaque parcours a sa page.
   *
   * Rien n'empêchait d'ouvrir une modification ou une auto-entreprise ici : l'écran
   * affichait alors le fil de la création - « Capital », « Associé », « Offres » -
   * au-dessus d'un formulaire de création vide, pour un dossier qui n'en est pas un.
   */
  if (ligne.type === "modification") redirect("/modification?dossier=" + ligne.id);
  if (ligne.type === "auto-entreprise" || ligne.type === "auto_entreprise") {
    redirect("/auto-entrepreneur?dossier=" + ligne.id);
  }
  const documents = await documentsDuDossier(utilisateur, Number(dossier));

  // Les deux vivent dans la même table et se distinguent par leur statut :
  // « uploaded » pour une pièce remise par le client, « generated » pour un acte
  // produit à partir du brouillon. Le type, lui, porte l'extension.
  const deposees = documents.filter((d) => d.status !== "generated");
  const actes = documents.filter((d) => d.status === "generated");
  const courante = etapeAccessible(Number(etape) || 1, brouillon);

  /*
   * Le suivi n'apparaît qu'une fois le dossier transmis.
   *
   * Tant qu'on le remplit, le fil des sept étapes dit déjà où on en est ; deux
   * indicateurs d'avancement côte à côte se contrediraient. Après la transmission, en
   * revanche, le formulaire ne dit plus rien de ce qui se passe.
   */
  const transmis = ligne.status !== "en_cours";
  const etat = transmis ? await etatDuDossier(ligne) : null;

  /*
   * Le formulaire ne s'affiche que si l'on peut encore y écrire.
   *
   * Une fois le dossier parti chez l'avocat, il restait affiché sous le suivi, vide et
   * annonçant « 0% renseigné » : on croyait avoir tout perdu, et toute saisie y était
   * de toute façon refusée par le serveur. Il revient quand l'avocat renvoie le
   * dossier, puisque c'est là qu'on reprend ce qui est demandé.
   */
  const modifiable = ligne.status === "en_cours" || ligne.status === "corrections_demandees";

  return (
    <main className={styles.page}>
      <nav className={styles.topbar} aria-label="Fil d'ariane">
        <Link href="/tableau-de-bord">Tableau de bord</Link>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span>Créer une société</span>
      </nav>

      <div className={styles.content}>
        <h1 className={styles.titre}>Créer une société</h1>

        {etat && (
          <div className={styles.suivi}>
            <Suivi
              etat={etat}
              demande={await derniereDemandeDeCorrections(ligne.id)}
              lienAction={"/messagerie?dossier=" + ligne.id}
            />
          </div>
        )}
        {modifiable ? (
          <Parcours
            dossierId={Number(dossier)}
            etapes={ETAPES}
            etapeCourante={courante}
            brouillonInitial={brouillon}
            piecesDeposees={deposees.map((d) => ({ type: d.type, nom: d.name }))}
            actesProduits={actes.map((d) => ({
              id: d.id,
              nom: d.name,
              fichier: d.file_path,
              statut: d.status,
            }))}
          />
        ) : (
          /*
            Le dossier est chez l'avocat : il n'y a plus rien à remplir, et l'on dit où
            retrouver ce qui le concerne plutôt que de laisser un formulaire vide.
          */
          <div className={styles.confie}>
            <p className={styles.confieTexte}>
              Votre dossier est entre les mains de l&apos;avocat. Vous n&apos;avez rien à
              remplir : le suivi ci-dessus dit où il en est, et vous serez prévenu si
              quelque chose doit être repris.
            </p>
            <div className={styles.confieLiens}>
              <Link className={styles.confieLien} href={"/messagerie?dossier=" + ligne.id}>
                Écrire à l&apos;avocat
              </Link>
              <Link className={styles.confieLien} href="/documents">
                Voir mes documents
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
