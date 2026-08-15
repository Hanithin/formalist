"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { adresseDuDossier } from "@/domain/formalite/liste";
import styles from "./Cloche.module.css";

interface AvisAffiche {
  id: number;
  genre: string;
  contenu: string;
  dossierId: number | null;
  lu: boolean;
  recuLe: string;
}

/**
 * Les avis reçus, et leur compte.
 *
 * La table existait, elle était alimentée à chaque geste de l'avocat, et rien ne la
 * lisait : quelqu'un dont l'avocat demandait des corrections ne l'apprenait qu'en
 * revenant de lui-même sur le site. C'est le seul écran d'où on peut le savoir sans
 * ouvrir un dossier après l'autre.
 *
 * Les avis se rafraîchissent au changement de page, comme les compteurs de la
 * colonne : une cloche qui ne bouge jamais finit par ne plus être regardée.
 */
export function Cloche() {
  const [ouverte, setOuverte] = useState(false);
  const [avis, setAvis] = useState<AvisAffiche[]>([]);
  const [nonLus, setNonLus] = useState(0);
  /*
   * « Rien pour le moment » est une affirmation, pas un vide.
   *
   * Le panneau s'ouvre plus vite que la réponse n'arrive : sans cette distinction, il
   * annonçait l'absence d'avis à quelqu'un qui en avait trois.
   */
  const [charge, setCharge] = useState(false);
  const bloc = useRef<HTMLDivElement>(null);
  const panneau = useRef<HTMLDivElement>(null);
  /*
   * Le panneau est rendu dans le document, non dans la colonne.
   *
   * La colonne porte overflow:hidden - c'est lui qui retient les entrées défilantes
   * et permet les fondus de bord - et il coupait net le panneau à la largeur de la
   * colonne. Ouvrir l'écoulement laisserait échapper le reste ; on sort donc la seule
   * chose qui doit déborder, en la plaçant sur la position du bouton.
   */
  const [ancre, setAncre] = useState<{ gauche: number; bas: number } | null>(null);
  const chemin = usePathname();

  useEffect(() => {
    let vivant = true;

    fetch("/api/avis")
      .then((r) => (r.ok ? r.json() : null))
      .then((donnees) => {
        if (!donnees || !vivant) return;
        setAvis(donnees.avis);
        setNonLus(donnees.nonLus);
      })
      .catch(() => undefined)
      .finally(() => {
        if (vivant) setCharge(true);
      });

    return () => {
      vivant = false;
    };
  }, [chemin]);

  // Un clic ailleurs referme : le panneau recouvre la colonne, le laisser ouvert
  // gênerait la navigation qu'il masque.
  useEffect(() => {
    if (!ouverte) return;

    // Le panneau vit hors de la colonne : un clic dedans est un clic « ailleurs »
    // pour le bloc, et refermerait le panneau qu'on vient d'ouvrir.
    function ailleurs(e: MouseEvent) {
      const cible = e.target as Node;
      if (bloc.current?.contains(cible) || panneau.current?.contains(cible)) return;
      setOuverte(false);
    }
    document.addEventListener("mousedown", ailleurs);
    return () => document.removeEventListener("mousedown", ailleurs);
  }, [ouverte]);

  function basculer() {
    const suite = !ouverte;
    setOuverte(suite);

    if (suite && bloc.current) {
      const cadre = bloc.current.getBoundingClientRect();
      setAncre({ gauche: cadre.left - 8, bas: window.innerHeight - cadre.top + 10 });
    }

    // Ouvrir vaut lecture : laisser le compteur allumé sur des lignes qu'on vient de
    // parcourir ne dit plus rien.
    if (suite && nonLus > 0) {
      setNonLus(0);
      setAvis((actuels) => actuels.map((a) => ({ ...a, lu: true })));
      fetch("/api/avis", { method: "PUT" }).catch(() => undefined);
    }
  }

  return (
    <div className={styles.bloc} ref={bloc}>
      <button
        type="button"
        className={styles.bouton}
        onClick={basculer}
        aria-expanded={ouverte}
        aria-label={nonLus > 0 ? "Notifications, " + nonLus + " non lues" : "Notifications"}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {nonLus > 0 && <span className={styles.pastille}>{nonLus > 9 ? "9+" : nonLus}</span>}
      </button>

      {ouverte &&
        ancre &&
        createPortal(
          <div
            className={styles.panneau}
            role="dialog"
            aria-label="Notifications"
            style={{ left: ancre.gauche, bottom: ancre.bas }}
            ref={panneau}
          >
            <div className={styles.tete}>Notifications</div>

            {!charge ? (
              <p className={styles.vide}>Chargement…</p>
            ) : avis.length === 0 ? (
              <p className={styles.vide}>
                Rien pour le moment. Vous serez prévenu ici dès qu&apos;un dossier avance.
              </p>
            ) : (
              <ul className={styles.liste}>
                {avis.map((a) => (
                  <li
                    key={a.id}
                    className={a.lu ? styles.ligne : `${styles.ligne} ${styles.frais}`}
                  >
                    <Ligne avis={a} surClic={() => setOuverte(false)} />
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

/**
 * Un avis mène à son dossier, quand il en a un.
 *
 * Le type du dossier décide de l'adresse : il n'existe pas de page « /formalites/id ».
 * Sans dossier - ce sera le cas d'avis à venir - la ligne se lit sans mener nulle part
 * plutôt que d'ouvrir une page au hasard.
 */
function Ligne({ avis, surClic }: { avis: AvisAffiche; surClic: () => void }) {
  const dedans = (
    <>
      <span className={styles.contenu}>{avis.contenu}</span>
      <span className={styles.quand}>{depuis(avis.recuLe)}</span>
    </>
  );

  if (avis.dossierId === null) return <span className={styles.inerte}>{dedans}</span>;

  return (
    <Link
      href={adresseDuDossier({ id: avis.dossierId, type: null })}
      className={styles.lien}
      onClick={surClic}
    >
      {dedans}
    </Link>
  );
}

/** « il y a 3 h » : la durée compte plus que la date pour un avis récent. */
function depuis(iso: string): string {
  const ecart = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ecart / 60_000);

  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return "il y a " + minutes + " min";

  const heures = Math.floor(minutes / 60);
  if (heures < 24) return "il y a " + heures + " h";

  const jours = Math.floor(heures / 24);
  if (jours < 7) return "il y a " + jours + " j";

  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
