"use client";

import { OFFRES } from "@/domain/formalite/offres";
import styles from "./Parcours.module.css";

/**
 * Le choix de la formule, en trois cartes.
 *
 * Reprise de la grille de public/creation.html : la formule recommandée est
 * surélevée et porte sa pastille, jusqu'à ce qu'un choix soit fait - la carte
 * retenue prend alors le liseré noir et la recommandation s'efface. C'est ce que
 * faisaient les règles `:has(.selected)` de creation.css.
 *
 * La version Next l'avait réduit à un menu déroulant de deux lignes, aux libellés
 * inventés et sans aucun prix. Une formule se choisit sur ce qu'elle contient et
 * ce qu'elle coûte.
 */

function Coche() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function Offres({
  choisie,
  surChangement,
  anomalie,
}: {
  choisie: string | undefined;
  surChangement: (code: string) => void;
  anomalie?: string;
}) {
  // Dès qu'une formule est retenue, la recommandation ne se met plus en avant :
  // deux cartes surélevées se disputeraient le regard.
  const unChoixEstFait = OFFRES.some((o) => o.code === choisie);

  return (
    <div className={styles.full}>
      <div className={styles.offres} role="radiogroup" aria-label="Formules">
        {OFFRES.map((o) => {
          const retenue = o.code === choisie;
          const enAvant = o.recommandee && !unChoixEstFait;

          return (
            <div
              key={o.code}
              className={[
                styles.offre,
                retenue ? styles.offreRetenue : "",
                enAvant ? styles.offreRecommandee : "",
                !retenue && !enAvant ? styles.offreEnRetrait : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {enAvant && <span className={styles.offrePastille}>Recommandé</span>}

              <p className={styles.offreNom}>{o.nom}</p>

              <p className={styles.offrePrix}>
                {o.prix}€<sup>HT</sup>
              </p>

              {o.fraisAnnexes.map((frais) => (
                <p key={frais} className={styles.offreFrais}>
                  {frais}
                </p>
              ))}

              <p className={styles.offreDesc}>{o.description}</p>

              {/* Le bouton porte le choix : la carte entière serait une cible
                  ambiguë à côté de la liste de contenu, qu'on lit sans cliquer. */}
              <button
                type="button"
                role="radio"
                aria-checked={retenue}
                className={styles.offreBouton}
                onClick={() => surChangement(o.code)}
              >
                {retenue ? "Formule retenue" : "Sélectionner"}
              </button>

              <p className={styles.offreInclut}>{o.inclut}</p>

              <ul className={styles.offreContenu}>
                {o.contenu.map((ligne) => (
                  <li key={ligne}>
                    <Coche />
                    {ligne}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {anomalie && <p role="alert">{anomalie}</p>}
    </div>
  );
}
