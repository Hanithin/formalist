"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import styles from "./Signature.module.css";

/**
 * Zone de signature.
 *
 * Deux façons de signer, et la première n'existait pas. Il fallait tracer à la souris :
 * sur un ordinateur, cela donne un gribouillis qui ne ressemble à rien de ce qu'on
 * signe à la main, et personne ne recommence trois fois. Taper son nom et le voir
 * rendu d'une écriture manuscrite est ce que tout le monde connaît, et c'est ce que
 * l'usage a retenu.
 *
 * Le paraphe accompagne la signature : c'est lui qui se pose au bas de chaque page, et
 * qui distingue un acte paraphé d'un acte simplement signé en dernière page.
 *
 * Les deux sortent en PNG, comme le tracé d'origine : le serveur n'accepte rien
 * d'autre, puisque l'image finit dans un document Word.
 */

interface Police {
  cle: string;
  nom: string;
  famille: string;
}

export function ZoneDeSignature({
  jeton,
  nom,
  polices,
}: {
  jeton: string;
  /** Le nom tel que le dossier le porte : c'est celui qui doit signer. */
  nom: string;
  polices: Police[];
}) {
  const [mode, setMode] = useState<"saisir" | "dessiner">("saisir");
  const [saisi, setSaisi] = useState(nom);
  const [police, setPolice] = useState(polices[0]?.cle ?? "");
  const [pretes, setPretes] = useState(false);

  const canevas = useRef<HTMLCanvasElement>(null);
  const [aTrace, setATrace] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();

  const familleChoisie = polices.find((p) => p.cle === police)?.famille ?? "cursive";

  /*
   * On ne peint pas un texte avec une police qui n'est pas encore là.
   *
   * Un canevas dessiné avant le chargement retombe sur la police système : la
   * prévisualisation montrerait une écriture manuscrite et le PNG envoyé porterait de
   * l'Arial. On attend que le navigateur les déclare prêtes.
   */
  useEffect(() => {
    let vivant = true;
    void Promise.all(polices.map((p) => document.fonts.load("600 64px " + p.famille, "Ag"))).then(
      () => {
        if (vivant) setPretes(true);
      }
    );
    return () => {
      vivant = false;
    };
  }, [polices]);

  /** « Jean Dupont » donne « JD » ; un nom seul donne sa première lettre. */
  function initiales(valeur: string): string {
    const mots = valeur.trim().split(/\s+/).filter(Boolean);
    if (mots.length === 0) return "";
    const premiere = mots[0][0] ?? "";
    const derniere = mots.length > 1 ? (mots[mots.length - 1][0] ?? "") : "";
    return (premiere + derniere).toUpperCase();
  }

  /**
   * Peint un texte manuscrit sur un canevas hors écran, et le rend en PNG.
   *
   * La taille s'ajuste au texte plutôt que l'inverse : un nom long rétrécit jusqu'à
   * tenir, sans jamais déborder du cadre où il s'apposera.
   */
  function enImage(texte: string, largeur: number, hauteur: number): string | null {
    const propre = texte.trim();
    if (!propre) return null;

    const c = document.createElement("canvas");
    /* Deux fois la taille d'affichage : l'image finit dans un document imprimé. */
    c.width = largeur * 2;
    c.height = hauteur * 2;
    const ctx = c.getContext("2d");
    if (!ctx) return null;

    ctx.scale(2, 2);
    ctx.fillStyle = "#18181b";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    let taille = Math.round(hauteur * 0.62);
    do {
      ctx.font = "600 " + taille + "px " + familleChoisie;
      if (ctx.measureText(propre).width <= largeur - 24) break;
      taille -= 2;
    } while (taille > 12);

    ctx.fillText(propre, largeur / 2, hauteur / 2 + hauteur * 0.04);
    return c.toDataURL("image/png");
  }

  /* ---------------------------------------------------------------- Le tracé */

  function contexte() {
    const c = canevas.current;
    if (!c) return null;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#18181b";
    }
    return ctx;
  }

  function position(e: React.PointerEvent<HTMLCanvasElement>) {
    const cadre = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - cadre.left, y: e.clientY - cadre.top };
  }

  function commencer(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = contexte();
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = position(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setATrace(true);
  }

  function tracer(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.buttons === 0) return;
    const ctx = contexte();
    if (!ctx) return;
    const { x, y } = position(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function effacer() {
    const c = canevas.current;
    const ctx = contexte();
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    setATrace(false);
    setRetour(null);
  }

  /* ------------------------------------------------------------ L'envoi */

  function envoyer() {
    setRetour(null);

    /*
     * Le paraphe se déduit du nom dans les deux cas.
     *
     * Même en traçant sa signature, on ne fait pas tracer ses initiales une seconde
     * fois : c'est précisément ce que l'usage a supprimé, et deux gribouillis à la
     * souris valent moins qu'un paraphe lisible.
     */
    const paraphe = enImage(initiales(mode === "saisir" ? saisi : nom), 120, 90);

    let trace: string | null;
    if (mode === "saisir") {
      trace = enImage(saisi, 520, 180);
      if (!trace) {
        setRetour({ ok: false, texte: "Saisissez votre nom avant de valider" });
        return;
      }
    } else {
      const c = canevas.current;
      if (!c || !aTrace) {
        setRetour({ ok: false, texte: "Tracez votre signature avant de valider" });
        return;
      }
      trace = c.toDataURL("image/png");
    }

    demarrer(async () => {
      const reponse = await fetch("/api/signature/signer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jeton, trace, paraphe }),
      });
      const corps = await reponse.json().catch(() => ({}));

      setRetour(
        reponse.ok
          ? {
              ok: true,
              texte: corps.complet
                ? "Signature enregistrée. Tous les associés ont signé, le dossier peut avancer."
                : "Signature enregistrée. Nous attendons encore les autres associés.",
            }
          : { ok: false, texte: corps.error ?? "La signature n'a pas pu être enregistrée" }
      );
    });
  }

  if (retour?.ok) {
    return (
      <p role="status" className={styles.confirmation}>
        {retour.texte}
      </p>
    );
  }

  const apercu = { fontFamily: familleChoisie };

  return (
    <div className={styles.zone}>
      <div className={styles.modes} role="tablist" aria-label="Comment signer">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "saisir"}
          className={mode === "saisir" ? styles.modeActif : styles.mode}
          onClick={() => setMode("saisir")}
        >
          Saisir mon nom
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "dessiner"}
          className={mode === "dessiner" ? styles.modeActif : styles.mode}
          onClick={() => setMode("dessiner")}
        >
          Dessiner
        </button>
      </div>

      {mode === "saisir" ? (
        <>
          <label className={styles.libelle} htmlFor="nom-signataire">
            Votre nom, tel qu&apos;il figure aux actes
          </label>
          <input
            id="nom-signataire"
            className={styles.champ}
            value={saisi}
            autoComplete="name"
            onChange={(e) => setSaisi(e.target.value)}
          />

          <div className={styles.apercus}>
            <div className={styles.apercu}>
              <span className={styles.apercuLibelle}>Signature</span>
              <span className={styles.apercuTexte} style={apercu}>
                {saisi.trim() || "Votre nom"}
              </span>
            </div>
            <div className={`${styles.apercu} ${styles.apercuParaphe}`}>
              <span className={styles.apercuLibelle}>Paraphe</span>
              <span className={styles.apercuTexte} style={apercu}>
                {initiales(saisi) || "—"}
              </span>
            </div>
          </div>

          {/* Un groupe de boutons radio plutôt qu'un fieldset : sa légende laisse un
              trait résiduel que la remise à zéro des bordures ne rattrape pas. */}
          <p className={styles.libelle} id="titre-ecriture">
            Écriture
          </p>
          <div className={styles.polices} role="radiogroup" aria-labelledby="titre-ecriture">
            {polices.map((p) => (
              <label key={p.cle} className={styles.policeChoix}>
                <input
                  type="radio"
                  name="police"
                  value={p.cle}
                  checked={police === p.cle}
                  onChange={() => setPolice(p.cle)}
                />
                <span style={{ fontFamily: p.famille }}>{saisi.trim() || p.nom}</span>
              </label>
            ))}
          </div>
        </>
      ) : (
        <>
          <p id="consigne" className={styles.libelle}>
            Tracez votre signature dans le cadre.
          </p>
          <canvas
            ref={canevas}
            width={520}
            height={180}
            className={styles.canevas}
            aria-label="Zone de signature"
            aria-describedby="consigne"
            onPointerDown={commencer}
            onPointerMove={tracer}
          />
          {/* Le paraphe reste saisi : deux gribouillis à la souris valent moins qu'un
              paraphe lisible, et c'est ce que l'usage a supprimé. */}
          <p className={styles.precision}>
            Votre paraphe <strong style={apercu}>{initiales(nom) || "—"}</strong> sera apposé au bas
            de chaque page.
          </p>
        </>
      )}

      <div className={styles.actions}>
        {mode === "dessiner" && (
          <button type="button" onClick={effacer} disabled={enCours}>
            Effacer
          </button>
        )}
        <button
          type="button"
          className={styles.principal}
          onClick={envoyer}
          disabled={enCours || (mode === "saisir" && !pretes)}
        >
          {enCours ? "Enregistrement" : "Valider ma signature"}
        </button>
      </div>

      {retour && !retour.ok && <p role="alert">{retour.texte}</p>}
    </div>
  );
}
