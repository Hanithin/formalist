"use client";

/**
 * Le filet sous le filet.
 *
 * `(app)/error.tsx` rattrape ce qui casse à l'intérieur d'un écran. Quand l'incident
 * remonte plus haut - une mise à jour d'état qui échoue hors du rendu d'un segment,
 * une erreur pendant que React reconstruit l'arbre - ce filet-là n'est plus monté, et
 * Next cherche celui de la racine. Il n'existait pas : la page se vidait, la barre
 * latérale restait, et rien ne disait ce qui s'était passé ni comment repartir. On
 * était obligé de recharger à la main pour retrouver son écran.
 *
 * Un fichier de ce nom doit rendre sa propre coquille : il remplace la mise en page
 * entière, y compris `<html>` et `<body>`.
 *
 * Le détail part aussi dans la console : sans lui, un incident qui ne se reproduit pas
 * chez nous ne laisse aucune trace exploitable de ce qui l'a causé.
 */
export default function PanneGenerale({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (typeof window !== "undefined") {
    console.error("[Formalist] L'écran s'est interrompu :", error);
  }

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 24px",
          background: "#fff",
          color: "#18181b",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <main style={{ maxWidth: 460, textAlign: "center" }}>
          <h1 style={{ margin: "0 0 12px", fontSize: 24, fontWeight: 600, letterSpacing: 0 }}>
            L&apos;écran s&apos;est interrompu
          </h1>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.55, color: "#52525b" }}>
            Rien de ce que vous aviez enregistré n&apos;est perdu. Reprenez : la plupart de ces
            interruptions ne durent pas.
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", margin: "24px 0 0" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: "13px 28px",
                border: "none",
                borderRadius: 100,
                background: "#111",
                color: "#fff",
                fontSize: 15,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              Réessayer
            </button>
            <a
              href="/tableau-de-bord"
              style={{
                padding: "13px 28px",
                border: "1px solid #d4d4d8",
                borderRadius: 100,
                color: "#111",
                fontSize: 15,
                textDecoration: "none",
              }}
            >
              Tableau de bord
            </a>
          </div>

          {error.digest && (
            <p style={{ margin: "24px 0 0", fontSize: 12.5, color: "#a1a1aa" }}>
              Repère de l&apos;incident : {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
