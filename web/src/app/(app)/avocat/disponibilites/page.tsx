import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { mesDisponibilites } from "@/infrastructure/db/depots/consultations";
import { SousNavigation } from "../SousNavigation";
import { Disponibilites } from "./Disponibilites";
import styles from "../Avocat.module.css";

export const metadata: Metadata = {
  title: "Mes disponibilités - Formalist",
  robots: { index: false, follow: false },
};

/**
 * Les disponibilités de l'avocat.
 *
 * Chacun gère les siennes : mesDisponibilites ne rend que celles de la personne
 * connectée, et les routes d'écriture refusent de toucher à celles d'un autre. Un
 * avocat qui n'a rien publié n'apparaît nulle part dans la prise de rendez-vous -
 * cette page est donc le seul endroit d'où il devient visible.
 */
export default async function PageDisponibilites() {
  const utilisateur = await exigerUtilisateur();

  // Un client n'a rien à faire ici. On rend un 404 plutôt qu'un refus explicite,
  // comme sur le reste de l'espace avocat : la réponse ne renseigne pas sur ce qui
  // existe.
  if (!utilisateur.roles.includes("avocat") && !utilisateur.roles.includes("admin")) notFound();

  const { plages, absences } = await mesDisponibilites(utilisateur);

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <h1>Mes disponibilités</h1>
      </div>
      <p className={styles.introduction}>
        Vos heures de présence et vos absences : c&apos;est de là que viennent les créneaux proposés
        aux clients.
      </p>

      <SousNavigation actif="disponibilites" />

      <div className={styles.content}>
        <Disponibilites
          plages={plages.map((p) => ({
            id: p.id,
            jourSemaine: p.day_of_week,
            debut: p.start_time,
            fin: p.end_time,
            dureeCreneauMinutes: p.slot_duration_minutes,
          }))}
          absences={absences.map((a) => ({
            id: a.id,
            debut: a.start_date,
            fin: a.end_date,
            motif: a.reason,
          }))}
        />
      </div>
    </main>
  );
}
