"use client";

import { Interrogation, Carte, PieceJointe, Bouclier, Alerte, Etoile, Bulle } from "./Icones";
import styles from "./Messagerie.module.css";

/**
 * Une conversation ouverte mais vide.
 *
 * Reprise de renderEmptyChatState() : le support propose ses sujets fréquents, qui
 * préremplissent la saisie. Devant un champ vide, on ne sait pas ce qu'on a le droit
 * de demander ; une liste de sujets le dit sans l'écrire.
 */

const SUJETS = [
  {
    icone: <Carte />,
    titre: "Question sur ma facturation",
    amorce: "Bonjour, j'ai une question concernant ma facturation : ",
  },
  {
    icone: <PieceJointe />,
    titre: "Problème avec un document",
    amorce: "Bonjour, je rencontre un problème avec un document : ",
  },
  {
    icone: <Bouclier />,
    titre: "Aide juridique générale",
    amorce: "Bonjour, j'ai besoin d'aide sur une question juridique : ",
  },
  {
    icone: <Alerte />,
    titre: "Bug ou problème technique",
    amorce: "Bonjour, je rencontre un bug : ",
  },
  {
    icone: <Etoile />,
    titre: "Suggestion ou autre demande",
    amorce: "Bonjour, j'aimerais vous suggérer : ",
  },
];

interface Props {
  genre: "dossier" | "support";
  titre: string;
  surSujet: (amorce: string) => void;
}

export function EtatVide({ genre, titre, surSujet }: Props) {
  if (genre === "support") {
    return (
      <div className={styles.emptyChat}>
        <div className={styles.emptyChatIc} style={{ background: "#eff6ff", color: "#2563eb" }}>
          <Interrogation />
        </div>
        <h3 className={styles.emptyChatTitle}>Support Formalist</h3>
        <p className={styles.emptyChatDesc}>
          Notre équipe vous répond généralement sous quelques heures (lun-ven 9h-19h).
          Posez-nous toute question sur vos formalités, facturation, documents,
          fonctionnalités…
        </p>

        <div className={styles.emptyChatSubjectsTitle}>Sujets fréquents</div>
        <div className={styles.emptyChatSubjects}>
          {SUJETS.map((s) => (
            <button
              key={s.titre}
              type="button"
              className={styles.quickSubject}
              onClick={() => surSujet(s.amorce)}
            >
              <span className={styles.qsIc}>{s.icone}</span>
              <span className={styles.qsT}>{s.titre}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.emptyChat}>
      <div className={styles.emptyChatIc} style={{ background: "#f5f3ff", color: "#7c3aed" }}>
        <Bulle />
      </div>
      <h3 className={styles.emptyChatTitle}>Aucun message sur {titre}</h3>
      <p className={styles.emptyChatDesc}>
        Écrivez à l&apos;avocat qui suit ce dossier : une question sur une pièce, une
        précision sur votre situation, un point à vérifier avant le dépôt.
      </p>

      <div className={styles.emptyChatTips}>
        <div className={styles.tipItem}>
          <span className={styles.tipIc}>
            <PieceJointe />
          </span>
          <span>
            <span className={styles.tipT}>Joignez vos pièces au fil</span>
            <span className={styles.tipS}>
              Elles restent rattachées au message, donc à son contexte.
            </span>
          </span>
        </div>
        <div className={styles.tipItem}>
          <span className={styles.tipIc}>
            <Bouclier />
          </span>
          <span>
            <span className={styles.tipT}>Ce fil ne concerne que ce dossier</span>
            <span className={styles.tipS}>
              Pour une question de facturation ou un bug, écrivez au support.
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
