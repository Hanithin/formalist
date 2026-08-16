"use client";

import { useEffect, useRef, useState } from "react";
import { POLICES, type Police, type Retouche, type Zone } from "@/domain/modification/edition";
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
}

/** Les familles, telles que le navigateur les rend, au plus près du PDF produit. */
const FAMILLES: Record<Police, string> = {
  serif: '"Times New Roman", Times, serif',
  sans: "Helvetica, Arial, sans-serif",
  mono: "Courier, monospace",
};

export function Editeur({ dossier, pages, zones, retouches, reconnus, surChangement }: Props) {
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
        body: JSON.stringify({ dossier, retouches }),
      }).catch(() => {
        // Un enregistrement manqué n'interrompt pas le travail : la prochaine frappe
        // le retentera, et « Appliquer » envoie de toute façon l'état complet.
      });
    }, 1000);

    return () => clearTimeout(minuteur);
  }, [dossier, retouches]);

  const [page, setPage] = useState(retouches[0]?.page ?? pages[0]?.numero ?? 1);
  const [choisie, setChoisie] = useState<number | null>(null);
  const [toutesLesPages, setToutesLesPages] = useState(false);
  const cadre = useRef<HTMLDivElement>(null);
  const saisie = useRef<HTMLInputElement>(null);
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

  function modifier(index: number, changement: Partial<Retouche>) {
    surChangement(retouches.map((r, i) => (i === index ? { ...r, ...changement } : r)));
  }

  function retirer(index: number) {
    surChangement(retouches.filter((_, i) => i !== index));
    setChoisie(null);
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
    surChangement([
      ...retouches,
      {
        page,
        x: dimensions.largeur * 0.15,
        y: dimensions.hauteur * 0.45,
        largeur: dimensions.largeur * 0.55,
        hauteur: 14,
        texte: "",
        taille: 11,
        police: "serif",
      },
    ]);
    setChoisie(retouches.length);
  }

  if (!dimensions) return null;

  const surCettePage = retouches
    .map((retouche, index) => ({ retouche, index }))
    .filter(({ retouche }) => retouche.page === page);

  const active = choisie !== null ? retouches[choisie] : null;

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
            .map((r) => zones.find((z) => z.propose === r.texte)?.article)
            .filter((a): a is string => !!a)
        ),
      ],
    }));

  return (
    <div className={styles.editeur}>
      <div>
        {/* ---------- L'accès rapide ---------- */}
        <div className={styles.acces}>
          {aModifier.length > 0 ? (
            <>
              <span className={styles.accesTitre}>
                {aModifier.length === 1
                  ? "1 page à modifier"
                  : aModifier.length + " pages à modifier"}
              </span>
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
                    onClick={() => {
                      setPage(p.page);
                      setChoisie(null);
                    }}
                  >
                    <span className={styles.accesNumero}>Page {p.page}</span>
                    <span className={styles.accesArticle}>
                      {p.articles.length > 0 ? p.articles.join(", ") : "Retouche libre"}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <span className={styles.accesTitre}>Aucun cadre posé pour le moment</span>
          )}

          <button
            type="button"
            className={styles.accesToutes}
            onClick={() => setToutesLesPages((ouvert) => !ouvert)}
            aria-expanded={toutesLesPages}
          >
            {toutesLesPages ? "Masquer les autres pages" : "Voir les " + pages.length + " pages"}
          </button>
        </div>

        {toutesLesPages && (
          <div className={styles.editeurPages}>
            {pages.map((p) => (
              <button
                key={p.numero}
                type="button"
                className={
                  p.numero === page
                    ? `${styles.editeurPageNum} ${styles.editeurPageActive}`
                    : styles.editeurPageNum
                }
                onClick={() => {
                  setPage(p.numero);
                  setChoisie(null);
                }}
              >
                {p.numero}
                {retouches.some((r) => r.page === p.numero) ? " •" : ""}
              </button>
            ))}
          </div>
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
            };

            const poignees = (
              <>
                {/* Les bords se tirent : la largeur, la hauteur, ou les deux. */}
                <span
                  className={styles.borddroit}
                  onPointerDown={(e) => commencerGeste(e, index, "largeur")}
                  title="Régler la largeur"
                  aria-hidden="true"
                />
                <span
                  className={styles.bordbas}
                  onPointerDown={(e) => commencerGeste(e, index, "hauteur")}
                  title="Régler la hauteur"
                  aria-hidden="true"
                />
                <span
                  className={styles.coin}
                  onPointerDown={(e) => commencerGeste(e, index, "coin")}
                  title="Régler la taille"
                  aria-hidden="true"
                />
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
                    setChoisie(index);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setChoisie(index);
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
              <div key={index} className={styles.repereOuvert} style={style}>
                {/*
                  La poignée déplace, le reste du cadre se laisse écrire. Sans elle,
                  cliquer pour poser le curseur déplacerait le cadre.
                */}
                <span
                  className={styles.poignee}
                  onPointerDown={(e) => commencerGeste(e, index, "deplacer")}
                  title="Déplacer"
                  aria-hidden="true"
                />
                <input
                  ref={saisie}
                  className={styles.repereSaisie}
                  value={retouche.texte}
                  onChange={(e) => modifier(index, { texte: e.target.value })}
                  onBlur={() => setChoisie(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" || e.key === "Enter") e.currentTarget.blur();
                  }}
                />
                {poignees}
              </div>
            );
          })}
        </div>

        {/* ---------- La mise en forme ---------- */}
        {active && choisie !== null && (
          <div className={styles.miseEnForme}>
            <select
              aria-label="Police"
              value={active.police ?? "serif"}
              onChange={(e) => modifier(choisie, { police: e.target.value as Police })}
              onMouseDown={(e) => e.preventDefault()}
            >
              {POLICES.map((p) => (
                <option key={p.valeur} value={p.valeur}>
                  {p.libelle}
                </option>
              ))}
            </select>

            <input
              type="number"
              aria-label="Taille du texte"
              min={6}
              max={30}
              step={0.5}
              value={active.taille}
              onChange={(e) =>
                modifier(choisie, { taille: Math.min(30, Math.max(6, Number(e.target.value))) })
              }
            />

            <button
              type="button"
              className={active.gras ? `${styles.style} ${styles.styleActif}` : styles.style}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => modifier(choisie, { gras: !active.gras })}
              aria-pressed={active.gras ?? false}
              title="Gras"
            >
              <strong>G</strong>
            </button>

            <button
              type="button"
              className={active.italique ? `${styles.style} ${styles.styleActif}` : styles.style}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => modifier(choisie, { italique: !active.italique })}
              aria-pressed={active.italique ?? false}
              title="Italique"
            >
              <em>I</em>
            </button>

            <button
              type="button"
              className={`${styles.style} ${styles.styleDanger}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => retirer(choisie)}
            >
              Retirer
            </button>
          </div>
        )}
      </div>

      {/* ---------- Le panneau ---------- */}
      <div className={styles.editeurPanneau}>
        <h3 className={styles.editeurTitre}>Ce qui change dans les statuts</h3>
        <p className={styles.editeurAide}>
          Les cadres verts marquent les passages à remplacer. Cliquez dedans pour écrire ;
          la poignée à gauche les déplace. Dans le document produit, le fond du cadre est
          blanc et couvre l&apos;ancienne valeur.
        </p>

        {reconnus && (
          <p className={styles.reconnu}>
            Ces statuts ont été lus par reconnaissance de caractères : le document déposé
            n&apos;a pas de couche texte. Vérifiez chaque emplacement avant d&apos;appliquer.
          </p>
        )}

        <ul className={styles.editeurListe}>
          {retouches.map((retouche, index) => {
            const zone = zones.find((z) => z.propose === retouche.texte);
            return (
              <li key={index}>
                <button
                  type="button"
                  className={
                    index === choisie
                      ? `${styles.editeurZone} ${styles.editeurZoneChoisie}`
                      : styles.editeurZone
                  }
                  onClick={() => {
                    setPage(retouche.page);
                    setChoisie(index);
                  }}
                >
                  <span className={styles.editeurZoneArticle}>
                    {zone?.article || "Retouche"} - page {retouche.page}
                  </span>
                  {zone?.trouve && <span className={styles.editeurZoneAvant}>{zone.trouve}</span>}
                  <span className={styles.editeurZoneApres}>
                    {retouche.texte || "Texte à saisir"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <button type="button" className={styles.editeurZone} onClick={ajouter}>
          Ajouter un cadre sur cette page
        </button>
      </div>
    </div>
  );
}
