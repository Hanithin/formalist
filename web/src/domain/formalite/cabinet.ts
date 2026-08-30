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
  /**
   * Où elle se fait, dans l'écran du dossier.
   *
   * Le nom doit être celui d'un onglet réel : trois tâches désignaient « actes », qui
   * n'en est pas un - le lien retombait sur « À faire », d'où l'on venait. Les actes
   * produits vivent dans les pièces du dossier.
   */
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
   * Des pièces obligatoires manquent, ou ont été refusées sans remplacement.
   *
   * Sans ce compte, la tâche des justificatifs se cochait dès qu'il n'y avait rien en
   * attente de vérification. Or une pièce jamais déposée n'attend rien : elle valait
   * zéro, et le cabinet lisait « pièces vérifiées » sur un dossier qu'aucun greffe
   * n'aurait accepté. Un refus produisait le même effet - le document quittait la file
   * d'attente, et la tâche redevenait faite pendant qu'on attendait la nouvelle pièce.
   */
  piecesManquantes?: number;
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
  /**
   * Le nom des actes qui attendent une relecture.
   *
   * La tâche disait « Relire les actes et les mettre à disposition » : l'avocat ne
   * savait pas lesquels sans ouvrir la liste, et le titre ne se distinguait pas de
   * celui de la tâche qui les produit.
   *
   * Facultatif : sans la liste, le titre compte les actes au lieu de les nommer.
   */
  nomsDesActesARelire?: string[];
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
/**
 * Le type d'un dossier, tel que la base le porte.
 *
 * La normalisation vivait dans une cascade de ternaires au milieu de l'écran de
 * l'avocat, seul endroit qui en avait besoin. Deux autres en ont besoin depuis : elle
 * se déclare ici, avec la table qu'elle indexe.
 */
export function typeDeDossier(brut: string | null | undefined): TypeDeDossier {
  const connus: TypeDeDossier[] = [
    "creation",
    "modification",
    "comptes",
    "fermeture",
    "cessation",
    "auto-entrepreneur",
  ];
  const lu = (brut ?? "").trim();
  return connus.find((t) => t === lu) ?? "creation";
}

/**
 * Ce que l'avis annonce, selon le dossier.
 *
 * La tâche disait « Publier l'avis de modification » pour tout le monde - et elle
 * n'existait que pour les modifications, si bien qu'une création se terminait sans
 * qu'aucun avis n'ait été publié, alors que la constitution en exige un.
 */
export const OBJET_DE_L_AVIS: Record<TypeDeDossier, string> = {
  creation: "de constitution",
  modification: "de modification",
  fermeture: "de dissolution",
  cessation: "de cessation",
  comptes: "",
  "auto-entrepreneur": "",
};

export const DOCUMENT_FINAL: Record<TypeDeDossier, string> = {
  creation: "Extrait Kbis",
  /* Le mot que le client connaît est « Kbis » : personne ne réclame son extrait. */
  modification: "Kbis à jour",
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

/**
 * Le nom d'un document au fil d'une phrase.
 *
 * `toLowerCase()` en écrasait le nom propre : « Remettre kbis à jour », « Déposez le
 * kbis ». Seule l'initiale tombe, et pas celle du Kbis, qui n'est pas un mot commun.
 */
export function nomEnPhrase(nom: string): string {
  const propre = nom.startsWith("Kbis");
  return propre ? nom : nom.charAt(0).toLowerCase() + nom.slice(1);
}

/** « le récépissé de dépôt », « l'attestation de radiation ». */
export function avecArticle(nom: string): string {
  const enPhrase = nomEnPhrase(nom);
  return /^[aeiouyéèêh]/i.test(enPhrase) ? "l\u2019" + enPhrase : "le " + enPhrase;
}

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

  /*
   * Les justificatifs : ce qui manque autant que ce qui attend.
   *
   * Le titre dit ce qui bloque en premier. Une pièce absente se réclame au client ; une
   * pièce déposée se regarde. Les deux empêchent le dossier de partir, et aucun des
   * deux ne doit se cacher derrière une case cochée.
   */
  const manquantes = etat.piecesManquantes ?? 0;
  taches.push({
    identifiant: "pieces",
    titre:
      manquantes > 0
        ? manquantes + (manquantes === 1 ? " pièce manquante" : " pièces manquantes")
        : etat.piecesAVerifier > 0
          ? etat.piecesAVerifier +
            (etat.piecesAVerifier === 1 ? " pièce à vérifier" : " pièces à vérifier")
          : "Vérifier les pièces justificatives",
    explication:
      manquantes > 0
        ? "Le client n'a pas fourni tout ce que le dépôt réclame. Écrivez-lui pour la réclamer : le dossier ne peut pas partir sans elle."
        : "Validez ou refusez chaque justificatif, avec un motif. Un refus prévient le client, qui peut remplacer la pièce.",
    etat: manquantes > 0 || etat.piecesAVerifier > 0 ? "a_faire" : "faite",
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
    onglet: "pieces",
  });

  /*
   * Les statuts à jour, avant la relecture.
   *
   * Ils partent au client dans le même envoi que les actes : les relire et les mettre à
   * disposition avant de les avoir produits laissait le client avec un procès-verbal
   * qui modifie des statuts qu'il n'a pas, et obligeait le cabinet à publier deux fois.
   */
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

  /*
   * La relecture, avant que le client voie quoi que ce soit.
   *
   * Un acte sorti du gabarit n'est pas un acte : c'est un projet. Il était versé dans
   * la bibliothèque du client à la seconde où il était produit - le client pouvait
   * l'envoyer à sa banque ou le signer avant que quiconque l'ait lu. Il attend
   * désormais que l'avocat le relise et le mette à disposition.
   */
  if (etat.actesProduits) {
    const statutsEnRetard =
      etat.type === "modification" && etat.statutsConcernes && !etat.statutsAJour;

    taches.push({
      identifiant: "relecture",
      titre:
        etat.actesARelire === 0
          ? "Actes mis à disposition"
          : "Validez " + enumerer(etat.nomsDesActesARelire ?? [], etat.actesARelire),
      explication:
        "Le client ne voit rien tant que vous n'avez pas validé. Chaque acte porte sa décision : celui que vous validez part dans son espace, les autres attendent.",
      etat: etat.actesARelire > 0 ? "a_faire" : "faite",
      onglet: "pieces",
      /*
       * Tout part ensemble ou rien ne part.
       *
       * Mettre les actes à disposition avant d'avoir produit les statuts à jour donne
       * au client un procès-verbal qui modifie des statuts qu'il n'a pas.
       */
      bloquee: statutsEnRetard
        ? "Mettez d'abord les statuts à jour : ils partent au client avec les actes."
        : undefined,
    });
  }

  if (etat.avisAPublier > 0) {
    taches.push({
      identifiant: "annonce",
      titre:
        etat.avisAPublier > 1
          ? "Publier les " + etat.avisAPublier + " avis de modification"
          : "Publier l'avis " + OBJET_DE_L_AVIS[etat.type],
      explication:
        etat.avisAPublier > 1
          ? "Le siège change de ressort : un avis paraît dans le département de départ, un autre dans celui d'arrivée. Le texte de chacun est rédigé, il n'y a qu'à le copier."
          : "Le texte est rédigé : copiez-le dans le formulaire du support habilité, puis déclarez la parution. Le suivi du client s'en sert - c'est cette étape qu'il attend.",
      etat: etat.avisPublies ? "faite" : "a_faire",
      onglet: "annonce",
      bloquee: verifie ? undefined : "Vérifiez d'abord le dossier : un avis erroné se republie à vos frais.",
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
        ? /*
           * La déclaration de confidentialité voyage avec les comptes.
           *
           * Elle tenait sa propre tâche, en tête de l'écran, sans aucun geste : on ne
           * pouvait ni la faire ni la défaire, et elle n'aboutissait qu'au dépôt. C'est
           * un avertissement sur l'envoi, non un travail - il se lit ici, au moment où
           * l'on prépare cet envoi.
           */
          etat.confidentialiteDemandee
          ? "Envoyez trois documents au greffe : les comptes annuels, la décision d'approbation et la déclaration de confidentialité. Les trois ensemble - une déclaration envoyée plus tard n'a plus d'effet, les comptes sont déjà publics. Vous avez un mois après l'approbation, deux si vous déposez en ligne."
          : "Envoyez deux documents au greffe : les comptes annuels et la décision d'approbation. Vous avez un mois après l'approbation, deux si vous déposez en ligne."
        : etat.type === "fermeture"
          ? "Transmettez la décision de dissolution, l'attestation de parution, la déclaration de non-condamnation du liquidateur et sa pièce d'identité. La radiation se demandera à la clôture, avec les deux attestations."
          : etat.type === "cessation"
            ? "Déposez la déclaration de cessation au guichet unique, sur mandat du client. La démarche est gratuite : aucun règlement à avancer."
            : "Transmettez le dossier à l'INPI au nom du client, avec les actes et les statuts à jour.",
    etat: depose ? "faite" : "a_faire",
    onglet: "avancement",
    bloquee: verifie ? undefined : "Le dossier n'est pas encore vérifié.",
  });

  const finalRemis = etat.finalRemis || etat.sousPhase === "5e";

  taches.push({
    identifiant: "final",
    titre: "Remettre " + nomEnPhrase(DOCUMENT_FINAL[etat.type]),
    explication: "Déposez le document délivré par le greffe : le client en est prévenu aussitôt.",
    /*
     * Le greffe ne délivre pas toujours de document.
     *
     * La tâche attendait un récépissé qui n'existait pas toujours, et le dossier
     * restait en suspens : l'avocat peut la clore en le disant, et le client est
     * prévenu que le dépôt est fait mais qu'il ne recevra rien.
     */
    etat: finalRemis ? "faite" : "a_faire",
    onglet: "avancement",
    bloquee: depose ? undefined : "Le dépôt n'a pas encore eu lieu.",
  });

  /*
   * Clore le dossier, et le dire.
   *
   * Rien ne le clôturait : les deux seuls états que l'interface posait étaient
   * « corrections demandées » et « en attente de validation ». Un dossier déposé,
   * document du greffe remis, restait « en attente » à vie - le client le voyait
   * indéfiniment parmi ses formalités en cours, et le courriel qui annonce la fin ne
   * partait jamais.
   *
   * Le geste reste explicite : remettre un fichier ne dit pas que tout est en ordre,
   * c'est l'avocat qui le constate.
   */
  taches.push({
    identifiant: "cloture",
    titre: "Clôturer le dossier",
    explication:
      "Le dossier sort de la file du cabinet et le client apprend que tout est terminé.",
    etat: etat.status === "terminee" ? "faite" : "a_faire",
    onglet: "avancement",
    bloquee: finalRemis ? undefined : "Le document du greffe n'est pas encore remis.",
  });

  return taches;
}

/**
 * « le procès-verbal et la déclaration de confidentialité », ou « les trois actes ».
 *
 * Au-delà de deux, l'énumération est plus longue que la liste qu'elle annonce - et
 * cette liste est juste en dessous.
 */
function enumerer(noms: string[], combien: number): string {
  const courts = noms.map((nom) => nom.charAt(0).toLowerCase() + nom.slice(1));
  if (courts.length === 1) return courts[0];
  if (courts.length === 2) return courts[0] + " et " + courts[1];
  return "les " + combien + " actes produits";
}

/* ---------- Les phases du travail du cabinet ---------- */

/**
 * Quatre temps, dans l'ordre où le travail se fait.
 *
 * Les tâches s'affichaient à plat, huit cartes de même poids : rien ne disait qu'on
 * était encore à vérifier ou déjà à déposer, ni ce qui restait avant de passer la main.
 * Un dossier de cabinet se conduit par étapes, chacune close avant la suivante -
 * vérifier ce qui est déclaré, rédiger ce qui sera signé, publier ce que la loi exige,
 * déposer au guichet.
 *
 * Le découpage suit ce que les tâches engagent, non leur ordre d'apparition : la
 * relecture appartient à la rédaction - c'est encore de l'écrit - quand l'attestation
 * de parution appartient au dépôt, puisque le greffe la réclame avec le reste.
 */
export type PhaseDuCabinet = "verification" | "redaction" | "publication" | "depot";

export const PHASES: { cle: PhaseDuCabinet; titre: string; resume: string }[] = [
  {
    cle: "verification",
    titre: "Vérifier",
    resume: "Relire ce que le client a déclaré et contrôler ses justificatifs.",
  },
  {
    cle: "redaction",
    titre: "Rédiger",
    resume: "Produire les actes, mettre les statuts à jour, les remettre au client.",
  },
  {
    cle: "publication",
    titre: "Publier",
    resume: "Faire paraître l'avis et joindre l'attestation au dossier.",
  },
  {
    cle: "depot",
    titre: "Déposer",
    resume: "Transmettre au guichet unique, puis remettre le document du greffe.",
  },
];

const PHASE_DE_LA_TACHE: Record<string, PhaseDuCabinet> = {
  informations: "verification",
  pieces: "verification",
  actes: "redaction",
  statuts: "redaction",
  relecture: "redaction",
  confidentialite: "redaction",
  annonce: "publication",
  attestations: "depot",
  depot: "depot",
  final: "depot",
};

export type EtatDePhase = "faite" | "en_cours" | "a_venir";

export interface PhaseSuivie {
  cle: PhaseDuCabinet;
  titre: string;
  resume: string;
  taches: Tache[];
  faites: number;
  etat: EtatDePhase;
}

/**
 * Les tâches rangées par phase, avec l'état de chacune.
 *
 * Une phase sans tâche n'existe pas pour ce dossier : une cession ne publie pas d'avis,
 * et « Publier » n'a alors rien à dire. La phase en cours est la première qui n'est pas
 * finie ; celles d'avant sont faites, celles d'après attendent leur tour.
 */
export function phasesDuCabinet(taches: Tache[]): PhaseSuivie[] {
  const phases = PHASES.map((phase) => {
    const siennes = taches.filter((t) => PHASE_DE_LA_TACHE[t.identifiant] === phase.cle);
    return {
      ...phase,
      taches: siennes,
      faites: siennes.filter((t) => t.etat === "faite").length,
      etat: "a_venir" as EtatDePhase,
    };
  }).filter((phase) => phase.taches.length > 0);

  const courante = phases.findIndex((phase) => phase.faites < phase.taches.length);

  return phases.map((phase, rang) => ({
    ...phase,
    etat: courante === -1 || rang < courante ? "faite" : rang === courante ? "en_cours" : "a_venir",
  }));
}

/** La première tâche à faire, celle qu'on met en avant. */
export function tacheEnCours(taches: Tache[]): Tache | null {
  return taches.find((t) => t.etat === "a_faire" && !t.bloquee) ?? null;
}

/** Ce qui reste, pour l'annoncer en un chiffre. */
export function resteAFaire(taches: Tache[]): number {
  return taches.filter((t) => t.etat !== "faite").length;
}
