import type { CleMatiere } from "@/domain/consultation/matieres";

/**
 * Les icônes de la page de consultation, reprises trait pour trait de
 * public/consultations.html.
 *
 * Regroupées ici parce qu'elles n'apprennent rien sur le fonctionnement de la page :
 * laissées au milieu du rendu, elles noyaient la logique sous des chemins SVG.
 */

const TRAITS = {
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function Calendrier({ trait = "1.8" }: { trait?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth={trait} aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export function Horloge({ trait = "1.8" }: { trait?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth={trait} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function Personne() {
  return (
    <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="7" r="4" />
      <path d="M3 21v-2a4 4 0 014-4h10a4 4 0 014 4v2" />
    </svg>
  );
}

export function Euro() {
  return (
    <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2" aria-hidden="true">
      <path d="M19.5 5.5A8 8 0 1019.5 18.5" />
      <line x1="4" y1="10" x2="14" y2="10" />
      <line x1="4" y1="14" x2="13" y2="14" />
    </svg>
  );
}

export function Camera({ taille = 14 }: { taille?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      {...TRAITS}
      strokeWidth="2"
      width={taille}
      height={taille}
      aria-hidden="true"
    >
      <path d="M15 10l4.5-4.5A2 2 0 0123 7v10a2 2 0 01-3.5 1.5L15 14" />
      <rect x="1" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

export function Document({ taille = 18 }: { taille?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      {...TRAITS}
      strokeWidth="1.8"
      width={taille}
      height={taille}
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export function Croix({ taille = 20 }: { taille?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      {...TRAITS}
      strokeWidth="2"
      width={taille}
      height={taille}
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function Chevron() {
  return (
    <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2" width="16" height="16" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function Televerser() {
  return (
    <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="1.7" aria-hidden="true">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export function Alerte() {
  return (
    <svg
      viewBox="0 0 24 24"
      {...TRAITS}
      strokeWidth="2.2"
      width="18"
      height="18"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

/** Une icône par matière, comme l'assistant d'origine en proposait. */
export function IconeDeMatiere({ matiere }: { matiere: CleMatiere }) {
  const traits = { ...TRAITS, strokeWidth: "1.8", viewBox: "0 0 24 24", "aria-hidden": true };

  if (matiere === "droit_societes") {
    return (
      <svg {...traits}>
        <path d="M3 21h18M5 21V7l7-4 7 4v14" />
      </svg>
    );
  }
  if (matiere === "fiscalite") {
    return (
      <svg {...traits}>
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
      </svg>
    );
  }
  if (matiere === "contrats") {
    return (
      <svg {...traits}>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  }
  if (matiere === "droit_travail") {
    return (
      <svg {...traits}>
        <path d="M20 7h-3V4a2 2 0 00-2-2H9a2 2 0 00-2 2v3H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
      </svg>
    );
  }
  if (matiere === "propriete_intellectuelle") {
    return (
      <svg {...traits}>
        <path d="M9 11.5a2.5 2.5 0 005 0V8a2.5 2.5 0 00-5 0z" />
        <path d="M11 17v4" />
        <path d="M7 21h8" />
      </svg>
    );
  }
  if (matiere === "immobilier") {
    return (
      <svg {...traits}>
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      </svg>
    );
  }
  if (matiere === "litige") {
    return (
      <svg {...traits}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    );
  }

  return (
    <svg {...traits}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
