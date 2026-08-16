"use client";

import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ALIGNEMENTS,
  POLICES,
  fragmentsDe,
  type Alignement,
  type Introuvable,
  type Fragment,
  type Police,
  type Retouche,
  type Zone,
} from "@/domain/modification/edition";
import {
  peutAvancer,
  peutRevenir,
  type EtapeDHistorique,
} from "@/domain/modification/historique";
import {
  ETATS,
  cadreCouvrant,
  type ChangementSuivi,
  type Emplacement,
} from "@/domain/modification/suivi";
import styles from "./Modification.module.css";

/**
 * L'éditeur de statuts.
 *
 * Chaque passage à changer est cerné d'un trait vert sur la page : on voit d'un coup
 * d'œil ce qui reste à faire, et l'ancien texte demeure lisible dessous tant qu'on n'a
 * pas repris la main. Un clic ouvre le cadre : le fond passe au blanc - ce qu'il sera
 * dans le document produit - et l'on écrit dedans.
 *
 * La barre de pages ne liste pas les vingt-trois pages du document sur le même plan :
 * elle met en avant celles qui portent une retouche, avec l'article visé. Sur des
 * statuts de vingt pages, chercher la bonne à la main est le geste le plus long de
 * tout le travail.
 *
 * Les coordonnées vivent en points PDF, origine en haut à gauche - celles que rend
 * pdftotext et qu'attend l'application. L'affichage les traduit en pourcentages : la
 * page se redimensionne avec la fenêtre, les cadres suivent.
 */

interface Page {
  numero: number;
  largeur: number;
  hauteur: number;
}

interface Props {
  dossier: number;
  pages: Page[];
  zones: Zone[];
  retouches: Retouche[];
  reconnus: boolean;
  surChangement: (retouches: Retouche[]) => void;
  /** Ce que le repérage n'a pas trouvé : à poser à la main. */
  introuvables?: Introuvable[];
  surPlacer?: (introuvable: Introuvable) => void;
  /** En tête du panneau : le compte et la commande de production. */
  entete?: ReactNode;
  /** Les pages écartées du document produit ; l'original les garde. */
  pagesRetirees?: number[];
  surRetraitDePage?: (pages: number[]) => void;
  /**
   * Où en est chaque changement demandé.
   *
   * Le panneau listait les cadres. Un cadre n'est pas un changement : une dénomination
   * en demande autant qu'elle a d'occurrences dans l'acte, et compter les cadres
   * annonçait « 2 sur 2 posés » pendant que la durée n'était pas faite.
   */
  changements?: ChangementSuivi[];
  /** Ce que le cabinet certifie fait. La machine constate, l'avocat certifie. */
  verifiees?: string[];
  surVerifier?: (cle: string, fait: boolean) => void;
  /** Poser un cadre sur un emplacement repéré mais découvert. */
  surPoserEmplacement?: (cle: string, emplacement: Emplacement) => void;
  /** L'historique du dossier, et où l'on s'y trouve. */
  historique?: EtapeDHistorique[];
  positionHistorique?: number;
  /** L'historique renvoyé par l'enregistrement, après qu'une étape s'y est inscrite. */
  surInscription?: (historique: EtapeDHistorique[], position: number) => void;
  surReprise?: (position: number) => void;
}

/**
 * Les morceaux lus dans le champ.
 *
 * On parcourt les nœuds de texte et l'on relève, pour chacun, ce que ses parents lui
 * appliquent. Lire le HTML produit par le navigateur plutôt que le fabriquer soi-même
 * évite d'avoir à réimplémenter la découpe d'une sélection à cheval sur trois balises,
 * qui est exactement ce que le navigateur sait faire.
 */
function lireLesMorceaux(racine: HTMLElement): Fragment[] {
  const morceaux: Fragment[] = [];
  const parcours = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);

  let noeud = parcours.nextNode();
  while (noeud) {
    const texte = noeud.textContent ?? "";
    if (texte) {
      let gras = false;
      let italique = false;
      let souligne = false;

      let parent = noeud.parentElement;
      while (parent && parent !== racine.parentElement) {
        const nom = parent.tagName;
        const style = parent.style;
        if (nom === "B" || nom === "STRONG" || Number(style.fontWeight) >= 600 || style.fontWeight === "bold") {
          gras = true;
        }
        if (nom === "I" || nom === "EM" || style.fontStyle === "italic") italique = true;
        if (nom === "U" || style.textDecorationLine?.includes("underline")) souligne = true;
        parent = parent.parentElement;
      }

      const precedent = morceaux[morceaux.length - 1];
      // Deux morceaux de même style se recollent : le navigateur découpe volontiers
      // là où rien ne change, et un acte n'a pas à porter cinquante fragments.
      if (
        precedent &&
        !!precedent.gras === gras &&
        !!precedent.italique === italique &&
        !!precedent.souligne === souligne
      ) {
        precedent.texte += texte;
      } else {
        morceaux.push({ texte, gras, italique, souligne });
      }
    }
    noeud = parcours.nextNode();
  }

  return morceaux;
}

/** Le HTML d'une retouche, tel que le champ le rend. */
function htmlDesMorceaux(retouche: Retouche): string {
  return fragmentsDe(retouche)
    .map((f) => {
      const echappe = f.texte
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      let rendu = echappe;
      if (f.souligne) rendu = "<u>" + rendu + "</u>";
      if (f.italique) rendu = "<i>" + rendu + "</i>";
      if (f.gras) rendu = "<b>" + rendu + "</b>";
      return rendu;
    })
    .join("");
}

/**
 * Le champ de saisie, où la sélection porte le style.
 *
 * Un champ ordinaire ne connaît qu'un style pour tout son contenu : mettre un seul mot
 * en gras demandait de poser un second cadre à côté, en devinant où finissait le
 * premier. Ici le contenu est modifiable en place, et les commandes de mise en forme
 * s'appliquent à ce qui est sélectionné.
 *
 * Le contenu n'est posé qu'à l'ouverture : le réécrire à chaque frappe replacerait le
 * curseur au début.
 */
const SaisieRiche = forwardRef<
  HTMLDivElement,
  {
    retouche: Retouche;
    alignement: "left" | "center" | "right";
    surChangement: (changement: Partial<Retouche>) => void;
    surSortie: () => void;
  }
>(function SaisieRiche({ retouche, alignement, surChangement, surSortie }, ref) {
  const champ = useRef<HTMLDivElement | null>(null);
  /*
   * Le contenu de départ, figé à l'ouverture.
   *
   * Le réécrire à chaque frappe replacerait le curseur au début du champ. Il est donc
   * calculé une fois, à la première construction du composant - qui est remonté à
   * chaque cadre ouvert, ce qui suffit à le tenir à jour.
   */
  const [depart] = useState(() => htmlDesMorceaux(retouche));

  function relever() {
    const element = champ.current;
    if (!element) return;

    const morceaux = lireLesMorceaux(element);
    surChangement({
      fragments: morceaux,
      texte: morceaux.map((m) => m.texte).join(""),
    });
  }

  return (
    <div
      ref={(element) => {
        champ.current = element;
        if (typeof ref === "function") ref(element);
        else if (ref) ref.current = element;
      }}
      className={styles.repereSaisie}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="Texte du cadre"
      style={{ textAlign: alignement }}
      onInput={relever}
      onBlur={relever}
      onKeyDown={(e) => {
        // Entrée valide, Échap referme : un cadre tient sur une ligne.
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          relever();
          surSortie();
        }
      }}
      dangerouslySetInnerHTML={{ __html: depart }}
    />
  );
});

/** Bornes de la taille du texte : sous six points on ne lit plus, au-delà on déborde. */
const TAILLE_MINIMALE = 6;
const TAILLE_MAXIMALE = 40;

/**
 * Le champ de taille, qui se laisse écrire.
 *
 * Borner à chaque frappe rendait le champ inutilisable : taper « 2 » en route vers
 * « 22 » le ramenait aussitôt à 6, et l'effacer pour recommencer était impossible -
 * une valeur vide vaut zéro, donc six. Le champ garde donc sa propre chaîne pendant
 * qu'on écrit, ne remonte que ce qui tient dans les bornes, et se remet d'aplomb
 * quand on le quitte.
 */
function ChampTaille({
  valeur,
  surChangement,
}: {
  valeur: number;
  surChangement: (taille: number) => void;
}) {
  /*
   * La chaîne en cours de frappe, distincte de la valeur du cadre.
   *
   * Elle n'a pas à se resynchroniser : la barre vit dans le cadre ouvert, et changer
   * de cadre la démonte. Le champ repart donc de la bonne valeur à chaque ouverture.
   */
  const [saisie, setSaisie] = useState(String(Math.round(valeur * 10) / 10));

  function ecrire(texte: string) {
    setSaisie(texte);

    const lu = Number(texte.replace(",", "."));
    // Hors bornes ou illisible : on laisse écrire sans rien remonter. La valeur du
    // cadre ne bouge que pour une taille qui a un sens.
    if (!texte.trim() || !Number.isFinite(lu)) return;
    if (lu < TAILLE_MINIMALE || lu > TAILLE_MAXIMALE) return;
    surChangement(Math.round(lu * 10) / 10);
  }

  function remettreDAplomb() {
    const lu = Number(saisie.replace(",", "."));
    const retenue = Number.isFinite(lu)
      ? Math.min(TAILLE_MAXIMALE, Math.max(TAILLE_MINIMALE, lu))
      : valeur;

    const arrondie = Math.round(retenue * 10) / 10;
    setSaisie(String(arrondie));
    if (arrondie !== valeur) surChangement(arrondie);
  }

  /** Un cran de plus ou de moins, sans avoir à effacer pour retaper. */
  function decaler(pas: number) {
    const lu = Number(saisie.replace(",", ".")) || valeur;
    const suite = Math.min(TAILLE_MAXIMALE, Math.max(TAILLE_MINIMALE, Math.round((lu + pas) * 10) / 10));
    setSaisie(String(suite));
    surChangement(suite);
  }

  return (
    <span className={styles.taille}>
      <input
        type="text"
        inputMode="decimal"
        aria-label="Taille du texte"
        value={saisie}
        onChange={(e) => ecrire(e.target.value)}
        onBlur={remettreDAplomb}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "ArrowUp") {
            e.preventDefault();
            decaler(1);
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            decaler(-1);
          }
        }}
      />

      <span className={styles.tailleFleches}>
        <button
          type="button"
          className={styles.tailleFleche}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => decaler(1)}
          aria-label="Agrandir le texte"
          title="Agrandir"
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 8 L6 4 L10 8" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.tailleFleche}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => decaler(-1)}
          aria-label="Réduire le texte"
          title="Réduire"
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 4 L6 8 L10 4" />
          </svg>
        </button>
      </span>
    </span>
  );
}

/**
 * Les réglages d'un cadre.
 *
 * Posé au bord de celui qu'il règle, et non sous la page : on voit l'effet là où on
 * le produit. Chaque commande garde le curseur dans le texte - un réglage qui ferme
 * la saisie oblige à recliquer pour continuer d'écrire.
 *
 * La suppression n'y figure pas : elle vit au bord du cadre, à côté des réglages.
 * Enfouie ici, défaire un cadre posé au mauvais endroit demandait trois gestes, dont
 * deux sans rapport.
 */
function MiseEnForme({
  retouche,
  styleDuCurseur,
  surStyle,
  surChangement,
}: {
  retouche: Retouche;
  /** Ce que porte le texte sélectionné, non le cadre. */
  styleDuCurseur: { gras: boolean; italique: boolean; souligne: boolean };
  surStyle: (commande: "bold" | "italic" | "underline") => void;
  surChangement: (changement: Partial<Retouche>) => void;
}) {
  /*
   * Les boutons gardent le curseur dans le texte, les champs le prennent.
   *
   * Empêcher le défaut du pointeur sur toute la barre empêchait aussi de cliquer dans
   * le champ de taille et d'ouvrir le sélecteur de police : ils devenaient inertes.
   * Seuls les boutons refusent le focus - ils n'en ont pas besoin, et le rendre
   * ensuite au texte demanderait de le retrouver.
   */
  const garderLeFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className={styles.forme} data-mise-en-forme>
      <select
        aria-label="Police"
        value={retouche.police ?? "serif"}
        onChange={(e) => surChangement({ police: e.target.value as Police })}
      >
        {POLICES.map((p) => (
          <option key={p.valeur} value={p.valeur}>
            {p.libelle}
          </option>
        ))}
      </select>

      <ChampTaille valeur={retouche.taille} surChangement={(taille) => surChangement({ taille })} />

      <span className={styles.formeSeparateur} aria-hidden="true" />

      <button
        type="button"
        className={
          styleDuCurseur.gras ? `${styles.formeBouton} ${styles.formeActif}` : styles.formeBouton
        }
        onMouseDown={garderLeFocus}
        onClick={() => surStyle("bold")}
        aria-pressed={styleDuCurseur.gras}
        title="Gras"
      >
        <strong>G</strong>
      </button>

      <button
        type="button"
        className={
          styleDuCurseur.italique ? `${styles.formeBouton} ${styles.formeActif}` : styles.formeBouton
        }
        onMouseDown={garderLeFocus}
        onClick={() => surStyle("italic")}
        aria-pressed={styleDuCurseur.italique}
        title="Italique"
      >
        <em>I</em>
      </button>

      <button
        type="button"
        className={
          styleDuCurseur.souligne ? `${styles.formeBouton} ${styles.formeActif}` : styles.formeBouton
        }
        onMouseDown={garderLeFocus}
        onClick={() => surStyle("underline")}
        aria-pressed={styleDuCurseur.souligne}
        title="Souligné"
      >
        <u>S</u>
      </button>

      <span className={styles.formeSeparateur} aria-hidden="true" />

      {ALIGNEMENTS.map((a) => (
        <button
          key={a.valeur}
          type="button"
          className={
            (retouche.alignement ?? "gauche") === a.valeur
              ? `${styles.formeBouton} ${styles.formeActif}`
              : styles.formeBouton
          }
          onMouseDown={garderLeFocus}
          onClick={() => surChangement({ alignement: a.valeur as Alignement })}
          aria-pressed={(retouche.alignement ?? "gauche") === a.valeur}
          title={a.libelle}
          aria-label={a.libelle}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.formeIcone}>
            <rect x="3" y="5" width="18" height="2" rx="1" />
            <rect
              x={a.valeur === "gauche" ? 3 : a.valeur === "centre" ? 6 : 9}
              y="11"
              width="12"
              height="2"
              rx="1"
            />
            <rect x="3" y="17" width="18" height="2" rx="1" />
          </svg>
        </button>
      ))}

    </div>
  );
}

/** « 12:14, aujourd'hui » : une heure suffit quand le geste est du jour. */
function quandLisible(iso: string): string {
  const quand = new Date(iso);
  if (Number.isNaN(quand.getTime())) return "";

  const heure = quand.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const aujourdHui = new Date().toDateString() === quand.toDateString();
  if (aujourdHui) return heure;

  return quand.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) + " à " + heure;
}

/** Les familles, telles que le navigateur les rend, au plus près du PDF produit. */
const FAMILLES: Record<Police, string> = {
  serif: '"Times New Roman", Times, serif',
  sans: "Arial, Helvetica, sans-serif",
  mono: "Courier, monospace",
  garamond: '"EB Garamond", "Times New Roman", serif',
  lato: "Lato, Helvetica, Arial, sans-serif",
  // Les équivalents libres d'abord : ce sont eux qui iront dans le document.
  calibri: "Carlito, Calibri, Helvetica, sans-serif",
  georgia: "Gelasio, Georgia, serif",
};

export function Editeur({
  dossier,
  pages,
  zones,
  retouches,
  reconnus,
  surChangement,
  introuvables = [],
  surPlacer,
  entete,
  pagesRetirees = [],
  surRetraitDePage,
  historique = [],
  positionHistorique = -1,
  surInscription,
  surReprise,
  changements = [],
  verifiees = [],
  surVerifier,
  surPoserEmplacement,
}: Props) {
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);
  /*
   * Le placement se conserve au fil de la saisie.
   *
   * Les retouches ne vivaient qu'en mémoire jusqu'au clic sur « Appliquer » : un
   * rafraîchissement, un onglet fermé, un retour en arrière, et tout le travail
   * disparaissait sans un mot. On enregistre après une seconde de repos - à chaque
   * frappe, ce serait une requête par lettre.
   */
  const premierRendu = useRef(true);
  useEffect(() => {
    if (premierRendu.current) {
      premierRendu.current = false;
      return;
    }

    const minuteur = setTimeout(() => {
      fetch("/api/formalites/modification/retouches", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        /*
         * L'état entier, non les seules retouches.
         *
         * Envoyer les retouches sans les pages écartées faisait lire au serveur un
         * état où plus rien n'est écarté : il inscrivait « pages remises » dans
         * l'historique, et le document produit les aurait reprises.
         */
        body: JSON.stringify({ dossier, retouches, pagesRetirees, verifiees }),
      })
        .then((reponse) => (reponse.ok ? reponse.json() : null))
        .then((corps) => {
          /*
           * L'historique revient de l'enregistrement, car c'est lui qui l'inscrit.
           *
           * Sans cela, l'écran ne le connaissait qu'au chargement : on travaillait
           * toute une session sans voir apparaître ni les flèches ni le suivi, et
           * revenir sur une fausse manœuvre demandait de recharger la page.
           */
          if (corps?.inscrit && surInscription) {
            surInscription(corps.historique ?? [], corps.position ?? -1);
          }
        })
        .catch(() => {
          // Un enregistrement manqué n'interrompt pas le travail : la prochaine frappe
          // le retentera, et « Appliquer » envoie de toute façon l'état complet.
        });
    }, 1000);

    return () => clearTimeout(minuteur);
  }, [dossier, retouches, pagesRetirees, verifiees, surInscription]);

  const [page, setPage] = useState(retouches[0]?.page ?? pages[0]?.numero ?? 1);
  const [choisie, setChoisie] = useState<number | null>(null);
  const [toutesLesPages, setToutesLesPages] = useState(false);
  /** Où l'on en est dans le parcours des emplacements, changement par changement. */
  const [curseurs, setCurseurs] = useState<Record<string, number>>({});
  const cadre = useRef<HTMLDivElement>(null);
  const saisie = useRef<HTMLDivElement>(null);
  /*
   * Le geste en cours : déplacer, ou tirer un bord.
   *
   * Un champ numérique pour la largeur obligeait à viser un chiffre, à le corriger,
   * à revenir voir le résultat. Le cadre se saisit et se tire, comme une image.
   */
  const geste = useRef<{
    mode: "deplacer" | "largeur" | "hauteur" | "coin";
    index: number;
    depart: { x: number; y: number };
    origine: { x: number; y: number; largeur: number; hauteur: number };
    bouge: boolean;
  } | null>(null);

  /*
   * Le rapport entre la page affichée et la page en points.
   *
   * Les positions et les largeurs s'expriment en pourcentages, qui suivent seuls le
   * redimensionnement. La taille du texte, elle, demande un nombre de pixels, donc
   * l'échelle réelle du moment.
   */
  const [echelle, setEchelle] = useState(1);
  /*
   * Le clic est laissé au navigateur.
   *
   * Distinguer soi-même un clic d'un glissement au pointerup marchait mal : la
   * capture du pointeur, les re-rendus et les pointercancel font perdre l'événement.
   * Le navigateur, lui, sait déjà le faire ; il suffit d'écarter le clic qui suit un
   * vrai déplacement.
   */
  const aGlisse = useRef(false);
  /*
   * La mise en forme s'ouvre à la demande.
   *
   * Six réglages posés en permanence sous la page prennent la place de deux lignes de
   * statuts et se lisent alors qu'on ne s'en sert pas. Une icône les appelle, au bord
   * du cadre qu'ils règlent.
   */
  const [formeOuverte, setFormeOuverte] = useState(false);
  /*
   * Ce que porte la sélection courante.
   *
   * Les boutons doivent montrer l'état du texte sélectionné, non celui du cadre : on
   * ne saurait pas, sinon, si le mot sous le curseur est déjà en gras.
   */
  const [styleDuCurseur, setStyleDuCurseur] = useState({
    gras: false,
    italique: false,
    souligne: false,
  });

  useEffect(() => {
    if (choisie === null) return;

    function relever() {
      try {
        setStyleDuCurseur({
          gras: document.queryCommandState("bold"),
          italique: document.queryCommandState("italic"),
          souligne: document.queryCommandState("underline"),
        });
      } catch {
        // Le navigateur peut refuser hors d'un champ modifiable : sans importance.
      }
    }

    document.addEventListener("selectionchange", relever);
    return () => document.removeEventListener("selectionchange", relever);
  }, [choisie]);

  /**
   * Applique un style au texte sélectionné.
   *
   * On laisse le navigateur découper la sélection - à cheval sur trois balises, c'est
   * exactement ce qu'il sait faire - puis on relit le champ pour en tirer les
   * morceaux. Réimplémenter cette découpe soi-même serait long et fragile.
   */
  function appliquerAuTexte(commande: "bold" | "italic" | "underline", index: number) {
    const champ = saisie.current;
    if (!champ) return;

    champ.focus();
    document.execCommand(commande);

    const morceaux = lireLesMorceaux(champ);
    modifier(index, { fragments: morceaux, texte: morceaux.map((m) => m.texte).join("") });
  }

  const dimensions = pages.find((p) => p.numero === page) ?? pages[0];

  useEffect(() => {
    const element = cadre.current;
    if (!element || !dimensions) return;

    const mesurer = () => {
      const rendu = element.getBoundingClientRect().width;
      if (rendu > 0) setEchelle(rendu / dimensions.largeur);
    };

    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(element);
    return () => observateur.disconnect();
  }, [dimensions]);

  // Ouvrir un cadre met le curseur dedans : c'est pour écrire qu'on a cliqué.
  useEffect(() => {
    if (choisie !== null) saisie.current?.focus();
  }, [choisie]);

  /**
   * Refermer un cadre referme ses réglages.
   *
   * Les deux se posent dans le même geste plutôt que dans un effet : un setState
   * appelé depuis un effet provoque un second rendu pour rien.
   */
  function ouvrir(index: number | null) {
    setChoisie(index);
    if (index === null) setFormeOuverte(false);
  }

  /*
   * Un clic dehors referme le cadre et sa barre.
   *
   * La fermeture ne tenait qu'au blur de la saisie : dès qu'on avait touché la barre
   * - le champ de taille, le sélecteur de police - le curseur n'était plus dans le
   * texte, et cliquer ailleurs ne refermait plus rien. Le cadre restait ouvert
   * indéfiniment, sa barre par-dessus la page.
   */
  /*
   * Les flèches du clavier feuillettent, sauf quand on écrit dans un cadre.
   *
   * Vingt-trois pages se parcourent mal à la souris, et l'avocat a les mains sur le
   * clavier - il vient de taper le texte du cadre précédent.
   */
  useEffect(() => {
    function auClavier(evenement: KeyboardEvent) {
      const cible = evenement.target as HTMLElement | null;
      if (cible?.closest?.("[contenteditable], input, select, textarea")) return;
      if (evenement.key !== "ArrowLeft" && evenement.key !== "ArrowRight") return;

      evenement.preventDefault();
      setPage((courante) => {
        const suite = courante + (evenement.key === "ArrowRight" ? 1 : -1);
        return suite >= 1 && suite <= pages.length ? suite : courante;
      });
    }

    document.addEventListener("keydown", auClavier);
    return () => document.removeEventListener("keydown", auClavier);
  }, [pages.length]);

  useEffect(() => {
    if (choisie === null) return;

    function auClic(evenement: PointerEvent) {
      const cible = evenement.target as HTMLElement | null;
      if (cible?.closest?.("[data-cadre-ouvert], [data-mise-en-forme]")) return;
      setChoisie(null);
      setFormeOuverte(false);
    }

    // À la phase de capture : un cadre qui se referme au clic ne doit pas empêcher ce
    // même clic d'ouvrir le cadre suivant.
    document.addEventListener("pointerdown", auClic, true);
    return () => document.removeEventListener("pointerdown", auClic, true);
  }, [choisie]);

  function modifier(index: number, changement: Partial<Retouche>) {
    surChangement(retouches.map((r, i) => (i === index ? { ...r, ...changement } : r)));
  }

  function retirer(index: number) {
    surChangement(retouches.filter((_, i) => i !== index));
    ouvrir(null);
  }

  /** Le point cliqué, ramené en points PDF. */
  function enPoints(evenement: { clientX: number; clientY: number }) {
    const boite = cadre.current?.getBoundingClientRect();
    if (!boite || !dimensions) return null;
    return {
      x: ((evenement.clientX - boite.left) / boite.width) * dimensions.largeur,
      y: ((evenement.clientY - boite.top) / boite.height) * dimensions.hauteur,
    };
  }

  function commencerGeste(
    evenement: React.PointerEvent,
    index: number,
    mode: "deplacer" | "largeur" | "hauteur" | "coin"
  ) {
    const point = enPoints(evenement);
    if (!point) return;

    evenement.preventDefault();
    evenement.stopPropagation();

    const r = retouches[index];
    geste.current = {
      mode,
      index,
      depart: point,
      origine: { x: r.x, y: r.y, largeur: r.largeur, hauteur: r.hauteur },
      bouge: false,
    };
    (evenement.currentTarget as Element).setPointerCapture(evenement.pointerId);
  }

  function suivre(evenement: React.PointerEvent) {
    const encours = geste.current;
    if (!encours || !dimensions) return;

    const point = enPoints(evenement);
    if (!point) return;

    const dx = point.x - encours.depart.x;
    const dy = point.y - encours.depart.y;
    // Sous trois points, c'est un clic qui a tremblé, non un geste.
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) encours.bouge = true;

    const o = encours.origine;

    if (encours.mode === "deplacer") {
      // Le cadre reste dans la page : au-delà, il ne couvrirait plus rien et
      // l'ancienne valeur resterait lisible dans le document déposé.
      modifier(encours.index, {
        x: Math.min(Math.max(0, o.x + dx), dimensions.largeur - o.largeur),
        y: Math.min(Math.max(0, o.y + dy), dimensions.hauteur - o.hauteur),
      });
      return;
    }

    const changement: Partial<Retouche> = {};
    if (encours.mode === "largeur" || encours.mode === "coin") {
      changement.largeur = Math.min(Math.max(12, o.largeur + dx), dimensions.largeur - o.x);
    }
    if (encours.mode === "hauteur" || encours.mode === "coin") {
      changement.hauteur = Math.min(Math.max(8, o.hauteur + dy), dimensions.hauteur - o.y);
    }
    modifier(encours.index, changement);
  }

  function relacher() {
    const encours = geste.current;
    geste.current = null;
    // Un glissement n'est pas un clic : on retient qu'il y en a eu un, le temps que
    // le navigateur décide s'il émet un clic derrière.
    aGlisse.current = !!encours?.bouge;
  }

  /** Ajoute un cadre au centre de la page, pour ce que rien n'a repéré. */
  function ajouter() {
    if (!dimensions) return;
    /*
     * Un cadre modeste, qu'on agrandit s'il le faut.
     *
     * La moitié de la largeur de page couvrait la ligne entière et une partie de la
     * clause voisine : on ne pouvait pas juger du placement avant de l'avoir rétréci.
     * Trop petit se corrige en tirant un bord ; trop grand cache ce qu'on vise.
     */
    surChangement([
      ...retouches,
      {
        page,
        x: dimensions.largeur * 0.15,
        y: dimensions.hauteur * 0.45,
        largeur: Math.min(220, dimensions.largeur * 0.35),
        /*
         * Assez haut pour qu'on y écrive.
         *
         * Un cadre à la hauteur exacte d'une ligne serre le texte contre ses bords :
         * on ne voit plus ce qu'on tape, et le curseur touche le trait. La hauteur se
         * réduit ensuite en tirant un bord, si la place manque.
         */
        hauteur: 26,
        texte: "",
        taille: 11,
        police: "serif",
      },
    ]);
    ouvrir(retouches.length);
  }

  const retiree = pagesRetirees.includes(page);

  /** Va à une page, en refermant le cadre ouvert : on change de contexte. */
  function allerA(numero: number) {
    if (numero < 1 || numero > pages.length) return;
    setPage(numero);
    ouvrir(null);
  }

  /**
   * Se porte sur un emplacement d'un changement, et ouvre le cadre qui le couvre.
   *
   * Le parcours boucle : arrivé au dernier, on revient au premier. C'est ce qui permet
   * de faire le tour d'une dénomination sans compter, et sans en oublier une.
   */
  function allerAuRang(changement: ChangementSuivi, rang: number) {
    const total = changement.emplacements.length;
    if (total === 0) return;

    const retenu = ((rang % total) + total) % total;
    const vise = changement.emplacements[retenu];
    setCurseurs((precedents) => ({ ...precedents, [changement.cle]: retenu }));
    setPage(vise.page);

    const couvrant = cadreCouvrant(retouches, vise);
    ouvrir(couvrant >= 0 ? couvrant : null);
  }

  /**
   * Pose un cadre sur un emplacement repéré resté découvert.
   *
   * Il en reste quand l'avocat a supprimé le cadre, ou l'a déplacé ailleurs : sans ce
   * geste, l'emplacement se voyait sur la page sans qu'on puisse rien y faire.
   */
  function couvrir(emplacement: Emplacement, propose: string) {
    if (surPoserEmplacement) {
      surPoserEmplacement(emplacement.cle, emplacement);
      return;
    }

    surChangement([
      ...retouches,
      {
        cle: emplacement.cle,
        page: emplacement.page,
        x: emplacement.x,
        y: emplacement.y,
        largeur: emplacement.largeur,
        hauteur: emplacement.hauteur,
        texte: propose,
        taille: emplacement.taille,
        police: "serif",
      },
    ]);
    setPage(emplacement.page);
  }

  if (!dimensions) return null;

  const surCettePage = retouches
    .map((retouche, index) => ({ retouche, index }))
    .filter(({ retouche }) => retouche.page === page);

  /** Les cadres qu'aucun changement ne réclame : posés à la main. */
  const libres = retouches
    .map((retouche, index) => ({ retouche, index }))
    .filter(({ retouche }) => !retouche.cle);

  /*
   * Les emplacements repérés que plus aucun cadre ne couvre, sur cette page.
   *
   * Ils se signalent d'un trait orange : un passage repéré puis découvert - le cadre
   * supprimé, ou traîné ailleurs - ne se voyait plus du tout, et l'ancienne valeur
   * serait restée dans le document produit sans que rien ne le dise.
   */
  const decouverts = changements.flatMap((c) =>
    c.emplacements
      .filter((e) => !e.couvert && e.page === page)
      .map((e) => ({ emplacement: e, propose: c.nouveau, titre: c.titre }))
  );

  /*
   * Les pages qui portent une retouche, avec l'article qu'elles visent.
   *
   * Sur des statuts de vingt-trois pages, les lister toutes sur le même plan oblige à
   * chercher la bonne à la main - le geste le plus long de tout le travail.
   */
  const aModifier = pages
    .map((p) => ({ page: p.numero, dessus: retouches.filter((r) => r.page === p.numero) }))
    .filter((p) => p.dessus.length > 0)
    .map((p) => ({
      ...p,
      articles: [
        ...new Set(
          p.dessus
            // Par la clé, non par le texte : celui-ci change dès qu'on écrit dedans.
            .map((r) => zones.find((z) => z.cle === r.cle)?.article)
            .filter((a): a is string => !!a)
        ),
      ],
    }));

  return (
    <div className={styles.editeur}>
      <div>
        {/* ---------- La navigation ---------- */}
        <div className={styles.acces}>
          <div className={styles.navigation}>
            <button
              type="button"
              className={styles.navFleche}
              onClick={() => allerA(page - 1)}
              disabled={page <= 1}
              aria-label="Page précédente"
              title="Page précédente"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 5 L8 12 L15 19" />
              </svg>
            </button>

            <span className={styles.navPosition}>
              Page <strong>{page}</strong> sur {pages.length}
            </span>

            <button
              type="button"
              className={styles.navFleche}
              onClick={() => allerA(page + 1)}
              disabled={page >= pages.length}
              aria-label="Page suivante"
              title="Page suivante"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 5 L16 12 L9 19" />
              </svg>
            </button>
          </div>

          {/* Les pages qui portent une retouche, pour y aller d'un clic. */}
          {aModifier.length > 0 && (
            <div className={styles.accesPages}>
              {aModifier.map((p) => (
                <button
                  key={p.page}
                  type="button"
                  className={
                    p.page === page
                      ? `${styles.accesPage} ${styles.accesPageActive}`
                      : styles.accesPage
                  }
                  onClick={() => allerA(p.page)}
                  title={p.articles.length > 0 ? p.articles.join(", ") : "Retouche libre"}
                >
                  {p.page}
                </button>
              ))}
            </div>
          )}

          <div className={styles.accesCommandes}>
            {surReprise && (
              <span className={styles.historiqueCommandes}>
                <button
                  type="button"
                  className={styles.navFleche}
                  onClick={() => surReprise(positionHistorique - 1)}
                  disabled={!peutRevenir(positionHistorique)}
                  aria-label="Revenir en arrière"
                  title="Revenir en arrière"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 14 L4 9 L9 4 M4 9 H14 a6 6 0 0 1 0 12 H8" />
                  </svg>
                </button>

                <button
                  type="button"
                  className={styles.navFleche}
                  onClick={() => surReprise(positionHistorique + 1)}
                  disabled={!peutAvancer(historique, positionHistorique)}
                  aria-label="Revenir en avant"
                  title="Revenir en avant"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M15 14 L20 9 L15 4 M20 9 H10 a6 6 0 0 0 0 12 H16" />
                  </svg>
                </button>

                <button
                  type="button"
                  className={
                    historiqueOuvert
                      ? `${styles.accesToutes} ${styles.accesRetablir}`
                      : styles.accesToutes
                  }
                  onClick={() => setHistoriqueOuvert((ouvert) => !ouvert)}
                  aria-expanded={historiqueOuvert}
                >
                  Historique
                </button>
              </span>
            )}

            {surRetraitDePage && (
              <button
                type="button"
                className={
                  retiree ? `${styles.accesToutes} ${styles.accesRetablir}` : styles.accesToutes
                }
                onClick={() =>
                  surRetraitDePage(
                    retiree
                      ? pagesRetirees.filter((p) => p !== page)
                      : [...pagesRetirees, page].sort((a, b) => a - b)
                  )
                }
              >
                {retiree ? "Remettre cette page" : "Retirer cette page"}
              </button>
            )}

            <button
              type="button"
              className={styles.accesToutes}
              onClick={() => setToutesLesPages((ouvert) => !ouvert)}
              aria-expanded={toutesLesPages}
            >
              {toutesLesPages ? "Masquer la liste" : "Toutes les pages"}
            </button>
          </div>
        </div>

        {toutesLesPages && (
          <div className={styles.editeurPages}>
            {pages.map((p) => {
              const marques = [
                retouches.some((r) => r.page === p.numero) ? styles.editeurPageMarquee : "",
                pagesRetirees.includes(p.numero) ? styles.editeurPageRetiree : "",
                p.numero === page ? styles.editeurPageActive : "",
              ].filter(Boolean);

              return (
                <button
                  key={p.numero}
                  type="button"
                  className={[styles.editeurPageNum, ...marques].join(" ")}
                  onClick={() => allerA(p.numero)}
                  title={
                    pagesRetirees.includes(p.numero) ? "Écartée du document produit" : undefined
                  }
                >
                  {p.numero}
                </button>
              );
            })}
          </div>
        )}

        {retiree && (
          <p className={styles.pageRetiree}>
            Cette page ne figurera pas dans les statuts à jour. Elle reste dans les
            statuts en vigueur, qui ne sont jamais modifiés.
          </p>
        )}

        {/* ---------- La page ---------- */}
        <div
          ref={cadre}
          className={styles.editeurPage}
          onPointerMove={suivre}
          onPointerUp={relacher}
          onPointerCancel={relacher}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={"/api/formalites/modification/page?dossier=" + dossier + "&page=" + page}
            alt={"Page " + page + " des statuts"}
            draggable={false}
          />

          {decouverts.map(({ emplacement, propose, titre }, rang) => (
            <button
              key={"decouvert-" + rang}
              type="button"
              className={styles.decouvert}
              style={{
                left: (emplacement.x / dimensions.largeur) * 100 + "%",
                top: (emplacement.y / dimensions.hauteur) * 100 + "%",
                width: (emplacement.largeur / dimensions.largeur) * 100 + "%",
                height: (emplacement.hauteur / dimensions.hauteur) * 100 + "%",
              }}
              title={titre + " : cliquez pour poser le cadre ici"}
              onClick={() => couvrir(emplacement, propose)}
            >
              <span className={styles.decouvertMot}>poser ici</span>
            </button>
          ))}

          {surCettePage.map(({ retouche, index }) => {
            const ouvert = index === choisie;
            const style = {
              left: (retouche.x / dimensions.largeur) * 100 + "%",
              top: (retouche.y / dimensions.hauteur) * 100 + "%",
              width: (retouche.largeur / dimensions.largeur) * 100 + "%",
              height: (retouche.hauteur / dimensions.hauteur) * 100 + "%",
              fontSize: retouche.taille * echelle + "px",
              fontFamily: FAMILLES[retouche.police ?? "serif"],
              fontWeight: retouche.gras ? 700 : 400,
              fontStyle: retouche.italique ? "italic" : "normal",
              textDecoration: retouche.souligne ? "underline" : "none",
              textAlign:
                retouche.alignement === "centre"
                  ? ("center" as const)
                  : retouche.alignement === "droite"
                    ? ("right" as const)
                    : ("left" as const),
            };

            /*
              Les poignées portent leur flèche.
              Un bord vert sans dessin ne dit pas qu'il se tire : on le prend pour une
              bordure. La flèche horizontale annonce la largeur, la verticale la
              hauteur, la diagonale les deux, et la croix le déplacement.
            */
            const poignees = (
              <>
                <span
                  className={styles.borddroit}
                  onPointerDown={(e) => commencerGeste(e, index, "largeur")}
                  title="Tirez pour élargir"
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 24 24" className={styles.flecheBord}>
                    <path d="M8 8 L4 12 L8 16 M16 8 L20 12 L16 16 M5 12 H19" />
                  </svg>
                </span>

                <span
                  className={styles.bordbas}
                  onPointerDown={(e) => commencerGeste(e, index, "hauteur")}
                  title="Tirez pour changer la hauteur"
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 24 24" className={styles.flecheBord}>
                    <path d="M8 8 L12 4 L16 8 M8 16 L12 20 L16 16 M12 5 V19" />
                  </svg>
                </span>

                {/*
                  Le coin ne s'affiche que si le cadre est assez haut pour le porter.
                  Sur un cadre de vingt pixels, les trois pastilles se chevauchent et
                  celle de la largeur devient inatteignable - or c'est la plus utile.
                */}
                {retouche.hauteur * echelle >= 34 && (
                  <span
                    className={styles.coin}
                    onPointerDown={(e) => commencerGeste(e, index, "coin")}
                    title="Tirez pour régler la taille"
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 24 24" className={styles.flecheCoin}>
                      <path d="M9 21 H21 V9 M21 21 L11 11" />
                    </svg>
                  </span>
                )}
              </>
            );

            if (!ouvert) {
              /*
                Le cadre fermé se saisit d'un bout à l'autre : on le tire pour le
                déplacer, on le lâche sans bouger pour écrire dedans. Devoir viser une
                poignée de dix pixels pour déplacer un trait de sept était le geste le
                plus pénible de l'écran.
              */
              return (
                <div
                  key={index}
                  role="button"
                  tabIndex={0}
                  /*
                    Rempli, le cadre montre le résultat : fond blanc, comme dans le
                    document. Vide, il reste transparent pour qu'on vérifie qu'il vise
                    le bon passage. Un cadre rempli et transparent superposait le
                    nouveau texte à l'ancien, et les deux devenaient illisibles.
                  */
                  className={
                    retouche.texte ? `${styles.repere} ${styles.repereRempli}` : styles.repere
                  }
                  style={style}
                  onPointerDown={(e) => commencerGeste(e, index, "deplacer")}
                  onClick={() => {
                    if (aGlisse.current) {
                      aGlisse.current = false;
                      return;
                    }
                    ouvrir(index);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      ouvrir(index);
                    }
                  }}
                  title="Tirez pour déplacer, cliquez pour écrire"
                >
                  <span
                    className={
                      retouche.texte
                        ? styles.repereTexte
                        : `${styles.repereTexte} ${styles.repereVide}`
                    }
                  >
                    {retouche.texte || "Cliquez pour écrire"}
                  </span>
                  {poignees}
                </div>
              );
            }

            return (
              <div key={index} className={styles.repereOuvert} style={style} data-cadre-ouvert>
                {/*
                  La poignée déplace, le reste du cadre se laisse écrire. Sans elle,
                  cliquer pour poser le curseur déplacerait le cadre.
                */}
                <span
                  className={styles.poignee}
                  onPointerDown={(e) => commencerGeste(e, index, "deplacer")}
                  title="Tirez pour déplacer le cadre"
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 24 24" className={styles.flechePoignee}>
                    <path d="M12 3 L9 6 M12 3 L15 6 M12 3 V21 M12 21 L9 18 M12 21 L15 18 M3 12 L6 9 M3 12 L6 15 M3 12 H21 M21 12 L18 9 M21 12 L18 15" />
                  </svg>
                </span>
                <SaisieRiche
                  ref={saisie}
                  retouche={retouche}
                  alignement={style.textAlign}
                  surChangement={(changement) => modifier(index, changement)}
                  surSortie={() => ouvrir(null)}
                />

                {/*
                  Les deux commandes du cadre, au bord du cadre qu'elles servent.
                  Supprimer n'était atteignable qu'en ouvrant la barre de mise en
                  forme : trois gestes, dont deux sans rapport, pour défaire un cadre
                  posé au mauvais endroit.
                */}
                <span className={styles.appels}>
                  <button
                    type="button"
                    className={styles.appelForme}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setFormeOuverte((ouvert) => !ouvert)}
                    aria-expanded={formeOuverte}
                    aria-label="Mise en forme"
                    title="Mise en forme"
                  >
                    Aa
                  </button>

                  <button
                    type="button"
                    className={styles.appelRetrait}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => retirer(index)}
                    aria-label="Supprimer ce cadre"
                    title="Supprimer ce cadre"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </span>

                {formeOuverte && (
                  <MiseEnForme
                    retouche={retouche}
                    styleDuCurseur={styleDuCurseur}
                    surStyle={(commande) => appliquerAuTexte(commande, index)}
                    surChangement={(changement) => modifier(index, changement)}
                  />
                )}

                {poignees}
              </div>
            );
          })}
        </div>

      </div>

      {/* ---------- Le panneau : tout ce qui n'est pas la page ---------- */}
      <div className={styles.editeurPanneau}>
        {historiqueOuvert && surReprise ? (
          /*
            L'historique remplace le panneau plutôt que de s'y ajouter : on y va pour
            retrouver un geste, non pour continuer à en poser.
          */
          <div className={styles.historique}>
            <div className={styles.historiqueTete}>
              <h3 className={styles.editeurTitre}>Historique</h3>
              <button
                type="button"
                className={styles.accesToutes}
                onClick={() => setHistoriqueOuvert(false)}
              >
                Fermer
              </button>
            </div>

            {historique.length === 0 && (
              <p className={styles.editeurAide}>
                Rien n&apos;est encore inscrit. Chaque geste - un cadre posé, un texte
                réécrit, une page écartée - apparaîtra ici, avec son heure et son auteur.
              </p>
            )}

            <ol className={styles.historiqueListe}>
              {[...historique].reverse().map((etape, rangInverse) => {
                const rang = historique.length - 1 - rangInverse;
                return (
                  <li key={rang}>
                    <button
                      type="button"
                      className={
                        rang === positionHistorique
                          ? `${styles.historiqueEtape} ${styles.historiqueEtapeCourante}`
                          : styles.historiqueEtape
                      }
                      onClick={() => surReprise(rang)}
                    >
                      <span className={styles.historiqueLibelle}>{etape.libelle}</span>
                      <span className={styles.historiqueQuand}>
                        {quandLisible(etape.quand)} - {etape.qui}
                      </span>
                      {rang === positionHistorique && (
                        <span className={styles.historiqueMarque}>état actuel</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>

            <p className={styles.editeurAide}>
              Cliquez sur une étape pour y revenir. Rien n&apos;est perdu : les étapes
              suivantes restent tant qu&apos;aucune nouvelle retouche n&apos;est posée.
            </p>
          </div>
        ) : (
          <>
        {entete}

        {reconnus && (
          <p className={styles.reconnu}>
            Ces statuts ont été lus par reconnaissance de caractères : le document déposé
            n&apos;a pas de couche texte. Vérifiez chaque emplacement avant d&apos;appliquer.
          </p>
        )}

        {/*
          Le suivi se lit par changement, non par cadre.
          « 2 sur 2 remplacements posés » se lisait à côté d'une durée qui n'était pas
          faite et d'une dénomination couverte à un endroit sur quatorze : le décompte
          des cadres ne dit rien de l'avancement, seul celui des changements le dit.
        */}
        <ul className={styles.suiviListe}>
          {changements.map((changement) => {
            const manque = introuvables.find((i) => i.recherche.cle === changement.cle);
            const rangs = changement.emplacements;
            const courant = curseurs[changement.cle] ?? 0;
            const vise = rangs[Math.min(courant, rangs.length - 1)];

            return (
              <li key={changement.cle} className={styles.suiviCarte} data-etat={changement.etat}>
                <div className={styles.suiviTete}>
                  <span className={styles.suiviTitre}>{changement.titre}</span>
                  <span className={styles.suiviEtatBadge}>{ETATS[changement.etat].libelle}</span>
                </div>

                <p className={styles.suiviValeurs}>
                  <span className={styles.suiviAvant}>{changement.ancien}</span>
                  <span className={styles.suiviFleche} aria-hidden="true">
                    →
                  </span>
                  <span className={styles.suiviApres}>{changement.nouveau}</span>
                </p>

                {changement.situe ? (
                  <>
                    <div className={styles.suiviJauge}>
                      <span
                        className={styles.suiviJaugeRempli}
                        style={{
                          width: (changement.couverts / rangs.length) * 100 + "%",
                        }}
                      />
                    </div>
                    <p className={styles.suiviCompte}>
                      {changement.couverts} sur {rangs.length}{" "}
                      {rangs.length === 1 ? "emplacement couvert" : "emplacements couverts"}
                    </p>

                    {/*
                      On parcourt les emplacements d'un changement l'un après l'autre.
                      Chercher soi-même la douzième occurrence d'un nom dans vingt-trois
                      pages est le moyen le plus sûr d'en oublier une.
                    */}
                    <div className={styles.suiviNav}>
                      <button
                        type="button"
                        className={styles.suiviNavFleche}
                        aria-label="Emplacement précédent"
                        disabled={rangs.length < 2}
                        onClick={() => allerAuRang(changement, courant - 1)}
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        className={styles.suiviNavCentre}
                        onClick={() => allerAuRang(changement, courant)}
                      >
                        {rangs.length === 1
                          ? "Voir, page " + vise.page
                          : "Emplacement " +
                            (Math.min(courant, rangs.length - 1) + 1) +
                            " sur " +
                            rangs.length +
                            " - page " +
                            vise.page}
                        {!vise.couvert && (
                          <span className={styles.suiviNavAlerte}>découvert</span>
                        )}
                      </button>
                      <button
                        type="button"
                        className={styles.suiviNavFleche}
                        aria-label="Emplacement suivant"
                        disabled={rangs.length < 2}
                        onClick={() => allerAuRang(changement, courant + 1)}
                      >
                        ›
                      </button>
                    </div>
                  </>
                ) : (
                  <div className={styles.suiviManque}>
                    {/*
                      L'action d'abord, l'explication ensuite.
                      « Rien trouvé pour X. À poser à la main. » disait un échec avant
                      de dire quoi faire, et donnait à un cas ordinaire - les statuts
                      formulent librement - l'air d'un incident.
                    */}
                    <p className={styles.suiviCherche}>
                      <strong className={styles.suiviAction}>Placez le cadre vous-même</strong>{" "}
                      : ces statuts écrivent la valeur autrement que
                      « {manque?.recherche.cherche ?? changement.ancien} »
                      {manque?.recherche.variantes?.length ? " ou ses variantes" : ""}.
                    </p>

                    {surPlacer && manque && (
                      <button
                        type="button"
                        className={styles.editeurPlacer}
                        onClick={() => surPlacer(manque)}
                      >
                        {manque.article
                          ? "Poser le cadre à l'article, page " + manque.article.page
                          : "Poser un cadre sur la page " + page}
                      </button>
                    )}
                  </div>
                )}

                {/*
                  La coche est celle de l'avocat, non de la machine.
                  Cocher tout seul dès que les cadres sont posés donnerait une assurance
                  fausse : le repérage peut manquer une occurrence écrite autrement, et
                  un cadre peut contenir n'importe quoi. Elle clôt la carte, en pleine
                  largeur - c'est le geste qui engage, il ne se coince pas dans un coin.
                */}
                {surVerifier && (
                  <label className={styles.suiviCoche}>
                    <input
                      type="checkbox"
                      checked={changement.confirme}
                      onChange={(e) => surVerifier(changement.cle, e.target.checked)}
                    />
                    <span className={styles.suiviCocheMot}>
                      {changement.confirme ? "Fait" : "Marquer comme fait"}
                    </span>
                  </label>
                )}
              </li>
            );
          })}
        </ul>

        {/*
          Les cadres qu'aucun changement ne réclame : ajoutés à la main, ils ne
          répondent de rien et se perdraient si le panneau ne les montrait plus.
        */}
        {libres.length > 0 && (
          <div className={styles.suiviLibres}>
            <h4 className={styles.suiviLibresTitre}>Cadres libres</h4>
            <ul className={styles.editeurListe}>
              {libres.map(({ retouche, index }) => (
                <li key={"libre-" + index}>
                  <button
                    type="button"
                    className={
                      index === choisie
                        ? `${styles.editeurZone} ${styles.editeurZoneChoisie}`
                        : styles.editeurZone
                    }
                    onClick={() => {
                      setPage(retouche.page);
                      ouvrir(index);
                    }}
                  >
                    <span className={styles.editeurZoneTete}>
                      <span className={styles.editeurZoneArticle}>Cadre libre</span>
                      <span className={styles.editeurZonePage}>page {retouche.page}</span>
                    </span>
                    <span className={styles.editeurZoneApres}>
                      {retouche.texte || "Texte à saisir"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button type="button" className={styles.editeurAjouter} onClick={ajouter}>
          + Cadre libre sur la page {page}
        </button>

        <p className={styles.editeurAide}>
          Cliquez dans un cadre vert pour écrire. La poignée de gauche le déplace, les
          carrés de la bordure le redimensionnent. Dans le document, son fond est blanc et
          couvre l&apos;ancienne valeur.
        </p>
          </>
        )}
      </div>
    </div>
  );
}
