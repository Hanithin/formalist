/**
 * Les icônes de la messagerie, reprises trait pour trait de public/messagerie.html.
 *
 * Elles sont regroupées ici parce qu'elles n'apprennent rien sur le fonctionnement de
 * la page : les laisser au milieu du rendu noyait la logique sous des chemins SVG.
 */

const TRAITS = {
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function Loupe() {
  return (
    <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function Bulle() {
  return (
    <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="1.5" aria-hidden="true">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

export function Trombone() {
  return (
    <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="1.5" aria-hidden="true">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

export function Avion() {
  return (
    <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

export function Croix() {
  return (
    <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function FlecheRetour() {
  return (
    <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2" aria-hidden="true">
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 00-4-4H4" />
    </svg>
  );
}

export function FlecheDroite() {
  return (
    <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export function Televersement() {
  return (
    <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export function PieceJointe() {
  return (
    <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="1.8" aria-hidden="true">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export function Interrogation() {
  return (
    <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function Carte() {
  return (
    <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="1.6" aria-hidden="true">
      <rect x="2" y="6" width="20" height="13" rx="2" />
      <line x1="2" y1="11" x2="22" y2="11" />
    </svg>
  );
}

export function Bouclier() {
  return (
    <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="1.6" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

export function Alerte() {
  return (
    <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export function Etoile() {
  return (
    <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="1.6" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

/** Les icônes des pastilles de type, une par intention. */
export function IconeDuType({ type }: { type: string }) {
  if (type === "correction_request") {
    return (
      <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2.2" aria-hidden="true">
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    );
  }

  if (type === "rejection") {
    return (
      <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2.2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    );
  }

  if (type === "validation") {
    return (
      <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2.2" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }

  if (type === "validation_pending") {
    return (
      <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2.2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  }

  if (type === "document_request") {
    return (
      <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2.2" aria-hidden="true">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  }

  // status_note, et tout type venu d'une version plus récente.
  return (
    <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2.2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
    </svg>
  );
}
