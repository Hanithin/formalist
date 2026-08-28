"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { menuPour, entreeActive, estRubrique, SEPARATEUR } from "@/domain/navigation/menu";
import {
  libelleCompteur,
  libelleDeLEntree,
  type ResumeColonne,
} from "@/domain/navigation/colonne";
import { EVENEMENT_COLONNE } from "@/lib/colonne";
import { icone } from "@/domain/navigation/icones";
import type { Role } from "@/domain/acces/regles";
import { Cloche } from "./Cloche";
import { Deconnexion } from "./Deconnexion";
import { NouvelleFormalite } from "./NouvelleFormalite";
import styles from "./Sidebar.module.css";

interface Props {
  utilisateur: { nom: string; email: string; roles: Role[] };
  /** Le résumé au premier rendu ; la colonne le rafraîchit ensuite elle-même. */
  resume: ResumeColonne;
}

/** Initiales pour l'avatar : « Hani Madfai » donne HM. */
function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * La colonne de navigation.
 *
 * Elle est cliente pour deux raisons, toutes deux dues au fait qu'une disposition
 * partagée n'est pas réexécutée quand on passe d'une de ses pages à une autre.
 *
 * L'entrée active se lisait dans un en-tête posé par le proxy : elle restait donc
 * celle de la première page ouverte, et « Mes formalités » demeurait surligné après
 * un clic sur « Tableau de bord ». Elle vient maintenant du chemin courant.
 *
 * Les compteurs, eux, restaient ceux du chargement initial - la colonne annonçait
 * trente et un dossiers en cours quand la page en montrait vingt-huit. Ils sont
 * redemandés à chaque changement de page, comme dans la version d'origine qui
 * interrogeait l'API sur chacune de ses pages. La valeur du serveur sert d'amorce :
 * rien ne clignote au premier rendu.
 */
export function Sidebar({ utilisateur, resume }: Props) {
  const chemin = usePathname();
  const [resumeCourant, setResumeCourant] = useState(resume);
  const [ouvert, setOuvert] = useState(false);

  /*
   * Les compteurs sont redemandés à chaque changement de page, et sur signal.
   *
   * Le signal sert aux actions qui changent les dossiers sans changer de page :
   * supprimer un brouillon depuis la liste laissait la colonne annoncer « Vous
   * travaillez sur X » pour un dossier disparu, avec un lien vers une page d'erreur.
   */
  useEffect(() => {
    const abandon = new AbortController();

    function redemander() {
      fetch("/api/colonne", { signal: abandon.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((frais: ResumeColonne | null) => {
          if (frais) setResumeCourant(frais);
        })
        .catch(() => undefined);
    }

    redemander();
    window.addEventListener(EVENEMENT_COLONNE, redemander);

    return () => {
      window.removeEventListener(EVENEMENT_COLONNE, redemander);
      abandon.abort();
    };
  }, [chemin]);

  /*
   * Le tiroir se referme dès qu'on navigue.
   *
   * Sans cela, un client qui touche « Mes documents » voit la page changer derrière un
   * tiroir resté ouvert, et croit que rien ne s'est passé.
   *
   * L'ajustement se fait pendant le rendu, non dans un effet : le tiroir se fermerait
   * alors après un premier rendu déjà peint, ce qui produit un battement visible - et
   * c'est ce que la règle `set-state-in-effect` signale.
   */
  const [cheminAffiche, setCheminAffiche] = useState(chemin);
  if (chemin !== cheminAffiche) {
    setCheminAffiche(chemin);
    setOuvert(false);
  }

  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [ouvert]);

  const menu = menuPour(utilisateur.roles);
  const active = entreeActive(chemin, menu);
  const estAdmin = utilisateur.roles.includes("admin");

  return (
    <>
      {/*
        Le tiroir, sur écran étroit.
        La colonne fait 300 pixels fixes : sur un téléphone, elle ne laissait que
        quatre-vingt-dix pixels au contenu, où le moindre titre se brisait mot par mot.
        Elle sort du flux en dessous de 900 px et s'ouvre par ce bouton.
      */}
      <button
        type="button"
        className={styles.tiroirBouton}
        aria-expanded={ouvert}
        aria-controls="colonne-navigation"
        aria-label={ouvert ? "Fermer le menu" : "Ouvrir le menu"}
        onClick={() => setOuvert((o) => !o)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" aria-hidden="true">
          {ouvert ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      {ouvert && (
        <button
          type="button"
          className={styles.tiroirVoile}
          aria-label="Fermer le menu"
          onClick={() => setOuvert(false)}
        />
      )}

    <aside
      id="colonne-navigation"
      className={ouvert ? `${styles.colonne} ${styles.ouverte}` : styles.colonne}
    >
      <div className={styles.entete}>
        <Link href="/tableau-de-bord" className={styles.logo}>
          <Image
            src="/images/logo.png"
            alt="Formalist"
            /* Dimensions réelles du PNG (4725 × 861) : le CSS le ramène à 30 px de haut. */
            width={225}
            height={41}
            style={{ height: 30, width: "auto" }}
            priority
          />
        </Link>
        {estAdmin && <span className={styles.badgeAdmin}>Admin</span>}
      </div>

      {/*
        Le bloc « Vous travaillez sur » a disparu.

        Il nommait le dernier dossier ouvert, quel que soit l'écran : on lisait
        « GREMLINS COMMUNICATION » en marge d'un dossier STERLING PEAK, et il fallait
        se rappeler que ce n'était pas celui qu'on avait sous les yeux. Chaque écran
        dit de quoi il parle ; la marge n'a pas à en désigner un autre.
      */}
      <Navigation>
        {menu.map((element, i) => {
          if (element === SEPARATEUR) {
            return <hr key={"filet-" + i} className={styles.filet} />;
          }

          if (estRubrique(element)) {
            /*
             * Un intertitre, non une entrée.
             *
             * Il ne se clique pas et ne prend pas le focus : c'est une étiquette. Le
             * lecteur d'écran le rattache au groupe qui suit par `aria-labelledby` sur
             * la liste, ce que la colonne ne fait pas encore - elle est une suite de
             * liens à plat. En attendant, un `<p>` vaut mieux qu'un titre de niveau
             * arbitraire au milieu de la page.
             */
            return (
              <p key={"rubrique-" + i} className={styles.rubrique}>
                {element.rubrique}
              </p>
            );
          }

          const lienNu = element.lien.split("?")[0];

          /*
           * Le geste au-dessus de la liste qu'il alimente.
           *
           * Il occupait un pavé blanc pleine largeur en tête de colonne, plus lourd que
           * le logo : la seule action de la marge y pesait plus que la marge entière.
           * Il tient à la même hauteur que les entrées, juste au-dessus de « Mes
           * formalités » - ce qu'il crée va s'y ranger.
           */
          const avantLesFormalites = lienNu === "/formalites" && (
            <NouvelleFormalite key="nouvelle" />
          );

          const dessin = (
            <span
              className={styles.icone}
              aria-hidden="true"
              /* Les tracés viennent de la navigation, pas d'une saisie. */
              dangerouslySetInnerHTML={{ __html: icone(element.lien) }}
            />
          );

          if (element.bientot) {
            return (
              <span key={element.lien} className={styles.bientot} aria-disabled="true">
                {dessin}
                {libelleDeLEntree(element.lien, element.libelle, resumeCourant)}
                <span className={styles.pastille}>Bientôt</span>
              </span>
            );
          }

          const estActive = lienNu === active;
          const compteur = element.compteur
            ? libelleCompteur(element.compteur, resumeCourant)
            : null;

          return (
            <Fragment key={element.lien}>
              {avantLesFormalites}
              <Link
                href={element.lien}
                className={estActive ? styles.lienActif : styles.lien}
                aria-current={estActive ? "page" : undefined}
              >
                {dessin}
                {libelleDeLEntree(element.lien, element.libelle, resumeCourant)}
                {compteur && <span className={styles.compteur}>{compteur}</span>}
              </Link>
            </Fragment>
          );
        })}
      </Navigation>

      <div className={styles.pied}>
        <span className={styles.avatar} aria-hidden="true">
          {initiales(utilisateur.nom)}
        </span>
        <span className={styles.identite}>
          <span className={styles.nom}>{utilisateur.nom}</span>
          <span className={styles.email}>{utilisateur.email}</span>
        </span>

        <Cloche />

        <Link
          href="/parametres"
          className={styles.bouton}
          title="Paramètres"
          aria-label="Paramètres"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </Link>

        <Deconnexion />
      </div>
    </aside>
    </>
  );
}

/**
 * Le dossier sur lequel on travaille.
 *
 * Trois choses ont changé ici. La pastille portait une maison, la même icône que
 * « Créer une société » deux lignes plus bas : deux objets différents ne se
 * distinguaient plus. Elle porte maintenant les initiales du nom - propres à chaque
 * société, donc reconnaissables d'un coup d'œil, comme un avatar.
 *
 * « Société active » disait un état sans dire ce qu'on pouvait en faire. « Vous
 * travaillez sur » nomme la situation, et le chevron - quand il y a le choix - dit
 * qu'elle se change.
 */
/**
 * L'enveloppe défilante de la navigation.
 *
 * Deux dégradés fondent les entrées coupées dans le fond de la colonne : une ligne
 * tranchée net ressemble à un défaut d'affichage, alors qu'un fondu se lit comme
 * « ça continue ». La flèche n'apparaît que s'il reste vraiment quelque chose à voir,
 * et disparaît une fois le bas atteint - sinon elle inviterait à défiler une liste
 * déjà entière.
 */
function Navigation({ children }: { children: ReactNode }) {
  const zone = useRef<HTMLElement | null>(null);
  const [reste, setReste] = useState(false);
  const [avant, setAvant] = useState(false);

  function mesurer(element: HTMLElement) {
    // Deux pixels de tolérance : les arrondis de mise en page en valent bien un.
    setReste(element.scrollHeight - element.scrollTop - element.clientHeight > 2);
    setAvant(element.scrollTop > 2);
  }

  useEffect(() => {
    const element = zone.current;
    if (!element) return;

    mesurer(element);
    const observateur = new ResizeObserver(() => mesurer(element));
    observateur.observe(element);
    return () => observateur.disconnect();
  }, []);

  return (
    <div
      className={styles.enveloppeNavigation}
      data-avant={avant ? "" : undefined}
      data-apres={reste ? "" : undefined}
    >
      <nav
        ref={zone}
        className={styles.navigation}
        aria-label="Navigation principale"
        onScroll={(e) => mesurer(e.currentTarget)}
      >
        {children}
      </nav>

      {reste && (
        <button
          type="button"
          className={styles.suite}
          aria-label="Voir la suite du menu"
          onClick={() =>
            zone.current?.scrollBy({ top: zone.current.clientHeight * 0.7, behavior: "smooth" })
          }
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
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}
    </div>
  );
}

