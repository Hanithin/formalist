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
  /**
   * Deux mots, pour une ligne d'écran.
   *
   * L'explication dit tout, et c'est trop long pour un en-tête de dossier : le libellé
   * tient à côté d'une date, l'explication se lit au survol ou dans le détail. Aucun ne
   * remplace l'autre - « À régler » ne dit pas que les pièces ont passé le contrôle.
   */
  libelle: string;
  /** Une phrase pour l'avocat, à la première personne du guichet. */
  explication: string;
}

const LECTURES: Record<Statut, LectureDuStatut> = {
  RECEIVED: {
    attente: "en-cours",
    libelle: "Reçue",
    explication:
      "Le guichet a reçu la formalité et ses contrôles de cohérence et de complétude sont passés.",
  },
  ERROR: {
    attente: "manque",
    libelle: "Refusée",
    explication:
      "Le guichet a refusé la formalité : un contrôle de cohérence ou de complétude a échoué, une pièce jointe porte un virus, ou le délai de paiement est dépassé.",
  },
  SIGNATURE_PENDING: {
    attente: "a-nous",
    libelle: "À signer",
    explication: "Le récapitulatif de dépôt attend votre signature.",
  },
  SIGNED: { attente: "en-cours", libelle: "Signée", explication: "La formalité est signée." },
  PAYMENT_PENDING: {
    attente: "a-nous",
    libelle: "À régler",
    explication: "Les pièces jointes sont contrôlées : la formalité attend son règlement.",
  },
  PAYMENT_VALIDATION_PENDING: {
    attente: "en-cours",
    libelle: "Règlement en cours",
    explication: "Le règlement est en cours de validation.",
  },
  PAID: {
    attente: "en-cours",
    libelle: "Réglée",
    explication: "La formalité est réglée et porte un numéro national.",
  },
  VALIDATION_PENDING: {
    attente: "en-cours",
    libelle: "En validation",
    explication: "La formalité attend la validation d'au moins un partenaire valideur.",
  },
  AMENDMENT_PENDING: {
    attente: "a-nous",
    libelle: "À régulariser",
    explication:
      "Un valideur demande un complément ou une correction : la formalité attend votre régularisation.",
  },
  AMENDED: {
    attente: "en-cours",
    libelle: "Régularisée",
    explication: "La régularisation est transmise et attend la validation du partenaire.",
  },
  EXPIRED: {
    attente: "manque",
    libelle: "Expirée",
    explication:
      "Le délai est expiré - celui de votre régularisation, ou celui du traitement par le valideur.",
  },
  VALIDATED: { attente: "acquis", libelle: "Validée", explication: "La formalité est validée." },
  REJECTED: { attente: "manque", libelle: "Rejetée", explication: "La formalité est rejetée." },
};

export function estUnStatutConnu(valeur: string): valeur is Statut {
  return (STATUTS as readonly string[]).includes(valeur);
}

/**
 * Un état inconnu qui s'annonce lui-même comme une panne.
 *
 * Le contrat publie treize statuts ; le service en rend d'autres. Un dépôt de
 * démonstration est revenu en `ERROR_DECLARATION_INSEE`, que rien ne prévoyait, et le
 * repli « en cours » le peignait en gris tranquille - un dossier qui appelait un regard
 * passait pour un dossier qui avance.
 *
 * Le nom porte le sens : l'INPI préfixe ses échecs. C'est une présomption, non une
 * lecture du contrat, et elle ne va que dans le sens prudent - alerter à tort fait
 * regarder un dossier qui allait bien, se taire à tort le laisse mourir.
 */
function annonceUnEchec(statut: string): boolean {
  return /ERROR|REJECT|REFUS|EXPIR|CANCEL|ANNUL/.test(statut);
}

/**
 * Ce qu'un statut veut dire, y compris quand on ne le connaît pas.
 *
 * Un état inconnu n'est jamais tenu pour terminé, quoi qu'annonce son nom. Le même
 * `ERROR_DECLARATION_INSEE` était passé de lui-même à `VALIDATION_PENDING` quelques
 * heures plus tard, numéro national à l'appui : le déclarer manqué aurait figé le
 * dossier sur un échec révolu et arrêté toute synchronisation ultérieure. Il appelle un
 * regard - `a-nous` - non un constat de décès.
 *
 * Le libellé reste en français : « ERROR_DECLARATION_INSEE » est le vocabulaire de leur
 * machine, pas celui d'un écran d'avocat. Le nom brut ne disparaît pas pour autant - il
 * est dans l'explication, qui se lit au survol, parce que c'est lui qu'on cite au
 * support de l'INPI.
 */
export function lireLeStatut(valeur: string): LectureDuStatut {
  const propre = valeur.trim().toUpperCase();
  if (estUnStatutConnu(propre)) return LECTURES[propre];

  const echec = annonceUnEchec(propre);
  return {
    attente: echec ? "a-nous" : "en-cours",
    libelle: echec ? "À vérifier" : "État inconnu",
    explication:
      "Le guichet rapporte un état que nous ne connaissons pas encore : " +
      (propre || "aucun") +
      (echec
        ? ". Son nom annonce un échec - ouvrez la formalité sur le guichet pour en lire le motif. Il arrive qu'il se résolve seul."
        : "."),
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
