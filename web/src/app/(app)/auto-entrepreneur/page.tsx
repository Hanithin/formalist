import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  ouvrirDeclaration,
  commencerDeclaration,
} from "@/infrastructure/db/depots/auto-entrepreneur";
import { ETAPES, premiereEtapeIncomplete } from "@/domain/auto-entrepreneur/declaration";
import { Declaration } from "./Declaration";
import { confirmerAuRetour } from "@/infrastructure/db/depots/auto-entrepreneur";
import { Suivi } from "@/components/formalite/Suivi";
import { documentsDuDossier } from "@/infrastructure/db/depots/documents";
import { etatDuDossier } from "@/infrastructure/db/depots/suivi";
import { derniereDemandeDeCorrections } from "@/infrastructure/db/depots/avocat";
import styles from "./AutoEntrepreneur.module.css";

export const metadata: Metadata = {
  title: "Créer une auto-entreprise - Formalist",
  robots: { index: false, follow: false },
};

export default async function AutoEntrepreneur({
  searchParams,
}: {
  searchParams: Promise<{
    dossier?: string;
    etape?: string;
    session?: string;
    paiement?: string;
  }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { dossier, etape, session, paiement } = await searchParams;

  // Pas de dossier : on en ouvre un et on redirige, pour que l'adresse le porte.
  if (!dossier) {
    const nouveau = await commencerDeclaration(utilisateur);
    redirect("/auto-entrepreneur?dossier=" + nouveau);
  }

  /*
   * Le retour du paiement.
   *
   * On relit la session auprès de Stripe plutôt que de croire l'adresse, et avant de
   * lire la déclaration : sans cela le client revenait sur l'offre qu'il venait de
   * régler, parce que le webhook n'était pas encore passé - ou pas passé du tout.
   */
  const regleALInstant = session
    ? (await confirmerAuRetour(utilisateur, Number(dossier), session)).paye
    : false;

  const { dossier: ligne, declaration } = await ouvrirDeclaration(utilisateur, Number(dossier));

  // Les pièces déjà remises : les cartes du dépôt les annoncent plutôt que de laisser
  // croire qu'il reste tout à faire.
  const documents = await documentsDuDossier(utilisateur, Number(dossier));
  const deposees = documents.filter((d) => d.status !== "generated");

  // On ne saute pas par-dessus une étape incomplète : les suivantes s'appuient
  // sur ce qui précède.
  const bloquante = premiereEtapeIncomplete(declaration) ?? ETAPES.length;
  const demandee = Number(etape) || 1;

  /*
   * Une fois réglée, la déclaration ne se reprend plus.
   *
   * Elle est entre les mains d'un avocat qui va la déposer : la laisser modifier
   * ferait déposer autre chose que ce qui a été relu, et revenir sur l'offre déjà
   * payée ferait douter d'avoir payé.
   */
  /*
   * On s'arrête au récapitulatif, non à l'offre : c'est ce qui a été déposé qu'on
   * vient relire, et le suivi au-dessus dit déjà où en est le dossier. Répéter
   * « c'est réglé » sous un suivi qui annonce des corrections se contredirait.
   */
  const recapitulatif = ETAPES.length - 1;
  const courante = declaration.paye ? recapitulatif : Math.min(Math.max(demandee, 1), bloquante);

  /*
   * Le même cadre que la création de société : un fil d'ariane, puis une colonne
   * centrée de neuf cents pixels. Le titre existe pour la structure du document ;
   * à l'écran, ce sont le fil d'ariane et le titre de l'étape qui situent.
   */
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
        <span>Créer une auto-entreprise</span>
      </nav>

      <div className={styles.content}>
        <h1 className={styles.titre}>Créer une auto-entreprise</h1>

        {/*
          Le suivi n'apparaît qu'une fois la déclaration confiée : tant qu'on la
          remplit, le fil des huit étapes dit déjà où on en est, et deux indicateurs
          d'avancement côte à côte se contrediraient.
        */}
        {declaration.paye && (
          <div className={styles.suivi}>
            <Suivi
              etat={await etatDuDossier(ligne)}
              demande={await derniereDemandeDeCorrections(ligne.id)}
              lienAction={"/auto-entrepreneur?dossier=" + ligne.id}
              lienMessagerie={"/messagerie?dossier=" + ligne.id}
            />
          </div>
        )}
        <Declaration
          dossierId={Number(dossier)}
          etapes={ETAPES}
          etapeCourante={courante}
          declarationInitiale={declaration}
          piecesDeposees={deposees.map((d) => ({ type: d.type, nom: d.name }))}
          regleALInstant={regleALInstant}
          paiementAnnule={paiement === "annule"}
        />
      </div>
    </main>
  );
}
