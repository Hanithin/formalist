/**
 * Les états qu'une formalité traverse au guichet unique.
 *
 * Le contrat d'interface en publie onze. Ils ne se lisent pas tous de la même façon :
 * certains disent que l'INPI travaille, d'autres qu'il attend quelque chose de nous,
 * d'autres que c'est fini - bien ou mal. C'est cette lecture-là qui décide de ce que
 * l'avocat voit, et de ce qu'on va chercher à la synchronisation suivante.
 *
 * Une règle, pas un accès réseau : elle vit dans le domaine, où elle se teste sans
 * compte ni jeton.
 */

export const STATUTS = [
  "RECEIVED",
  "ERROR",
  "SIGNATURE_PENDING",
  "SIGNED",
  "PAYMENT_PENDING",
  "PAYMENT_VALIDATION_PENDING",
  "PAID",
  "VALIDATION_PENDING",
  "AMENDMENT_PENDING",
  "AMENDED",
  "EXPIRED",
  "VALIDATED",
  "REJECTED",
] as const;

export type Statut = (typeof STATUTS)[number];

/** Ce que l'état appelle de nous. */
export type Attente =
  /* L'INPI ou un valideur travaille : on attend, on ne fait rien. */
  | "en-cours"
  /* Le dépôt attend un geste du cabinet : signer, payer, régulariser. */
  | "a-nous"
  /* C'est fini, et c'est bon. */
  | "acquis"
  /* C'est fini, et c'est manqué. */
  | "manque";

export interface LectureDuStatut {
  attente: Attente;
  /** Une phrase pour l'avocat, à la première personne du guichet. */
  explication: string;
}

const LECTURES: Record<Statut, LectureDuStatut> = {
  RECEIVED: {
    attente: "en-cours",
    explication:
      "Le guichet a reçu la formalité et ses contrôles de cohérence et de complétude sont passés.",
  },
  ERROR: {
    attente: "manque",
    explication:
      "Le guichet a refusé la formalité : un contrôle de cohérence ou de complétude a échoué, une pièce jointe porte un virus, ou le délai de paiement est dépassé.",
  },
  SIGNATURE_PENDING: {
    attente: "a-nous",
    explication: "Le récapitulatif de dépôt attend votre signature.",
  },
  SIGNED: { attente: "en-cours", explication: "La formalité est signée." },
  PAYMENT_PENDING: {
    attente: "a-nous",
    explication: "Les pièces jointes sont contrôlées : la formalité attend son règlement.",
  },
  PAYMENT_VALIDATION_PENDING: {
    attente: "en-cours",
    explication: "Le règlement est en cours de validation.",
  },
  PAID: {
    attente: "en-cours",
    explication: "La formalité est réglée et porte un numéro national.",
  },
  VALIDATION_PENDING: {
    attente: "en-cours",
    explication: "La formalité attend la validation d'au moins un partenaire valideur.",
  },
  AMENDMENT_PENDING: {
    attente: "a-nous",
    explication:
      "Un valideur demande un complément ou une correction : la formalité attend votre régularisation.",
  },
  AMENDED: {
    attente: "en-cours",
    explication: "La régularisation est transmise et attend la validation du partenaire.",
  },
  EXPIRED: {
    attente: "manque",
    explication:
      "Le délai est expiré - celui de votre régularisation, ou celui du traitement par le valideur.",
  },
  VALIDATED: { attente: "acquis", explication: "La formalité est validée." },
  REJECTED: { attente: "manque", explication: "La formalité est rejetée." },
};

export function estUnStatutConnu(valeur: string): valeur is Statut {
  return (STATUTS as readonly string[]).includes(valeur);
}

/**
 * Ce qu'un statut veut dire, y compris quand on ne le connaît pas.
 *
 * L'INPI peut en ajouter un sans nous prévenir. Le traiter comme une panne masquerait
 * un dépôt qui avance ; le traiter comme acquis ferait croire à une immatriculation qui
 * n'existe pas. « En cours » est le seul repli qui ne mente dans aucun des deux sens -
 * et le nom brut est rendu, pour qu'il se lise dans le journal.
 */
export function lireLeStatut(valeur: string): LectureDuStatut {
  const propre = valeur.trim().toUpperCase();
  if (estUnStatutConnu(propre)) return LECTURES[propre];
  return {
    attente: "en-cours",
    explication: "Le guichet rapporte un état que nous ne connaissons pas encore : " + propre + ".",
  };
}

/** Un dépôt terminé ne se resynchronise plus : rien ne bougera. */
export function estTermine(valeur: string): boolean {
  const attente = lireLeStatut(valeur).attente;
  return attente === "acquis" || attente === "manque";
}

/** Ceux qui appellent un geste du cabinet, pour les remonter en tête de liste. */
export function appelleUnGeste(valeur: string): boolean {
  return lireLeStatut(valeur).attente === "a-nous";
}
