/**
 * Ce qu'on attend du client, dossier par dossier.
 *
 * Porté depuis buildTodoList de public/dashboard.html. L'ordre compte : les
 * entrées sont rendues dans l'ordre où elles bloquent le dossier, pour qu'on
 * sache par quoi commencer sans avoir à comprendre le parcours.
 */

export interface ContexteDossier {
  dossierId: number;
  /** La nature du dossier : elle décide des étapes, et de l'écran où l'on retourne. */
  type?: string | null;
  status: string | null;
  phase: number;
  banque?: string | null;
  capital?: number | null;
  informationsCompletes: boolean;
  documentsRejetes: number;
  signaturesEnAttente: number;
  signaturesTotal: number;
  /**
   * Rien ne l'a encore engagé : ni règlement, ni transmission, ni signature demandée.
   * Il n'est donc ni chez l'avocat ni au greffe, quelle que soit sa phase.
   */
  brouillon?: boolean;
}

export interface ActionAttendue {
  titre: string;
  precision: string;
  bouton: string;
  lien: string;
  /** Ce qui bloque vraiment le dossier, par opposition à ce qui l'avance. */
  urgent: boolean;
}

function montantLisible(capital: number | null | undefined): string {
  if (typeof capital !== "number" || !Number.isFinite(capital) || capital <= 0) {
    return "votre capital";
  }
  return capital.toLocaleString("fr-FR") + " euros";
}

/**
 * Ce qu'un dossier attend, selon ce qu'il est.
 *
 * Ces étapes - informations, banque, dépôt de capital, pièces des associés - sont
 * celles d'une création. Elles étaient appliquées à tous les dossiers : une fermeture
 * s'y voyait reprocher un capital non déposé, et le bouton renvoyait au formulaire de
 * création d'une société qu'on cherchait précisément à fermer.
 *
 * Les autres parcours n'exposent pas leur avancement à ce niveau. On dit donc ce qu'on
 * sait - qu'il reste à le reprendre, et où - plutôt qu'une étape inventée.
 */
const REPRISES: Record<string, { titre: string; precision: string; bouton: string }> = {
  modification: {
    titre: "Modification à finaliser",
    precision: "Reprenez la saisie là où vous l'avez laissée",
    bouton: "Reprendre",
  },
  comptes: {
    titre: "Comptes annuels à déposer",
    precision: "L'exercice, les chiffres et l'affectation du résultat",
    bouton: "Reprendre",
  },
  fermeture: {
    titre: "Fermeture à poursuivre",
    precision: "Dissolution, liquidation puis radiation",
    bouton: "Reprendre",
  },
  cessation: {
    titre: "Cessation à déclarer",
    precision: "La date d'arrêt, votre régime, et vos dernières échéances",
    bouton: "Reprendre",
  },
  "auto-entrepreneur": {
    titre: "Déclaration à compléter",
    precision: "Votre état civil et votre activité",
    bouton: "Compléter",
  },
};

function adresseDe(ctx: ContexteDossier): string {
  const type = ctx.type ?? "creation";
  if (type === "modification") return "/modification?dossier=" + ctx.dossierId;
  if (type === "comptes") return "/depot-des-comptes?dossier=" + ctx.dossierId;
  if (type === "fermeture") return "/fermeture?dossier=" + ctx.dossierId;
  if (type === "cessation") return "/cessation?dossier=" + ctx.dossierId;
  if (type === "auto-entrepreneur") return "/auto-entrepreneur?dossier=" + ctx.dossierId;
  return "/creation?dossier=" + ctx.dossierId;
}

export function actionsAttendues(ctx: ContexteDossier): ActionAttendue[] {
  if (ctx.status === "terminee") return [];

  const lien = adresseDe(ctx);
  const actions: ActionAttendue[] = [];

  // Un document refusé passe avant tout : il bloque la suite et le client ne
  // sait pas toujours qu'on l'attend.
  if (ctx.documentsRejetes > 0) {
    actions.push({
      titre:
        ctx.documentsRejetes > 1
          ? ctx.documentsRejetes + " documents à remplacer"
          : "Un document à remplacer",
      precision: "Votre avocat a demandé un justificatif conforme",
      bouton: "Remplacer",
      lien,
      urgent: true,
    });
  }

  /*
   * Les autres parcours s'arrêtent ici.
   *
   * Ils ont leurs propres étapes, que ce module ne connaît pas : leur en prêter
   * quatre qui ne sont pas les leurs produisait des phrases fausses.
   */
  const reprise = REPRISES[ctx.type ?? ""];
  if (reprise) {
    actions.push({ ...reprise, lien, urgent: false });
    return actions;
  }

  // Les étapes du parcours s'excluent : une seule est la prochaine à faire.
  if (!ctx.informationsCompletes) {
    actions.push({
      titre: "Compléter les informations",
      precision: "Nom, forme juridique, capital et dirigeant",
      bouton: "Compléter",
      lien,
      urgent: false,
    });
  } else if (!ctx.banque) {
    actions.push({
      titre: "Choisir votre banque",
      precision: "Pour recevoir le dépôt de capital social",
      bouton: "Choisir",
      lien,
      urgent: false,
    });
  } else if (ctx.phase < 3) {
    actions.push({
      titre: "Déposer " + montantLisible(ctx.capital) + " sur votre compte " + ctx.banque,
      precision: "Puis envoyez-nous l'attestation de dépôt",
      bouton: "Envoyer l'attestation",
      lien,
      urgent: false,
    });
  } else if (ctx.phase === 3) {
    actions.push({
      titre: "Déposer les pièces des associés",
      precision: "Pièce d'identité et justificatif de domicile",
      bouton: "Déposer",
      lien,
      urgent: false,
    });
  }

  if (ctx.signaturesEnAttente > 0 && ctx.signaturesTotal > 0) {
    actions.push({
      titre:
        ctx.signaturesEnAttente > 1
          ? ctx.signaturesEnAttente + " signatures manquantes"
          : "Une signature manquante",
      precision: "Les statuts partent au greffe une fois tous les associés signataires",
      bouton: "Voir les signatures",
      lien,
      urgent: true,
    });
  }

  return actions;
}

/** Un dossier qui attend quelque chose du client se distingue de celui qui avance. */
export function attendLeClient(ctx: ContexteDossier): boolean {
  return actionsAttendues(ctx).length > 0;
}

/** Ce dossier bloque-t-il, par opposition à avancer lentement ? */
export function bloque(ctx: ContexteDossier): boolean {
  return actionsAttendues(ctx).some((a) => a.urgent);
}

/**
 * Où en est le dossier, en trois mots.
 *
 * `prochaineEtape` rend une phrase entière, faite pour une vignette large. Une carte
 * de liste fait trois cent soixante pixels : « Un avocat vérifie l'ensemble de vos
 * documents avant le dépôt au greffe. » y tient sur trois lignes et repousse tout le
 * reste. On garde donc le seul titre de ce qui est attendu.
 *
 * Cette ligne remplace le pourcentage d'avancement, qui mesurait le remplissage d'un
 * formulaire sans jamais dire ce qui bloquait - au point qu'un dossier annoncé à cent
 * pour cent proposait encore de le reprendre.
 */
export function etapeCourte(ctx: ContexteDossier): string {
  if (ctx.status === "terminee") return "Société immatriculée";

  /*
   * Ce qui bloque passe devant ce qui avance.
   *
   * Les actions sortent dans l'ordre du parcours, et la signature manquante est
   * ajoutée en dernier : prendre la première annonçait « Compléter les informations »
   * sur un dossier dont les statuts attendent une signature pour partir au greffe.
   * C'est la règle qu'`attentesOrdonnees` applique déjà d'un dossier à l'autre.
   */
  const actions = actionsAttendues(ctx);
  const premiere = actions.find((a) => a.urgent) ?? actions[0];
  if (premiere) return premiere.titre;

  /*
   * Un brouillon n'a jamais quitté les mains du client.
   *
   * La phase compte deux choses à la fois : les étapes franchies dans le formulaire,
   * et l'avancement du dossier chez nous - `enregistrerBrouillon` l'avance à mesure
   * qu'on remplit. Un brouillon entièrement saisi atteint donc la phase cinq sans
   * avoir été transmis, et la lire seule le disait « déposé au greffe » alors qu'il
   * dormait chez son auteur.
   */
  if (ctx.brouillon) return "À transmettre";

  // Rien n'est attendu du client : c'est que le dossier travaille ailleurs.
  if (ctx.phase >= 5) return "Déposé au greffe";
  return "En révision par l'avocat";
}

/**
 * Où en est le dossier, en une phrase.
 *
 * Quand quelque chose est attendu du client, c'est cette action ; sinon, c'est ce
 * que fait la plateforme. Une vignette qui ne dit rien pousse à ouvrir le dossier
 * pour rien.
 */
export function prochaineEtape(ctx: ContexteDossier): string {
  if (ctx.status === "terminee") {
    return "Votre société est immatriculée, le K-bis est disponible.";
  }

  const [premiere] = actionsAttendues(ctx);
  if (premiere) {
    const precision = premiere.precision;
    return premiere.titre + " : " + precision.charAt(0).toLowerCase() + precision.slice(1) + ".";
  }

  if (ctx.phase >= 5) return "Dossier déposé au greffe, réception du K-bis sous 24 à 72 h.";
  if (ctx.phase === 4) {
    return "Un avocat vérifie l'ensemble de vos documents avant le dépôt au greffe.";
  }
  return "Votre dossier est en cours de traitement par notre équipe.";
}

export type EtatTableauDeBord = "aucun" | "unique" | "plusieurs" | "tous_termines";

/**
 * Ce que le tableau de bord doit montrer.
 *
 * Trois écrans très différents se cachaient derrière la même page : aucune
 * société, une seule, ou plusieurs. Le nommer ici évite de le redécider à chaque
 * bloc d'affichage.
 */
export function etatTableauDeBord(dossiers: { status: string | null }[]): EtatTableauDeBord {
  if (dossiers.length === 0) return "aucun";
  if (dossiers.every((d) => d.status === "terminee")) return "tous_termines";
  return dossiers.length === 1 ? "unique" : "plusieurs";
}

/**
 * Salutation selon l'heure.
 *
 * Les bornes sont celles de la page d'origine : « Bonsoir » de dix-huit heures à
 * cinq heures du matin, « Bonjour » le reste du temps. Elles étaient à six heures
 * ici, si bien qu'on souhaitait le bonsoir à cinq heures et demie.
 */
export function salutation(maintenant: Date = new Date()): string {
  const heure = maintenant.getHours();
  return heure >= 18 || heure < 5 ? "Bonsoir" : "Bonjour";
}

/**
 * La phrase d'accueil, qui suit le moment de la journée.
 *
 * Reprise de buildGreeting() dans dashboard.html : « Bonjour Hani, prêt à avancer sur
 * vos dossiers ? ». Le matin propose d'avancer, l'après-midi demande où l'on en est,
 * le soir parle de terminer, et un compte sans dossier reçoit un accueil. La variante
 * est tirée au hasard parmi quatre, pour que la page ne récite pas la même phrase à
 * chaque visite.
 *
 * Le tirage est un paramètre : sans cela, la phrase ne se testerait pas.
 */
/*
 * La phrase d'accueil change d'heure en heure, non de clic en clic.
 *
 * Le tirage était aléatoire à chaque rendu : revenir sur l'accueil trois fois donnait
 * trois accueils différents, et la page paraissait instable - on croyait avoir mal lu.
 * L'heure suffit à la renouveler sans qu'elle bouge sous les yeux.
 */
function tirageDeLHeure(quand: Date): number {
  const heures = Math.floor(quand.getTime() / 3_600_000);
  /* Un mélange simple : deux heures qui se suivent ne doivent pas tomber sur la même. */
  return ((heures * 2_654_435_761) % 1000) / 1000;
}

export function phraseDAccueil(
  prenom: string,
  nombreDeDossiers: number,
  maintenant: Date = new Date(),
  tirage: number = tirageDeLHeure(maintenant)
): string {
  const heure = maintenant.getHours();
  const seul = nombreDeDossiers === 1;
  const leDossier = seul ? "votre dossier" : "vos dossiers";
  const attend = seul ? "vous attend" : "vous attendent";

  let phrases: string[];
  if (nombreDeDossiers === 0) {
    /*
     * Aucune de ces phrases ne présume du parcours.
     *
     * « Prêt à lancer votre première société ? » s'affichait au-dessus d'un catalogue
     * où figurent « Fermer ma société » et « Déposer mes comptes annuels » : on
     * accueillait par une question qui contredit la moitié des cartes proposées, et qui
     * se trompe pour qui vient gérer une société qu'il a déjà. C'est la faute qu'un
     * ancien « Première étape : créez votre société » avait déjà values.
     */
    phrases = [
      "bienvenue sur Formalist !",
      "ravi de vous accueillir.",
      "par quoi commençons-nous ?",
      "on commence quand vous voulez.",
    ];
  } else if (heure >= 5 && heure < 12) {
    phrases = [
      "prêt à avancer sur " + leDossier + " ?",
      "une belle journée pour entreprendre.",
      "quoi de prévu ce matin ?",
      "on démarre la journée en beauté.",
    ];
  } else if (heure >= 12 && heure < 18) {
    phrases = [
      seul ? "comment avance votre projet ?" : "comment avancent vos projets ?",
      "besoin de finaliser un dossier ?",
      "on continue sur notre lancée.",
      "un bon après-midi pour avancer.",
    ];
  } else {
    phrases = [
      "encore un peu de travail ce soir ?",
      "on termine la journée en beauté.",
      leDossier + " " + attend + ".",
      "une dernière vérification avant la fin de journée ?",
    ];
  }

  // Un tirage hors bornes ne doit pas rendre une phrase absente.
  const rang = Math.min(Math.max(Math.floor(tirage * phrases.length), 0), phrases.length - 1);
  return salutation(maintenant) + " " + prenom + ", " + phrases[rang];
}

/* ---------- Ce qu'on montre de ce qu'on attend ---------- */

/** Une action, rattachée au dossier qui l'attend. */
export interface ActionDeDossier extends ActionAttendue {
  dossierId: number;
  societe: string;
}

/** Cinq actions au plus sur l'accueil : au-delà, la carte devient une liste. */
export const ATTENTES_MONTREES = 5;

/**
 * Les actions de tous les dossiers, les bloquantes d'abord.
 *
 * L'ordre compte dès qu'on n'en montre que cinq : une signature manquante ou une
 * pièce refusée arrêtent le dossier, alors qu'une banque à choisir l'attend
 * seulement. Les laisser dans l'ordre des dossiers pouvait cacher un blocage
 * derrière « Voir tout ».
 *
 * À rang égal d'urgence, l'ordre des dossiers est conservé : il suit leur date de
 * mise à jour, du plus récent au plus ancien.
 */
export function attentesOrdonnees(
  societes: { id: number; societe: string; actions: ActionAttendue[] }[]
): ActionDeDossier[] {
  const toutes = societes.flatMap((s) =>
    s.actions.map((a) => ({ ...a, dossierId: s.id, societe: s.societe }))
  );

  const urgentes = toutes.filter((a) => a.urgent);
  const autres = toutes.filter((a) => !a.urgent);
  return [...urgentes, ...autres];
}
