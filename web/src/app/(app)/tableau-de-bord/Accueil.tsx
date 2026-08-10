import Link from "next/link";
import styles from "./Accueil.module.css";

/**
 * Le tableau de bord d'un compte qui n'a encore aucun dossier.
 *
 * Reprise de renderEmptyState() dans public/dashboard.html : le bloc sombre, la
 * pastille de réassurance, la salutation qui monte du bandeau vers le titre, et
 * les parcours groupés en « Démarrer une activité » et « Besoin d'autre chose ? ».
 * Les libellés, les durées et les prix sont ceux de la page d'origine.
 *
 * Le bloc est clair : le <style> de la page le dessinait en dégradé sombre, mais
 * sidebar-dark.css - chargé après - le repassait en blanc. C'est cette version-là
 * que voyaient les clients.
 *
 * Deux adresses changent, parce que la cible a changé de nom en passant ici :
 * « Consulter un avocat » menait à /avocat.html, qui est devenu l'espace réservé
 * au cabinet - la prise de rendez-vous est à /consultations. Et le parcours de
 * création perd son ?new=1, que la page ne lit plus.
 *
 * Le groupe « gerer » de la page d'origine (modifier, fermer) était décrit dans
 * les données mais n'était pas rendu : renderGroup n'était appelé que sur 'creer'
 * et 'services'. On ne le rend pas non plus.
 */

const OUVERTURE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">';

interface Parcours {
  lien: string;
  /** Le tracé de l'icône, tel qu'il était dans la page d'origine. */
  icone: string;
  titre: string;
  description: string;
  duree: string;
  prix: string;
  /** Le parcours mis en avant, avec sa pastille. */
  recommande?: boolean;
}

const DEMARRER: Parcours[] = [
  {
    lien: "/creation?type=creation",
    icone: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h0M15 9h0M9 13h0M15 13h0"/>',
    titre: "Créer ma société",
    description: "SAS, SARL, SCI, SASU, EURL",
    duree: "12 min",
    prix: "à partir de 129€",
    recommande: true,
  },
  {
    lien: "/auto-entrepreneur",
    icone: '<circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>',
    titre: "Devenir auto-entrepreneur",
    description: "Création rapide et gratuite",
    duree: "7 min",
    prix: "gratuit",
  },
];

const AUTRE: Parcours[] = [
  {
    lien: "/contrats",
    icone:
      '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>' +
      '<line x1="16" y1="13" x2="8" y2="13"/>',
    titre: "Rédiger un contrat",
    description: "Modèles sur mesure",
    duree: "10 min",
    prix: "sur mesure",
  },
  {
    lien: "/consultations",
    icone: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    titre: "Consulter un avocat",
    description: "Conseil juridique 30 min",
    duree: "30 min",
    prix: "à partir de 49€",
  },
];

function Groupe({ libelle, parcours }: { libelle: string; parcours: Parcours[] }) {
  return (
    <>
      <p className={styles.groupe}>{libelle}</p>
      <ul className={styles.parcours}>
        {parcours.map((p) => (
          <li key={p.lien}>
            <Link
              href={p.lien}
              className={p.recommande ? `${styles.chemin} ${styles.recommande}` : styles.chemin}
            >
              <span className={styles.fleche} aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </span>

              <span
                className={styles.icone}
                aria-hidden="true"
                /* Les tracés sont des données de ce fichier, pas une saisie. */
                dangerouslySetInnerHTML={{ __html: OUVERTURE + p.icone + "</svg>" }}
              />

              {p.recommande && <span className={styles.pastille}>Recommandé</span>}

              <span className={styles.cheminTitre}>{p.titre}</span>
              <span className={styles.cheminDesc}>{p.description}</span>

              <span className={styles.cheminMeta}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {p.duree} · {p.prix}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** `salutation` est la ligne du bandeau, qui monte ici : « Bonsoir Hani ». */
export function Accueil({ salutation }: { salutation: string }) {
  return (
    <div className={styles.hero}>
      <div className={styles.haut}>
        {/* Le bandeau qui portait le h1 est masqué sur cet écran : le titre de la
            page, c'est celui-ci. La page d'origine posait un h2 et n'avait donc
            plus aucun titre de premier niveau. */}
        <h1 className={styles.titre}>{salutation} 👋</h1>

        <p className={styles.badge}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
          <span>
            100% sécurisé · <strong>Validé par nos avocats</strong>
          </span>
        </p>
      </div>

      <p className={styles.chapeau}>
        Lancez votre activité en quelques minutes, accompagné par nos avocats.
      </p>

      <p className={styles.premierPas}>
        <span className={styles.etape}>1</span>
        <span>
          Première étape : <strong>créez votre société</strong>. Vos documents et le suivi se
          débloquent ensuite.
        </span>
      </p>

      <Groupe libelle="Démarrer une activité" parcours={DEMARRER} />
      <Groupe libelle="Besoin d'autre chose ?" parcours={AUTRE} />
    </div>
  );
}
