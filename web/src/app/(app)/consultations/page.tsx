import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  mesConsultations,
  avocatsDisponibles,
} from "@/infrastructure/db/depots/consultations";
import { libelleConsultation } from "@/domain/consultation/creneaux";
import { accorder } from "@/domain/formalite/etapes";
import { Etat } from "@/components/liste/Etat";
import { Vide } from "@/components/liste/Vide";
import { PriseDeRendezVous } from "./PriseDeRendezVous";
import { Annulation } from "./Annulation";
import styles from "./Consultations.module.css";

export const metadata: Metadata = {
  title: "Consultation juridique - Formalist",
  robots: { index: false, follow: false },
};

const TONS = {
  demandee: "attente",
  confirmee: "avance",
  faite: "abouti",
  annulee: "neutre",
} as const;

export default async function Consultations() {
  const utilisateur = await exigerUtilisateur();
  const [consultations, avocats] = await Promise.all([
    mesConsultations(utilisateur),
    avocatsDisponibles(),
  ]);

  const aVenir = consultations.filter((c) => c.etat === "confirmee" || c.etat === "demandee");
  const passees = consultations.filter((c) => c.etat === "faite" || c.etat === "annulee");

  return (
    <main className={styles.page}>
      <h1>Consultation juridique</h1>
      <p className={styles.resume}>
        Posez vos questions à un avocat spécialisé, sur le créneau qui vous arrange.
      </p>

      <section className={styles.bloc}>
        <h2>Prendre rendez-vous</h2>
        {avocats.length === 0 ? (
          <Vide
            titre="Aucun créneau ouvert"
            texte="Les avocats n'ont pas encore publié leurs disponibilités. Réessayez plus tard."
          />
        ) : (
          <PriseDeRendezVous avocats={avocats} />
        )}
      </section>

      <section className={styles.bloc}>
        <h2>
          {aVenir.length === 0
            ? "Aucun rendez-vous à venir"
            : accorder(aVenir.length, "rendez-vous à venir", "rendez-vous à venir")}
        </h2>

        {aVenir.length > 0 && (
          <ul className={styles.rendezVous}>
            {aVenir.map((c) => (
              <li key={c.id}>
                <span className={styles.quand}>
                  {new Intl.DateTimeFormat("fr-FR", {
                    dateStyle: "full",
                    timeStyle: "short",
                  }).format(c.debut)}
                </span>
                <span className={styles.sujet}>{c.sujet}</span>
                <span className={styles.avocat}>{c.avocat}</span>
                <Etat libelle={libelleConsultation(c.etat)} ton={TONS[c.etat]} />
                {c.annulable && <Annulation consultationId={c.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {passees.length > 0 && (
        <section className={styles.bloc}>
          <h2>Historique</h2>
          <ul className={styles.rendezVous}>
            {passees.map((c) => (
              <li key={c.id}>
                <span className={styles.quand}>
                  {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(c.debut)}
                </span>
                <span className={styles.sujet}>{c.sujet}</span>
                <Etat libelle={libelleConsultation(c.etat)} ton={TONS[c.etat]} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
