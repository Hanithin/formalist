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
          // Rien à faire de son côté : l'écran ne demande donc pas un geste, il
          // donne une sortie. « Réessayez plus tard » seul laissait sans recours.
          <Vide
            ton="indisponible"
            niveau={3}
            icone="/consultations"
            titre="Aucun créneau ouvert"
            texte="Les avocats n'ont pas encore publié leurs disponibilités. Écrivez au support : nous vous proposerons un rendez-vous par un autre moyen."
            action={{ libelle: "Écrire au support", lien: "/support" }}
          />
        ) : (
          <PriseDeRendezVous avocats={avocats} />
        )}
      </section>

      <section className={styles.bloc}>
        {/* Le titre ne change pas selon qu'il y ait ou non un rendez-vous : un
            repère de navigation qui se renomme n'est plus un repère. Le compte
            s'ajoute quand il y a quelque chose à compter. */}
        <h2>
          {aVenir.length === 0
            ? "Rendez-vous à venir"
            : accorder(aVenir.length, "rendez-vous à venir", "rendez-vous à venir")}
        </h2>

        {aVenir.length === 0 && (
          <Vide
            ton="encart"
            texte={
              avocats.length === 0
                ? "Rien de prévu pour le moment."
                : "Rien de prévu. Choisissez un créneau ci-dessus, il apparaîtra ici."
            }
          />
        )}

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
