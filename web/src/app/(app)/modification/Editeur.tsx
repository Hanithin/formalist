"use client";

import { useEffect, useRef, useState } from "react";
import type { Retouche, Zone } from "@/domain/modification/edition";
import styles from "./Modification.module.css";

/**
 * L'éditeur de statuts.
 *
 * Les statuts s'affichent page par page, en image. Les passages à changer sont
 * repérés et couverts d'un rectangle blanc portant le nouveau texte. On les déplace à
 * la souris, on corrige le texte à la frappe, et l'on applique.
 *
 * Le rectangle est peint en blanc opaque, comme il le sera dans le document : un
 * aperçu translucide laisserait croire que l'ancien texte reste visible. Ce qui
 * s'affiche ici est ce que le greffe recevra.
 *
 * Les coordonnées vivent en points PDF, origine en haut à gauche - celles que rend
 * pdftotext et qu'attend l'application. L'affichage les traduit en pourcentages de la
 * page : l'image se redimensionne avec la fenêtre, les retouches suivent, et rien ne
 * dépend de la taille à laquelle on a travaillé.
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

export function Editeur({ dossier, pages, zones, retouches, reconnus, surChangement }: Props) {
  /*
   * On ouvre sur la première page qui porte une retouche.
   *
   * Ouvrir sur la page 1 quand tout se joue page 4 donnerait à croire que rien n'a
   * été repéré. Le calcul se fait à l'initialisation plutôt que dans un effet : un
   * setState posé dans un effet provoque un second rendu pour rien.
   */
  const [page, setPage] = useState(retouches[0]?.page ?? pages[0]?.numero ?? 1);
  const [choisie, setChoisie] = useState<number | null>(retouches.length ? 0 : null);
  const cadre = useRef<HTMLDivElement>(null);
  const deplacement = useRef<{ index: number; dx: number; dy: number } | null>(null);
  /*
   * Le rapport entre la page affichée et la page en points.
   *
   * Les positions et les largeurs s'expriment en pourcentages, qui suivent seuls le
   * redimensionnement. La taille du texte, elle, ne se dit pas en pourcentage : il
   * faut un nombre de pixels, donc l'échelle réelle du moment.
   */
  const [echelle, setEchelle] = useState(1);

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

  function commencerDeplacement(evenement: React.PointerEvent, index: number) {
    evenement.preventDefault();
    evenement.stopPropagation();
    const point = enPoints(evenement);
    if (!point) return;

    setChoisie(index);
    deplacement.current = {
      index,
      dx: point.x - retouches[index].x,
      dy: point.y - retouches[index].y,
    };
    (evenement.target as Element).setPointerCapture(evenement.pointerId);
  }

  function suivre(evenement: React.PointerEvent) {
    const encours = deplacement.current;
    if (!encours || !dimensions) return;

    const point = enPoints(evenement);
    if (!point) return;

    const retouche = retouches[encours.index];
    // La retouche reste dans la page : au-delà, elle ne couvrirait plus rien et
    // l'ancienne valeur resterait lisible dans le document déposé.
    const x = Math.min(Math.max(0, point.x - encours.dx), dimensions.largeur - retouche.largeur);
    const y = Math.min(Math.max(0, point.y - encours.dy), dimensions.hauteur - retouche.hauteur);
    modifier(encours.index, { x, y });
  }

  function relacher() {
    deplacement.current = null;
  }

  /** Ajoute une retouche vide au centre de la page, pour ce que rien n'a repéré. */
  function ajouter() {
    if (!dimensions) return;
    const nouvelle: Retouche = {
      page,
      x: dimensions.largeur * 0.15,
      y: dimensions.hauteur * 0.45,
      largeur: dimensions.largeur * 0.5,
      hauteur: 14,
      texte: "",
      taille: 11,
    };
    surChangement([...retouches, nouvelle]);
    setChoisie(retouches.length);
  }

  const surCettePage = retouches
    .map((retouche, index) => ({ retouche, index }))
    .filter(({ retouche }) => retouche.page === page);

  const active = choisie !== null ? retouches[choisie] : null;

  if (!dimensions) return null;

  return (
    <div className={styles.editeur}>
      <div>
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
              onClick={() => setPage(p.numero)}
            >
              {p.numero}
              {retouches.some((r) => r.page === p.numero) ? " •" : ""}
            </button>
          ))}
        </div>

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

          {surCettePage.map(({ retouche, index }) => (
            <div
              key={index}
              className={
                index === choisie ? `${styles.retouche} ${styles.retoucheChoisie}` : styles.retouche
              }
              style={{
                left: (retouche.x / dimensions.largeur) * 100 + "%",
                top: (retouche.y / dimensions.hauteur) * 100 + "%",
                width: (retouche.largeur / dimensions.largeur) * 100 + "%",
                height: (retouche.hauteur / dimensions.hauteur) * 100 + "%",
                fontSize: retouche.taille * echelle + "px",
              }}
              onPointerDown={(e) => commencerDeplacement(e, index)}
            >
              <span className={styles.retoucheTexte}>{retouche.texte}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.editeurPanneau}>
        <h3 className={styles.editeurTitre}>Ce qui change dans les statuts</h3>
        <p className={styles.editeurAide}>
          Chaque bloc couvre l&apos;ancienne valeur et porte la nouvelle. Faites-le glisser
          pour l&apos;ajuster, corrigez le texte ci-dessous.
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
                    setChoisie(index);
                    setPage(retouche.page);
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

        {active && choisie !== null && (
          <>
            <div className={styles.editeurChamp}>
              <label htmlFor="retouche-texte">Nouveau texte</label>
              <input
                id="retouche-texte"
                value={active.texte}
                onChange={(e) => modifier(choisie, { texte: e.target.value })}
              />
            </div>
            <div className={styles.editeurChamp}>
              <label htmlFor="retouche-taille">Taille du texte</label>
              <input
                id="retouche-taille"
                type="number"
                min={6}
                max={30}
                step={0.5}
                value={active.taille}
                onChange={(e) =>
                  modifier(choisie, { taille: Math.min(30, Math.max(6, Number(e.target.value))) })
                }
              />
            </div>
            <div className={styles.editeurChamp}>
              <label htmlFor="retouche-largeur">Largeur du bloc</label>
              <input
                id="retouche-largeur"
                type="number"
                min={10}
                max={Math.round(dimensions.largeur)}
                value={Math.round(active.largeur)}
                onChange={(e) =>
                  modifier(choisie, {
                    largeur: Math.min(
                      dimensions.largeur - active.x,
                      Math.max(10, Number(e.target.value))
                    ),
                  })
                }
              />
            </div>

            <button type="button" className={styles.editeurZone} onClick={() => retirer(choisie)}>
              Retirer cette retouche
            </button>
          </>
        )}

        <button type="button" className={styles.editeurZone} onClick={ajouter}>
          Ajouter une retouche
        </button>
      </div>
    </div>
  );
}
