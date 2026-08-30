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
  | "dossier_verifie"
  | "depot_sans_document"
  | "attestation_attendue"
  | "depot_en_cours"
  | "dossier_termine"
  | "document_final_remis"
  | "message_recu"
  | "dossier_retransmis"
  | "dossier_a_prendre"
  | "dossier_pris_en_charge"
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
  "attestation_attendue",
  "dossier_termine",
  /*
   * Le document du greffe se dit.
   *
   * Sa remise était le seul geste du parcours dont personne n'apprenait rien, alors
   * que la tâche promettait « le client en est prévenu aussitôt ».
   */
  "document_final_remis",
  /*
   * Un message n'atteignait son destinataire que s'il revenait de lui-même.
   *
   * Le fil s'écrivait en base et rien d'autre : ni cloche, ni courriel. Un avocat qui
   * demandait une pièce dans la conversation attendait une réponse que personne ne
   * savait devoir donner - et le client qui répondait attendait de même.
   */
  "message_recu",
  // Un dossier corrigé et retransmis revient à son avocat, qui ne l'apprenait jamais.
  "dossier_retransmis",
  "dossier_a_prendre",
  /*
   * La prise en charge se dit par courriel.
   *
   * C'est le moment où l'attente devient un travail : le client a réglé, puis plus
   * rien pendant des heures. Une ligne dans la cloche ne suffit pas - il faut être
   * revenu sur l'application pour la voir, et c'est justement ce qu'il ne fait pas
   * tant qu'il ne sait pas que quelque chose a bougé.
   */
  "dossier_pris_en_charge",
  "actes_disponibles",
]);

export function partParCourriel(genre: GenreDAvis): boolean {
  return PAR_COURRIEL.has(genre);
}

/**
 * On ne redit pas par courriel ce qui n'a pas encore été lu.
 *
 * Trois messages écrits dans la même minute feraient trois courriels dont les deux
 * derniers n'apprendraient rien - et l'on cesse alors d'ouvrir ceux qui comptent. Tant
 * qu'un message attend d'être lu, le destinataire est déjà prévenu : la cloche prend
 * la suite, c'est sa raison d'être.
 */
export function redireParCourriel(messagesEnAttente: number): boolean {
  return messagesEnAttente === 0;
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
 * Le dépôt a eu lieu, mais aucun document ne suivra.
 *
 * Le greffe ne délivre pas toujours de récépissé, et le dossier restait alors en
 * suspens : la dernière étape attendait un document qui n'existait pas, et le client
 * guettait une remise qui ne viendrait jamais. Le lui dire vaut mieux que de le laisser
 * attendre.
 */
export function depotSansDocument(societe: string, document: string): Avis {
  return {
    genre: "depot_sans_document",
    contenu: "Le dépôt de " + societe + " est effectué",
    sujet: "Votre dépôt est effectué - " + societe,
    corps:
      "Le dossier de " +
      societe +
      " est déposé au greffe : la démarche est terminée.\n\n" +
      "Le greffe n'a pas délivré de " +
      document.toLowerCase() +
      " pour ce dépôt : vous n'en recevrez donc pas. Cela ne change rien à la validité du dépôt.",
    bouton: "Voir mon dossier",
    destination: "dossier",
  };
}

/**
 * Le dossier est vérifié : le client n'a rien à faire.
 *
 * On lui écrivait « À vous de jouer : publiez l'annonce légale ». C'est faux : l'avis
 * est rédigé et publié par le cabinet, ici comme partout ailleurs sur le site, et le
 * client n'a jamais eu à choisir un journal ni à acheter une parution. Il restait à
 * l'inviter à une démarche qui n'est pas la sienne, avec un prix à l'appui.
 *
 * Ce qui se dit, c'est où en est son dossier.
 */
export function dossierVerifie(societe: string): Avis {
  return {
    genre: "dossier_verifie",
    contenu: "Le dossier de " + societe + " est vérifié",
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

/**
 * Ce qu'on annonce en clôturant, selon ce qui a été fait.
 *
 * L'avis parlait d'immatriculation à tout le monde : une société qu'on ferme ne
 * s'immatricule pas, un dépôt de comptes non plus, et le courriel promettait « votre
 * Kbis » à qui recevait une attestation de radiation.
 */
const FIN: Record<string, (societe: string) => string> = {
  creation: (s) => s + " est immatriculée",
  modification: (s) => "la modification de " + s + " est enregistrée",
  fermeture: (s) => "la fermeture de " + s + " est enregistrée",
  cessation: () => "la cessation d'activité est enregistrée",
  comptes: (s) => "les comptes de " + s + " sont déposés",
  "auto-entrepreneur": () => "votre auto-entreprise est déclarée",
};

export function dossierTermine(
  societe: string,
  type: string,
  /** Le document que le greffe a délivré, déjà nommé pour ce type de dossier. */
  document: string,
  avecRbe: boolean
): Avis {
  const fait = (FIN[type] ?? FIN.creation)(societe);
  const phrase = fait.charAt(0).toUpperCase() + fait.slice(1);

  return {
    genre: "dossier_termine",
    contenu: phrase,
    sujet: phrase + " - " + societe,
    corps:
      "C'est fait : " +
      fait +
      ".\n\n" +
      document +
      (avecRbe ? " et le registre des bénéficiaires effectifs sont" : " est") +
      " dans vos documents.",
    bouton: "Voir mes documents",
    destination: "documents",
  };
}

/**
 * Le document que le greffe délivre est arrivé.
 *
 * Il se dit à part de la clôture : entre les deux, l'avocat vérifie ce qu'il vient de
 * recevoir. Le client, lui, n'a pas à attendre pour aller le chercher.
 */
export function documentFinalRemis(societe: string, document: string): Avis {
  return {
    genre: "document_final_remis",
    contenu: document + " est dans vos documents (" + societe + ")",
    sujet: document + " - " + societe,
    corps:
      "Le greffe a délivré " +
      document.charAt(0).toLowerCase() +
      document.slice(1) +
      " de " +
      societe +
      ".\n\nIl est dans vos documents, où vous pouvez le télécharger.",
    bouton: "Voir mes documents",
    destination: "documents",
  };
}

/**
 * Quelqu'un a écrit dans le fil du dossier.
 *
 * Le message s'écrivait en base et rien d'autre. Un avocat qui demandait une pièce
 * dans la conversation n'était lu que si le client repassait sur le site ; un client
 * qui répondait attendait de même. Le refus d'une pièce, lui, prévenait par les deux
 * canaux depuis toujours - c'est la même urgence.
 *
 * L'extrait tient dans l'objet du courriel : il évite d'ouvrir pour découvrir qu'il
 * s'agissait d'un mot de trois lignes.
 */
export function messageRecu(auteur: string, societe: string, extrait: string): Avis {
  const court = extrait.length > 140 ? extrait.slice(0, 140).trimEnd() + "\u2026" : extrait;

  return {
    genre: "message_recu",
    contenu: "Message de " + auteur + " (" + societe + ")",
    sujet: "Message de " + auteur + " - " + societe,
    corps: auteur + " vous a écrit :\n\n" + court,
    bouton: "Répondre",
    destination: "messagerie",
  };
}

/**
 * Le client a corrigé son dossier et l'a retransmis.
 *
 * La proposition aux avocats renonçait quand le dossier était déjà pris - juste pour
 * le cabinet, muet pour celui qui l'avait pris : après un aller-retour de corrections,
 * le dossier revenait en attente et son avocat ne l'apprenait jamais.
 */
export function dossierRetransmis(societe: string, client: string): Avis {
  return {
    genre: "dossier_retransmis",
    contenu: client + " a repris son dossier " + societe,
    sujet: "Dossier repris - " + societe,
    corps:
      client +
      " a corrigé " +
      societe +
      " et vous l'a retransmis.\n\nIl attend votre relecture.",
    bouton: "Ouvrir le dossier",
    destination: "avocat",
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

/**
 * Un avocat a pris le dossier en charge.
 *
 * C'était le seul geste du parcours qui ne prévenait personne. Le client avait réglé,
 * son écran annonçait qu'un avocat s'en occupait, et rien ne lui disait quand cela
 * devenait vrai. Le nom compte : il transforme une attente anonyme en un interlocuteur.
 */
export function dossierPrisEnCharge(societe: string, avocat: string): Avis {
  return {
    genre: "dossier_pris_en_charge",
    contenu: avocat + " a pris en charge votre dossier " + societe,
    sujet: "Votre dossier est pris en charge - " + societe,
    corps:
      avocat +
      " a pris votre dossier en charge et commence sa révision.\n\nVous serez prévenu dès que vos actes seront prêts, ou si une pièce doit être complétée.",
    bouton: "Suivre mon dossier",
    destination: "dossier",
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
