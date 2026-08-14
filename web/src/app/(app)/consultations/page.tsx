import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { mesConsultations, avocatsDisponibles } from "@/infrastructure/db/depots/consultations";
import { dateEnTete } from "@/lib/dates";
import { Consultations, type ConsultationAffichee } from "./Consultations";
import { SousNavigation } from "../avocat/SousNavigation";
import styles from "./Consultations.module.css";

export const metadata: Metadata = {
  title: "Consultation juridique - Formalist",
  robots: { index: false, follow: false },
};

/**
 * Consultation juridique.
 *
 * La page charge toutes les consultations : ses quatre onglets annoncent chacun leur
 * décompte, et une liste déjà réduite ne permettrait pas de les calculer. Le
 * classement se fait ensuite sur place, comme le faisait la page d'origine.
 *
 * Les dates traversent en ISO plutôt qu'en Date : ce qui part au navigateur est
 * sérialisé, et une Date y arriverait en chaîne sans que le type le dise.
 *
 * La page est partagée : le client y prend rendez-vous, l'avocat y retrouve les
 * siens. Pour l'avocat, elle porte donc la barre d'onglets de son espace - « Consultations »
 * en fait partie, et sans elle les autres onglets disparaissaient en arrivant ici,
 * laissant « Mes disponibilités » introuvable autrement qu'en repassant par
 * « Espace avocat ».
 */
export default async function PageConsultations({
  searchParams,
}: {
  searchParams: Promise<{ paiement?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { paiement } = await searchParams;
  const estAvocat = utilisateur.roles.includes("avocat") || utilisateur.roles.includes("admin");

  const [consultations, avocats] = await Promise.all([
    mesConsultations(utilisateur),
    avocatsDisponibles(),
  ]);

  const affichees: ConsultationAffichee[] = consultations.map((c) => ({
    id: c.id,
    debut: c.debut.toISOString(),
    dureeMinutes: c.dureeMinutes,
    matiere: c.matiere,
    description: c.description,
    pieces: c.pieces,
    avocat: c.avocat,
    lienVisio: c.lienVisio,
    compteRendu: c.compteRendu,
    prixHtCentimes: c.prixHtCentimes,
    etat: c.etat,
    etatAffiche: c.etatAffiche,
    annulable: c.annulable,
    remboursementAutomatique: c.remboursementAutomatique,
  }));

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <h1>Consultation juridique</h1>
        <span className={styles.topbarDate}>{dateEnTete()}</span>
      </div>
      <p className={styles.sousTitre}>Échangez en visio avec un avocat spécialisé.</p>

      {estAvocat && (
        <div className={styles.sousNavigation}>
          <SousNavigation actif="consultations" />
        </div>
      )}

      <Consultations
        consultations={affichees}
        avocats={avocats.map((a) => ({
          id: a.id,
          nom: a.name ?? "Avocat",
          email: a.email ?? "",
        }))}
        paiement={paiement ?? null}
      />
    </main>
  );
}
