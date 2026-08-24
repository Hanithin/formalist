/**
 * Ce qu'on dit au client, et par quel canal.
 *
 * Les notifications étaient écrites en base et lues nulle part : le client n'apprenait
 * qu'en revenant de lui-même sur le site qu'on lui demandait des corrections. Écrire
 * n'est pas prévenir.
 *
 * Deux canaux, et ils ne portent pas la même chose. La cloche recueille tout ce qui
 * bouge : on la consulte quand on veut. Le courriel dérange, il est donc réservé à ce
 * qui appelle un geste ou clôt le dossier. Un client qui reçoit un mail par
 * changement de sous-phase finit par ne plus les ouvrir, y compris celui qui compte.
 */

import { adresseDuDossier } from "./liste";

export type GenreDAvis =
  | "document_refuse"
  | "document_valide"
  | "corrections_demandees"
  | "dossier_valide"
  | "dossier_rejete"
  | "annonce_a_publier"
  | "attestation_attendue"
  | "depot_en_cours"
  | "immatriculee"
  | "dossier_a_prendre"
  | "actes_disponibles"
  | "actes_retires";

/**
 * Où mène le bouton du courriel.
 *
 * Nommée, non écrite en dur : le domaine sait ce qu'il attend - le fil, les documents,
 * le dossier - mais l'adresse d'un dossier dépend de son type, que seule la couche
 * d'accès connaît.
 */
export type DestinationDAvis = "dossier" | "messagerie" | "documents" | "avocat";

export interface Avis {
  genre: GenreDAvis;
  /** La ligne de la cloche : ce qui s'est passé, en une phrase. */
  contenu: string;
  /** L'objet du courriel, quand il y en a un. */
  sujet?: string;
  /** Le corps du courriel : ce qu'il faut faire, et pourquoi. */
  corps?: string;
  /** L'intitulé du bouton du courriel. */
  bouton?: string;
  /**
   * Où le bouton conduit.
   *
   * Tous menaient au tableau de bord, quel que soit leur libellé : on cliquait
   * « Consulter le motif » et l'on arrivait sur l'accueil, à charge de retrouver son
   * dossier. Un bouton qui ne tient pas ce qu'il annonce vaut moins qu'un lien nu.
   */
  destination?: DestinationDAvis;
}

/** Les genres qui justifient de déranger quelqu'un dans sa boîte aux lettres. */
const PAR_COURRIEL = new Set<GenreDAvis>([
  "document_refuse",
  "corrections_demandees",
  // Des documents qui disparaissent de l'espace sans un mot inquiètent plus qu'ils
  // n'informent : le retrait se dit, comme la mise à disposition.
  "actes_retires",
  "dossier_rejete",
  "annonce_a_publier",
  "attestation_attendue",
  "immatriculee",
  "dossier_a_prendre",
  "actes_disponibles",
]);

export function partParCourriel(genre: GenreDAvis): boolean {
  return PAR_COURRIEL.has(genre);
}

/* ---------- Les avis, un par événement ---------- */


/**
 * Le message que le cabinet adresse au client quand il refuse une pièce.
 *
 * L'avis suffisait à prévenir, mais il ne se répond pas : le client qui ne comprenait
 * pas ce qu'on attendait de lui n'avait qu'un bandeau et un motif de quelques mots.
 * Le même refus ouvre donc un message dans le fil du dossier, où il peut demander.
 *
 * Le texte est écrit ici et non dans l'écran qui l'envoie : c'est une parole du
 * cabinet, elle se relit et se corrige à un seul endroit.
 */
export function messageDeRefusDePiece(nom: string, motif: string): string {
  return (
    "Bonjour,\n\nJ'ai relu « " +
    nom +
    " » et je ne peux pas le retenir en l'état.\n\nMotif : " +
    motif +
    "\n\nVous pouvez déposer une nouvelle version depuis vos documents. " +
    "Si vous avez un doute sur ce qui est attendu, répondez-moi ici."
  );
}

export function documentRefuse(nom: string, societe: string, motif: string): Avis {
  return {
    genre: "document_refuse",
    contenu: "L'avocat demande un nouveau document : " + nom + " (" + societe + ")",
    sujet: "Un document est à remplacer - " + societe,
    corps:
      "L'avocat a relu « " +
      nom +
      " » et vous demande de le remplacer.\n\nMotif : " +
      motif +
      "\n\nDéposez le nouveau fichier depuis vos documents : l'avocat le vérifie ensuite, il n'y a rien d'autre à faire de votre côté.",
    bouton: "Remplacer le document",
    destination: "documents",
  };
}

export function documentValide(nom: string, societe: string): Avis {
  return {
    genre: "document_valide",
    contenu: "L'avocat a validé " + nom + " (" + societe + ")",
  };
}

export function correctionsDemandees(societe: string): Avis {
  return {
    genre: "corrections_demandees",
    contenu: "L'avocat demande des corrections sur " + societe,
    sujet: "Des corrections sont demandées - " + societe,
    corps:
      "L'avocat a relu votre dossier et demande des corrections avant de pouvoir le déposer.\n\nLe détail est dans votre messagerie.",
    bouton: "Voir le détail",
    destination: "messagerie",
  };
}

export function dossierValide(societe: string): Avis {
  return {
    genre: "dossier_valide",
    contenu: "Votre dossier " + societe + " a été validé par l'avocat",
  };
}

export function dossierRejete(societe: string): Avis {
  return {
    genre: "dossier_rejete",
    contenu: "Votre dossier " + societe + " a été refusé",
    sujet: "Votre dossier a été refusé - " + societe,
    corps:
      "L'avocat a refusé le dossier en l'état. Le motif est dans votre messagerie, et le dossier reste modifiable : une fois repris, il repart en vérification.",
    bouton: "Consulter le motif",
    destination: "messagerie",
  };
}

/**
 * L'annonce légale.
 *
 * C'est le message le plus utile du parcours, et celui qui manquait : personne ne
 * disait au client qu'il devait publier, où, ni ce qu'on attendait en retour. Le texte
 * à publier est préparé par l'avocat ; le client achète la parution et rend
 * l'attestation que le journal lui envoie.
 */
export function annonceAPublier(societe: string): Avis {
  return {
    genre: "annonce_a_publier",
    contenu: "À vous de jouer : publiez l'annonce légale de " + societe,
    sujet: "Publiez votre annonce légale - " + societe,
    corps:
      "Votre dossier est vérifié. Il reste une démarche de votre côté : publier l'annonce légale de constitution.\n\n" +
      "1. Le texte à publier est prêt, dans votre dossier.\n" +
      "2. Choisissez un journal habilité de votre département et achetez la parution (environ 180 € HT).\n" +
      "3. Le journal vous envoie une attestation de parution : déposez-la ici.\n\n" +
      "Le greffe réclame cette attestation avec le dossier : sans elle, le dépôt ne peut pas se faire.",
    bouton: "Déposer l'attestation",
    destination: "dossier",
  };
}

export function attestationAttendue(societe: string): Avis {
  return {
    genre: "attestation_attendue",
    contenu: "Déposez l'attestation de dépôt de capital de " + societe,
    sujet: "Déposez votre attestation de dépôt de capital - " + societe,
    corps:
      "Votre banque vous remet une attestation après le versement du capital. Déposez-la dans votre dossier.\n\n" +
      "Vos actes seront alors datés du jour où vous l'avez obtenue : c'est celui où vous les signez.",
    bouton: "Déposer l'attestation",
    destination: "dossier",
  };
}

export function depotEnCours(societe: string): Avis {
  return {
    genre: "depot_en_cours",
    contenu: "Le dossier " + societe + " est déposé au guichet unique",
  };
}

export function immatriculee(societe: string, avecRbe: boolean): Avis {
  return {
    genre: "immatriculee",
    contenu: "Votre société " + societe + " est immatriculée",
    sujet: "Votre société est immatriculée - " + societe,
    corps:
      "C'est fait : " +
      societe +
      " est immatriculée.\n\nVotre Kbis" +
      (avecRbe ? " et le registre des bénéficiaires effectifs sont" : " est") +
      " dans vos documents.",
    bouton: "Voir mes documents",
    destination: "documents",
  };
}

/**
 * Un dossier attend qu'un avocat le prenne.
 *
 * Il part à tous les avocats à la fois : le premier qui l'accepte le prend. Par
 * courriel aussi - c'est un travail qui attend, et une cloche qu'on ne regarde pas
 * laisserait le dossier en plan.
 */
export function dossierAPrendre(societe: string, forme: string | null): Avis {
  const description = forme ? forme + " " + societe : societe;

  return {
    genre: "dossier_a_prendre",
    contenu: "Un dossier attend un avocat : " + description,
    sujet: "Un dossier attend un avocat - " + societe,
    corps:
      "Le dossier " +
      description +
      " vient d'être transmis et attend d'être révisé.\n\n" +
      "Il est proposé à tous les avocats : le premier qui l'accepte le prend en charge.",
    bouton: "Voir le dossier",
    destination: "avocat",
  };
}

/**
 * Le chemin où mène le bouton d'un avis.
 *
 * Sans dossier - ou sans destination - on retombe sur le tableau de bord : c'est la
 * seule page qui a du sens quand on ne sait pas de quoi il s'agit.
 */
export function cheminDeLAvis(
  avis: Avis,
  dossier: { id: number; type: string | null } | null
): string {
  if (!dossier) return "/tableau-de-bord";

  switch (avis.destination) {
    case "messagerie":
      return "/messagerie?dossier=" + dossier.id;
    case "documents":
      return "/documents";
    case "avocat":
      return "/avocat/" + dossier.id;
    case "dossier":
      return adresseDuDossier(dossier);
    default:
      return "/tableau-de-bord";
  }
}

/**
 * Les actes, relus et mis à disposition.
 *
 * Ils existaient dès leur production, mais personne ne les avait lus : c'est la
 * relecture de l'avocat qui en fait des documents, et c'est elle qu'on annonce.
 */
/**
 * Le cabinet reprend les actes qu'il venait de mettre à disposition.
 *
 * On ne peut pas défaire ce que le client a déjà lu : le geste retire les documents de
 * son espace, mais il les a peut-être ouverts, envoyés à sa banque, signés. Le taire
 * serait pire - il chercherait des documents disparus sans explication.
 */
export function actesRetires(societe: string): Avis {
  return {
    genre: "actes_retires",
    contenu: "L'avocat reprend les actes de " + societe,
    sujet: "Vos actes sont repris pour correction - " + societe,
    corps:
      "L'avocat a repris vos actes pour les corriger : ils ne sont plus dans vos documents.\n\nVous serez prévenu dès qu'ils y reviendront. Si vous en aviez déjà transmis un exemplaire, attendez la nouvelle version avant de vous en servir.",
    bouton: "Voir mes documents",
    destination: "documents",
  };
}

export function actesDisponibles(societe: string): Avis {
  return {
    genre: "actes_disponibles",
    contenu: "Vos actes sont disponibles pour " + societe,
    sujet: "Vos actes sont prêts - " + societe,
    corps:
      "L'avocat a relu vos actes : ils sont dans vos documents.\n\nRelisez-les à votre tour, puis signez-les - c'est la dernière étape avant le dépôt.",
    bouton: "Voir mes documents",
    destination: "documents",
  };
}
