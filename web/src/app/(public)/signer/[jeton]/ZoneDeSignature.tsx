"use client";

import { useRef, useState, useTransition } from "react";
import styles from "./Signature.module.css";

/**
 * Zone de signature.
 *
 * Le tracé est capturé sur un canevas et envoyé en PNG. Rien d'autre n'est
 * accepté côté serveur : la signature finit dans un document Word, on n'y injecte
 * pas de contenu arbitraire.
 */
export function ZoneDeSignature({ jeton }: { jeton: string }) {
  const canevas = useRef<HTMLCanvasElement>(null);
  const [aTrace, setATrace] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();

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

  function envoyer() {
    const c = canevas.current;
    if (!c || !aTrace) {
      setRetour({ ok: false, texte: "Tracez votre signature avant de valider" });
      return;
    }

    demarrer(async () => {
      const reponse = await fetch("/api/signature/signer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jeton, trace: c.toDataURL("image/png") }),
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

  return (
    <div className={styles.zone}>
      <p id="consigne">Tracez votre signature dans le cadre.</p>
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

      <div className={styles.actions}>
        <button type="button" onClick={effacer} disabled={enCours}>
          Effacer
        </button>
        <button type="button" className={styles.principal} onClick={envoyer} disabled={enCours}>
          {enCours ? "Enregistrement" : "Valider ma signature"}
        </button>
      </div>

      {retour && !retour.ok && <p role="alert">{retour.texte}</p>}
    </div>
  );
}
