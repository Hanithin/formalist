"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FAMILLES } from "@/domain/navigation/parcours";
import { CarteDeParcours } from "./CarteDeParcours";
import styles from "./NouvelleFormalite.module.css";

/**
 * Le bouton « + Nouvelle formalité » et sa fenêtre.
 *
 * Reprise de la modale de public/dashboard.html (openNewActionModal), qui alignait six
 * cartes à plat. Elles sont désormais rangées par moment de la vie d'une société - on
 * la crée, on la gère, on la ferme - parce qu'une grille de huit se parcourt en entier
 * avant qu'on choisisse, quand une famille se saute d'un coup d'œil.
 *
 * La colonne étant rendue sur le serveur, seul ce bouton a besoin du navigateur :
 * c'est le seul morceau client de la navigation.
 */

const OUVERTURE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">';

/**
 * Le bouton d'ouverture, et la fenêtre qu'il commande.
 *
 * `libelle` et `apparence` existent parce que le même geste s'offre à deux endroits :
 * en tête de colonne, et en haut de la page des formalités - où l'on est venu
 * précisément pour en créer une, et où descendre chercher la colonne est un détour.
 */
export function NouvelleFormalite({
  libelle = "Nouvelle formalité",
  apparence = "colonne",
}: {
  libelle?: string;
  apparence?: "colonne" | "page";
} = {}) {
  const [ouverte, setOuverte] = useState(false);
  const bouton = useRef<HTMLButtonElement>(null);
  const fenetre = useRef<HTMLDivElement>(null);

  // Échap ferme, et le focus revient au bouton : sans cela, on se retrouve à
  // naviguer au clavier dans une page dont on ne voit plus le point de départ.
  useEffect(() => {
    if (!ouverte) return;

    function auClavier(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOuverte(false);
        bouton.current?.focus();
      }
    }

    document.addEventListener("keydown", auClavier);
    fenetre.current?.focus();
    return () => document.removeEventListener("keydown", auClavier);
  }, [ouverte]);

  return (
    <>
      <button
        ref={bouton}
        type="button"
        className={apparence === "page" ? styles.actionPage : styles.action}
        onClick={() => setOuverte(true)}
        aria-haspopup="dialog"
        aria-expanded={ouverte}
      >
        {/*
          Le « + » a laissé la place au chevron.

          Les deux se contredisaient : le signe promet une page vierge - c'est ce qu'il
          veut dire partout ailleurs, « + Ajouter un associé » - quand le chevron
          annonce un choix à faire d'abord. Un geste, un symbole ; c'est le chevron qui
          dit vrai, et il se range au bout comme sur tout ce qui se déplie.

          L'alignement de la colonne ne tient plus au signe mais au retrait du bouton :
          le libellé reste sur la même verticale que « Mes formalités » en dessous.
        */}
        <span className={styles.libelle}>{libelle}</span>

        {/*
          Le chevron dit que le bouton ouvre un choix.
          
          Le « + » seul promet une page vierge - c'est ce qu'il veut dire partout
          ailleurs dans l'application, « + Ajouter un associé ». Or ce bouton est la
          seule porte vers les huit formalités du catalogue, et rien ne le laissait
          deviner : on l'ouvrait par curiosité, ou pas du tout. Le chevron est la
          convention de ce qui se déplie, et il pivote une fois la fenêtre ouverte.
        */}
        <span
          className={ouverte ? `${styles.chevron} ${styles.chevronOuvert}` : styles.chevron}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {/*
        La fenêtre est posée sur le document, non dans la colonne.

        La colonne est en position:sticky, ce qui crée un contexte d'empilement : son
        z-index de 1000 y restait prisonnier, et les cartes de la page se peignaient
        par-dessus la fenêtre. Un portail la sort de ce contexte.
      */}
      {/* La fenêtre ne s'ouvre que sur un clic : le document est donc là. */}
      {ouverte &&
        createPortal(
          <div
            className={styles.voile}
            /* Le clic sur le voile ferme ; celui sur la fenêtre ne remonte pas. */
            onClick={() => setOuverte(false)}
          >
            <div
              ref={fenetre}
              className={styles.fenetre}
              role="dialog"
              aria-modal="true"
              aria-labelledby="nouvelle-formalite"
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.entete}>
                <div>
                  <h2 id="nouvelle-formalite" className={styles.titre}>
                    Nouvelle formalité
                  </h2>
                  {/*
                    Le sous-titre disait à quoi sert la fenêtre à qui venait de
                    l'ouvrir : « Choisissez l'opération à lancer ». Il dit maintenant ce
                    qu'on veut savoir au moment de choisir - qui tient la plume derrière.
                  */}
                  <p className={styles.soustitre}>
                    Un avocat relit chaque acte, du premier document au greffe.
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.fermer}
                  onClick={() => setOuverte(false)}
                  aria-label="Fermer"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className={styles.familles}>
                {FAMILLES.map((famille) => (
                  <section key={famille.titre} className={styles.famille}>
                    <h3 className={styles.familleTitre}>{famille.titre}</h3>
                    <div className={styles.grille}>
                      {famille.parcours.map((parcours) =>
                        /*
                          Un parcours pas encore ouvert se nomme sans se promettre.
                          La page d'origine posait un href="#" sur les deux : la carte
                          renvoyait en haut de page sans que rien ne l'explique.
                        */
                        parcours.bientot ? (
                          <span
                            key={parcours.titre}
                            className={styles.carteBientot}
                            aria-disabled="true"
                          >
                            <span
                              className={`${styles.pastille} ${styles[parcours.teinte]}`}
                              aria-hidden="true"
                              dangerouslySetInnerHTML={{
                                __html: OUVERTURE + parcours.icone + "</svg>",
                              }}
                            />
                            <span className={styles.corps}>
                              <span className={styles.carteTitre}>{parcours.titre}</span>
                              <span className={styles.carteDesc}>{parcours.description}</span>
                            </span>
                            <span className={styles.bientot}>Bientôt</span>
                          </span>
                        ) : (
                          <CarteDeParcours key={parcours.titre} parcours={parcours} />
                        )
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
