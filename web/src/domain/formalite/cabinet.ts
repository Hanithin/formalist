/**
 * Ce qu'il reste à faire au cabinet, sur un dossier.
 *
 * Le pendant de suivi.ts, vu de l'autre côté. Le client voit où en est son dossier ;
 * l'avocat doit voir ce qu'on attend de lui, dans l'ordre, sans avoir à reconstituer
 * l'état du dossier depuis cinq onglets et une colonne de sous-phases.
 *
 * L'espace avocat était celui de la création, réemployé tel quel : cinq pastilles
 * « Transmis / Révision / Vérifié / Dépôt / KBIS » et deux livrables, Kbis et registre
 * des bénéficiaires. Sur une modification, aucun de ces mots n'est juste - il n'y a
 * pas de Kbis, il y a un extrait à jour - et rien ne parlait des statuts.
 */

export type TypeDeDossier =
  | "creation"
  | "modification"
  | "auto-entrepreneur"
  | "comptes"
  | "fermeture"
  | "cessation";

export type EtatTache = "faite" | "a_faire" | "plus_tard";

export interface Tache {
  identifiant: string;
  titre: string;
  /** Pourquoi elle existe, et ce qu'elle engage. */
  explication: string;
  etat: EtatTache;
  /** Où elle se fait, dans l'écran du dossier. */
  onglet?: string;
  /** Ce qui l'empêche encore, quand elle attend autre chose. */
  bloquee?: string;
}

export interface EtatDuCabinet {
  type: TypeDeDossier;
  status: string | null;
  sousPhase: string | null;
  /** Des documents attendent une décision de l'avocat. */
  piecesAVerifier: number;
  /**
   * L'avocat a déclaré avoir relu ce que le client a saisi.
   *
   * Sans cette marque, la tâche n'était réputée faite qu'en sous-phase « Vérifié »,
   * tout à la fin de la révision : on relisait le récapitulatif et la case restait
   * vide, sans rien pour la cocher.
   */
  informationsVerifiees?: boolean;
  /** Les actes ont été produits. */
  actesProduits: boolean;
  /** Combien d'actes attendent encore la relecture de l'avocat. */
  actesARelire: number;
  /** Les statuts en vigueur sont au dossier. */
  statutsAuDossier: boolean;
  /** Les statuts à jour ont été produits. */
  statutsAJour: boolean;
  /** Le nombre d'avis à publier ; zéro quand la modification n'en demande pas. */
  avisAPublier: number;
  /** Les avis ont été publiés par le cabinet. */
  avisPublies: boolean;
  /** Le document final a été remis au client. */
  finalRemis: boolean;
  /** La modification touche-t-elle au texte des statuts ? */
  statutsConcernes: boolean;
  /**
   * Une déclaration de confidentialité accompagne-t-elle le dépôt des comptes ?
   *
   * Elle se dépose avec les comptes, dans le même envoi. L'oublier ne se rattrape pas :
   * les comptes sont publiés, et ils le restent.
   */
  confidentialiteDemandee?: boolean;
  /** Sur une fermeture : les deux attestations exigées à la radiation sont au dossier. */
  attestationsReunies?: boolean;
}

const ORDRE = ["5a", "5b", "5c", "5d", "5e"];

function auMoins(sousPhase: string | null, seuil: string): boolean {
  if (!sousPhase) return false;
  const rang = ORDRE.indexOf(sousPhase);
  return rang >= 0 && rang >= ORDRE.indexOf(seuil);
}

/**
 * Le mot juste selon le dossier.
 *
 * « KBIS » sur une modification est faux : le greffe délivre un extrait à jour, non
 * une immatriculation. Une auto-entreprise, elle, reçoit un SIRET. Le tenir dans une
 * table plutôt qu'en conditions semées dans les écrans évite qu'un seul des trois
 * endroits soit corrigé.
 */
export const DOCUMENT_FINAL: Record<TypeDeDossier, string> = {
  creation: "Extrait Kbis",
  modification: "Extrait à jour",
  "auto-entrepreneur": "Avis de situation SIRENE",
  /* Le greffe ne délivre pas d'extrait pour un dépôt de comptes : il en accuse réception. */
  comptes: "Récépissé de dépôt",
  /* Une société fermée ne reçoit pas d'extrait à jour : elle reçoit sa radiation. */
  fermeture: "Attestation de radiation",
  /* Le guichet accuse réception de la cessation : c'est la preuve de la radiation. */
  cessation: "Récépissé de cessation",
};

export const LIBELLES_SOUS_PHASES: Record<TypeDeDossier, Record<string, string>> = {
  creation: {
    "5a": "Transmis",
    "5b": "Révision",
    "5c": "Vérifié",
    "5d": "Dépôt",
    "5e": "Kbis",
  },
  modification: {
    "5a": "Transmis",
    "5b": "Révision",
    "5c": "Vérifié",
    "5d": "Dépôt",
    "5e": "Extrait",
  },
  "auto-entrepreneur": {
    "5a": "Transmis",
    "5b": "Révision",
    "5c": "Vérifié",
    "5d": "Guichet",
    "5e": "SIRET",
  },
  comptes: {
    "5a": "Transmis",
    "5b": "Révision",
    "5c": "Vérifié",
    "5d": "Dépôt",
    "5e": "Récépissé",
  },
  /*
   * La fermeture s'étale sur deux dépôts séparés par la liquidation.
   *
   * « Dissolution » n'est pas la fin du dossier mais son milieu : les pastilles le
   * disent, sans quoi un dossier resté six mois en « Dépôt » passerait pour bloqué.
   */
  fermeture: {
    "5a": "Transmis",
    "5b": "Révision",
    "5c": "Vérifié",
    "5d": "Dissolution",
    "5e": "Radiation",
  },
  cessation: {
    "5a": "Transmis",
    "5b": "Révision",
    "5c": "Vérifié",
    "5d": "Guichet",
    "5e": "Récépissé",
  },
};

export function libelleSousPhase(type: TypeDeDossier, sousPhase: string): string {
  return LIBELLES_SOUS_PHASES[type]?.[sousPhase] ?? sousPhase;
}

/**
 * Les tâches du cabinet, dans l'ordre où elles se font.
 *
 * Une tâche « plus tard » n'est pas grisée par principe : elle dit ce qu'elle attend.
 * « Publier l'avis » avant d'avoir vérifié le dossier ferait paraître, au tarif du
 * caractère, un avis qu'il faudra republier.
 */
/**
 * Par quoi commencer.
 *
 * L'avocat qui prend un dossier arrive devant une liste de sept tâches dont trois sont
 * déjà faites : la première qui l'attend se cherche à l'œil. On la nomme, pour que
 * l'écran puisse la dire en haut et y mener.
 *
 * Une tâche empêchée n'est pas écartée : elle reste la prochaine, et c'est justement ce
 * qui la bloque qu'il faut lire - « les statuts en vigueur ne sont pas au dossier ».
 * Mais elle passe après celles qu'on peut faire tout de suite.
 */
export function prochaineTache(taches: Tache[]): Tache | null {
  return tacheEnCours(taches) ?? taches.find((t) => t.etat === "a_faire") ?? null;
}

export function travailDuCabinet(etat: EtatDuCabinet): Tache[] {
  const taches: Tache[] = [];
  const relu =
    auMoins(etat.sousPhase, "5c") || etat.status === "valide" || etat.status === "terminee";
  // Le dossier est vérifié soit parce que l'avocat l'a déclaré, soit parce qu'il a
  // dépassé l'étape où la question se pose encore.
  const verifie = relu || etat.informationsVerifiees === true;
  const depose = auMoins(etat.sousPhase, "5d");

  taches.push({
    identifiant: "informations",
    titre: "Vérifier les informations du dossier",
    explication:
      "Relisez ce que le client a saisi. Une erreur ici se retrouve dans tous les actes, et le greffe la renvoie des semaines plus tard.",
    etat: verifie ? "faite" : "a_faire",
    onglet: "recapitulatif",
  });

  taches.push({
    identifiant: "pieces",
    titre:
      etat.piecesAVerifier > 0
        ? etat.piecesAVerifier + (etat.piecesAVerifier === 1 ? " pièce à vérifier" : " pièces à vérifier")
        : "Vérifier les pièces justificatives",
    explication:
      "Validez ou refusez chaque justificatif, avec un motif. Un refus prévient le client, qui peut remplacer la pièce.",
    etat: etat.piecesAVerifier > 0 ? "a_faire" : "faite",
    onglet: "pieces",
  });

  taches.push({
    identifiant: "actes",
    titre: "Produire les actes",
    explication:
      etat.type === "comptes"
        ? "Procès-verbal d'approbation, rapport spécial sur les conventions quand la loi l'exige, et déclaration de confidentialité quand elle est demandée."
        : etat.type === "fermeture"
          ? "Décision de dissolution rédigée à la majorité propre à la forme, nomination du liquidateur, déclaration de non-condamnation et pouvoir. Les comptes définitifs et le quitus viendront à la clôture, des mois plus tard."
          : etat.type === "cessation"
            ? "Déclaration récapitulative de cessation et pouvoir. Une auto-entreprise n'a pas d'acte à rédiger : la valeur est dans le calendrier des échéances qui suivent."
            : "Procès-verbal, avenant aux statuts et, selon le cas, acte de cession ou déclaration de non-condamnation.",
    etat: etat.actesProduits ? "faite" : "a_faire",
    onglet: "actes",
  });

  /*
   * La relecture, avant que le client voie quoi que ce soit.
   *
   * Un acte sorti du gabarit n'est pas un acte : c'est un projet. Il était versé dans
   * la bibliothèque du client à la seconde où il était produit - le client pouvait
   * l'envoyer à sa banque ou le signer avant que quiconque l'ait lu. Il attend
   * désormais que l'avocat le relise et le mette à disposition.
   */
  if (etat.actesProduits) {
    taches.push({
      identifiant: "relecture",
      titre: etat.actesARelire > 0 ? "Relire les actes et les mettre à disposition" : "Actes mis à disposition",
      explication:
        "Le client ne voit rien tant que vous n'avez pas relu. Corrigez ce qu'il faut, puis rendez les actes disponibles dans son espace.",
      etat: etat.actesARelire > 0 ? "a_faire" : "faite",
      onglet: "actes",
    });
  }

  if (etat.type === "modification" && etat.statutsConcernes) {
    taches.push({
      identifiant: "statuts",
      titre: "Mettre les statuts à jour",
      explication:
        "Remplacez, dans les statuts en vigueur, chaque passage que les décisions changent. Le reste du document ne bouge pas.",
      etat: etat.statutsAJour ? "faite" : "a_faire",
      onglet: "statuts",
      bloquee: etat.statutsAuDossier
        ? undefined
        : "Les statuts en vigueur ne sont pas au dossier : demandez-les au client.",
    });
  }

  if (etat.avisAPublier > 0) {
    taches.push({
      identifiant: "annonce",
      titre:
        etat.avisAPublier > 1
          ? "Publier les " + etat.avisAPublier + " avis de modification"
          : "Publier l'avis de modification",
      explication:
        etat.avisAPublier > 1
          ? "Le siège change de ressort : un avis paraît dans le département de départ, un autre dans celui d'arrivée. Le texte de chacun est rédigé, il n'y a qu'à le copier."
          : "Le texte est rédigé : copiez-le dans le formulaire du support habilité, puis joignez l'attestation de parution au dossier.",
      etat: etat.avisPublies ? "faite" : "a_faire",
      onglet: "annonce",
      bloquee: verifie ? undefined : "Vérifiez d'abord le dossier : un avis erroné se republie à vos frais.",
    });
  }

  /*
   * Le dépôt des comptes ne passe pas par le guichet unique de la même façon.
   *
   * Ce sont les comptes eux-mêmes qui se déposent, avec la décision d'approbation et,
   * le cas échéant, la déclaration de confidentialité. Cette dernière ne se rattrape
   * pas : sans elle dans l'envoi, les comptes sont publiés, et ils le restent.
   */
  if (etat.type === "comptes" && etat.confidentialiteDemandee) {
    taches.push({
      identifiant: "confidentialite",
      titre: "Joindre la déclaration de confidentialité au dépôt",
      explication:
        "Elle voyage avec les comptes, dans le même envoi. Déposée après coup, elle ne rattrape rien : les comptes sont déjà consultables.",
      etat: depose ? "faite" : "a_faire",
      onglet: "actes",
      bloquee: etat.actesProduits ? undefined : "La déclaration n'est pas encore produite.",
    });
  }

  /*
   * Les deux attestations de la radiation.
   *
   * Depuis le décret n° 2024-751, le greffe refuse de radier sans elles. Elles ne
   * dépendent pas du cabinet mais du client, et il faut des semaines pour régulariser
   * une déclaration manquante : la tâche existe pour que l'avocat relance à temps,
   * plutôt que de découvrir le manque au refus.
   */
  if (etat.type === "fermeture") {
    taches.push({
      identifiant: "attestations",
      titre: "Réunir les attestations fiscale et sociale",
      explication:
        "Attestation de régularité fiscale et attestation de vigilance URSSAF, exigées à la clôture depuis le 1er octobre 2024. Une société sans salarié doit produire une attestation d'entreprise sans salarié : rien d'autre n'est accepté.",
      etat: etat.attestationsReunies ? "faite" : "a_faire",
      onglet: "pieces",
    });
  }

  taches.push({
    identifiant: "depot",
    titre:
      etat.type === "comptes"
        ? "Déposer les comptes au greffe"
        : etat.type === "fermeture"
          ? "Déposer la dissolution au guichet unique"
          : "Déposer au guichet unique",
    explication:
      etat.type === "comptes"
        ? "Transmettez les comptes annuels, la décision d'approbation et, s'il y en a une, la déclaration de confidentialité. Un mois après l'approbation, deux par voie électronique."
        : etat.type === "fermeture"
          ? "Transmettez la décision de dissolution, l'attestation de parution, la déclaration de non-condamnation du liquidateur et sa pièce d'identité. La radiation se demandera à la clôture, avec les deux attestations."
          : etat.type === "cessation"
            ? "Déposez la déclaration de cessation au guichet unique, sur mandat du client. La démarche est gratuite : aucun règlement à avancer."
            : "Transmettez le dossier à l'INPI au nom du client, avec les actes et les statuts à jour.",
    etat: depose ? "faite" : "a_faire",
    onglet: "avancement",
    bloquee: verifie ? undefined : "Le dossier n'est pas encore vérifié.",
  });

  taches.push({
    identifiant: "final",
    titre: "Remettre " + DOCUMENT_FINAL[etat.type].toLowerCase(),
    explication: "Déposez le document délivré par le greffe : le client en est prévenu aussitôt.",
    etat: etat.finalRemis ? "faite" : "a_faire",
    onglet: "avancement",
    bloquee: depose ? undefined : "Le dépôt n'a pas encore eu lieu.",
  });

  return taches;
}

/** La première tâche à faire, celle qu'on met en avant. */
export function tacheEnCours(taches: Tache[]): Tache | null {
  return taches.find((t) => t.etat === "a_faire" && !t.bloquee) ?? null;
}

/** Ce qui reste, pour l'annoncer en un chiffre. */
export function resteAFaire(taches: Tache[]): number {
  return taches.filter((t) => t.etat !== "faite").length;
}
