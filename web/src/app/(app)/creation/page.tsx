import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirBrouillon, commencerFormalite } from "@/infrastructure/db/depots/brouillons";
import { documentsDuDossier } from "@/infrastructure/db/depots/documents";
import { etapeAccessible, ETAPES } from "@/domain/formalite/parcours";
import { Parcours } from "./Parcours";
import { Suivi } from "@/components/formalite/Suivi";
import { adresseDuDossier } from "@/domain/formalite/liste";
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
   *
   * L'adresse vient de la table qui la connaît, plutôt que d'une liste de types
   * recopiée ici : une première version comparait à « auto-entreprise » quand la
   * valeur stockée est « auto-entrepreneur », et la garde ne se déclenchait jamais.
   */
  const adresse = adresseDuDossier(ligne);
  if (!adresse.startsWith("/creation")) redirect(adresse);
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
              lienAction={"/creation?dossier=" + ligne.id + "&etape=5"}
              lienMessagerie={"/messagerie?dossier=" + ligne.id}
            />
          </div>
        )}
        {/*
          Le formulaire reste, même une fois le dossier parti chez l'avocat.
          Le masquer paraissait juste - il n'y a plus d'informations à saisir - mais
          c'est par lui que le client dépose l'attestation de dépôt de capital et
          celle de parution, que le suivi et les courriels lui réclament précisément
          à ce moment-là. Le formulaire vide qu'on y voyait venait d'un dossier d'un
          autre type ouvert à cette adresse, ce que la redirection ci-dessus règle.
        */}
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
      </div>
    </main>
  );
}
