import { regle } from "./formes";

/**
 * Où en est un dossier, du dépôt jusqu'au Kbis.
 *
 * Trois écrans racontaient la même histoire sans se parler : la colonne de phase de
 * l'espace avocat, l'état du dossier côté client, et le fil de la messagerie. Le
 * client, lui, ne voyait rien du tout - les notifications étaient écrites en base et
 * lues nulle part.
 *
 * Ce module est la seule description du parcours. Il ne lit ni base ni écran : on lui
 * donne l'état d'un dossier, il rend la suite des étapes, celle qui est en cours, et
 * à qui est la main. L'avocat, le client et le courriel en sortent d'accord.
 *
 * L'ordre suit celui de la vraie vie, qui est aussi celui du parcours d'origine :
 * la banque délivre l'attestation de dépôt, on signe les statuts à cette date,
 * l'annonce se publie ensuite, le greffe est saisi, le Kbis arrive.
 */

/** Ce qu'on sait d'un dossier pour situer son avancement. */
export interface EtatDuDossier {
  /**
   * La nature du dossier : elle décide du parcours.
   *
   * Une auto-entreprise ne dépose pas de capital, ne publie pas d'annonce et ne reçoit
   * pas de Kbis : lui montrer ces étapes lui promettrait un chemin qui n'est pas le
   * sien. Absent, on suppose une création de société - c'est le parcours d'origine.
   */
  type?: string | null;
  forme: string | null;
  status: string | null;
  /** La sous-phase du cabinet : 5a transmis, 5b révision, 5c vérifié, 5d dépôt, 5e Kbis. */
  sousPhase: string | null;
  aLAttestationDeCapital: boolean;
  aLAnnoncePubliee: boolean;
  aLeKbis: boolean;
  /** L'auto-entreprise se confie en la réglant : c'est ce qui la met en route. */
  paye?: boolean;
  /**
   * Un avocat a-t-il réellement pris le dossier ?
   *
   * L'étape « Dossier confié à un avocat » se cochait sur le seul règlement, et le
   * client lisait aussitôt « Vérification par l'avocat - l'avocat s'en occupe » alors
   * que personne ne l'avait encore ouvert. Il attendait devant un écran qui lui disait
   * poliment le contraire de la vérité. Entre les deux, il y a une file d'attente, et
   * elle mérite d'être nommée.
   */
  avocatAssigne?: boolean;
  /** Son nom, quand il est connu : « Maître Untel a pris votre dossier ». */
  nomDeLAvocat?: string | null;
  /**
   * Des actes attendent-ils encore la relecture de l'avocat ?
   *
   * Le suivi réclamait l'attestation de dépôt de capital dès le règlement. Or on ne
   * l'obtient pas de nulle part : la banque ouvre le compte sur présentation des
   * statuts, et les statuts sont précisément ce que l'avocat est en train de relire.
   * On demandait donc au client une pièce qu'il ne pouvait pas avoir, avec un bouton
   * qui menait à un dépôt impossible.
   */
  actesEnRelecture?: boolean;
}

export type Main = "vous" | "avocat";
export type EtatEtape = "faite" | "en_cours" | "a_venir";

export interface EtapeDeSuivi {
  identifiant: string;
  titre: string;
  /** Ce qui se passe, dit au client. */
  explication: string;
  main: Main;
  etat: EtatEtape;
  /** Le geste attendu, quand il est du côté du client. */
  action?: string;
  /** Où ce geste se fait : dans le dossier, ou dans le fil. */
  ou: "dossier" | "messagerie";
}

/** Les sous-phases, dans l'ordre : elles se comparent. */
const RANG_SOUS_PHASE: Record<string, number> = { "5a": 1, "5b": 2, "5c": 3, "5d": 4, "5e": 5 };

function auMoins(sousPhase: string | null, seuil: string): boolean {
  return (RANG_SOUS_PHASE[sousPhase ?? ""] ?? 0) >= RANG_SOUS_PHASE[seuil];
}

/**
 * Une société civile ne dépose pas de capital.
 *
 * Lui réclamer une attestation de dépôt bloquerait un dossier sur une pièce que sa
 * banque ne délivrera jamais. C'est la même règle que les pièces attendues.
 */
export function attestationRequise(forme: string | null | undefined): boolean {
  const r = regle(forme);
  return !!r && r.liberationMinimale > 0;
}

interface Definition {
  identifiant: string;
  titre: string;
  /** Ce qui se passe : une phrase, ou celle que l'état commande. */
  explication: string | ((etat: EtatDuDossier) => string);
  /** La main peut dépendre de l'état : des corrections la rendent au client. */
  main: Main | ((etat: EtatDuDossier) => Main);
  action?: string;
  /**
   * Où mène le geste attendu.
   *
   * « Déposer l'attestation » se fait dans le dossier, « Voir ce qui est demandé »
   * dans le fil. Un lien unique pour toutes les étapes envoyait le premier vers une
   * conversation où il n'y a rien à déposer.
   */
  ou?: "dossier" | "messagerie";
  faite: (etat: EtatDuDossier) => boolean;
}

const TOUTES: Definition[] = [
  {
    identifiant: "transmis",
    titre: "Dossier transmis à un avocat",
    explication: "Votre dossier est parti au cabinet. Un avocat en accuse réception et le prend en main.",
    main: "avocat",
    faite: (e) => e.status !== "en_cours" && e.status !== null,
  },
  {
    identifiant: "verification",
    titre: "Vérification par un avocat",
    explication:
      "Un avocat relit vos actes et contrôle vos pièces. Il vous écrit si quelque chose doit être repris.",
    /*
     * La main revient au client quand l'avocat renvoie le dossier.
     *
     * Elle restait à l'avocat en toutes circonstances : le client dont le dossier
     * était renvoyé lisait « L'avocat s'en occupe » et attendait, alors que rien
     * n'avancerait tant qu'il n'aurait pas repris ce qu'on lui demandait. Les
     * parcours d'auto-entreprise et de modification le disaient déjà.
     */
    main: (e) => (e.status === "corrections_demandees" ? "vous" : "avocat"),
    action: "Voir ce qui est demandé",
    ou: "messagerie",
    faite: (e) =>
      e.status !== "corrections_demandees" &&
      (auMoins(e.sousPhase, "5c") || e.status === "valide" || e.status === "terminee"),
  },
  {
    identifiant: "attestation",
    titre: "Attestation de dépôt de capital",
    /*
     * Rien à faire tant que l'avocat n'a pas rendu les actes.
     *
     * La banque ouvre le compte de dépôt sur présentation des statuts, et les statuts
     * sont ce que l'avocat relit. On réclamait donc au client, dès le règlement, une
     * pièce qu'il ne pouvait pas obtenir - avec un bouton qui menait à un dépôt
     * impossible, sur un écran où ses actes portaient « En relecture ».
     */
    explication: (e) =>
      e.actesEnRelecture
        ? "Votre banque ouvre le compte de dépôt sur présentation de vos statuts. Un avocat les relit ; dès qu'ils seront validés, vous pourrez les lui remettre et déposer ici l'attestation qu'elle vous délivrera."
        : "Remettez vos actes à votre banque : elle vous délivre cette attestation après le versement du capital. Déposez-la ici - vos actes sont alors datés du jour où vous l'avez obtenue, qui est celui où vous les signez.",
    main: (e) => (e.actesEnRelecture ? "avocat" : "vous"),
    action: "Déposer l'attestation",
    faite: (e) => e.aLAttestationDeCapital,
  },
  {
    identifiant: "annonce",
    titre: "Annonce légale publiée",
    /*
     * Ce n'est pas le client qui publie.
     *
     * L'étape lui demandait de porter l'avis au journal puis d'en déposer
     * l'attestation. C'est le cabinet qui rédige le texte, le fait paraître et le joint
     * au dossier - le client a payé pour ne pas s'en occuper. Le parcours de
     * modification le disait déjà ainsi ; celui-ci réclamait deux gestes de plus.
     */
    explication:
      "Le cabinet rédige l'avis, le fait paraître dans un journal habilité de votre département et joint la parution au dossier.",
    main: "avocat",
    faite: (e) => e.aLAnnoncePubliee,
  },
  {
    identifiant: "greffe",
    titre: "Dépôt au greffe",
    explication: "Le cabinet dépose le dossier complet au guichet unique. Comptez quelques jours.",
    main: "avocat",
    faite: (e) => auMoins(e.sousPhase, "5d"),
  },
  {
    identifiant: "kbis",
    titre: "Kbis délivré",
    explication:
      "Votre société est immatriculée. Le Kbis, et le registre des bénéficiaires s'il a été établi, sont dans vos documents.",
    main: "avocat",
    /*
     * Un Kbis déposé avant le dépôt au greffe ne signale pas un dossier plus avancé :
     * il signale une erreur de saisie, qu'il vaut mieux voir. La réserve vit ici, dans
     * la condition de l'étape, plutôt que dans l'ordre du rail - où elle faisait passer
     * pour « à venir » des étapes bel et bien franchies.
     */
    faite: (e) => (e.aLeKbis && auMoins(e.sousPhase, "5d")) || e.status === "terminee",
  },
];

/**
 * Le parcours d'une auto-entreprise.
 *
 * Quatre étapes, et trois d'entre elles ne demandent rien : c'est ce qui est vendu.
 * Ni attestation de dépôt de capital - une auto-entreprise n'a pas de capital - ni
 * annonce légale, ni Kbis : l'INSEE délivre un SIRET, et le registre national tient
 * lieu d'immatriculation.
 *
 * La vérification peut rendre la main au client : quand l'avocat demande des
 * corrections, l'étape cesse d'être une attente pour devenir un geste.
 */
const AUTO_ENTREPRISE: Definition[] = [
  {
    identifiant: "confie",
    titre: "Dossier confié à un avocat",
    explication:
      "Votre déclaration est réglée et partie chez nos avocats. Le premier disponible la prend en charge.",
    main: "avocat",
    faite: (e) => !!e.paye,
  },
  {
    identifiant: "verification",
    titre: "Vérification par un avocat",
    explication:
      "Un avocat relit votre déclaration : le code APE, le régime, les plafonds et vos pièces. Il vous écrit si quelque chose doit être repris.",
    main: (e) => (e.status === "corrections_demandees" ? "vous" : "avocat"),
    action: "Voir ce qui est demandé",
    ou: "messagerie",
    faite: (e) =>
      e.status !== "corrections_demandees" &&
      (auMoins(e.sousPhase, "5c") || e.status === "valide" || e.status === "terminee"),
  },
  {
    identifiant: "guichet",
    titre: "Dépôt au guichet unique",
    explication:
      "Le cabinet dépose votre déclaration à l'INPI en votre nom. Comptez quelques jours ouvrés.",
    main: "avocat",
    faite: (e) => auMoins(e.sousPhase, "5d"),
  },
  {
    identifiant: "siret",
    titre: "SIRET délivré",
    explication:
      "L'INSEE vous attribue votre numéro SIRET, sous une à quatre semaines. Votre auto-entreprise existe.",
    main: "avocat",
    faite: (e) => auMoins(e.sousPhase, "5e") || e.status === "terminee",
  },
];

/**
 * Le parcours d'une modification.
 *
 * Ni capital ni Kbis : la société existe déjà. Et rien n'y revient au client une fois
 * le dossier réglé - c'est ce qui est vendu. La publication de l'avis, comptée dans
 * les frais avancés, est faite par le cabinet.
 */
const MODIFICATION: Definition[] = [
  {
    identifiant: "confie",
    titre: "Dossier confié à un avocat",
    explication:
      "C'est parti : votre modification est réglée et proposée à nos avocats. Le premier disponible la prend en main, en général dans la journée.",
    main: "avocat",
    /*
     * Confié veut dire pris, non payé.
     *
     * Le règlement met le dossier dans la file ; c'est la prise en charge qui le confie.
     * Cocher l'un pour l'autre faisait croire au client qu'un avocat travaillait déjà
     * sur son dossier alors qu'il attendait son tour.
     */
    faite: (e) => !!e.avocatAssigne,
  },
  {
    identifiant: "verification",
    titre: "Vérification par un avocat",
    explication:
      "Votre avocat contrôle le procès-verbal, les statuts à jour et vos justificatifs : rien ne part au greffe sans son accord. Il vous écrit si un point doit être repris.",
    main: (e) => (e.status === "corrections_demandees" ? "vous" : "avocat"),
    action: "Voir ce qui est demandé",
    ou: "messagerie",
    faite: (e) =>
      e.status !== "corrections_demandees" &&
      (auMoins(e.sousPhase, "5c") || e.status === "valide" || e.status === "terminee"),
  },
  {
    identifiant: "annonce",
    titre: "Publication de l'annonce légale",
    /*
     * C'est le cabinet qui publie, non le client.
     *
     * Une création laisse le client choisir son support et déposer l'attestation ;
     * une modification est vendue tout compris, l'avis étant compté dans les frais
     * avancés. Lui réclamer une attestation reviendrait à lui faire faire ce qu'il a
     * payé pour ne pas faire.
     */
    explication:
      "Nous publions l'avis pour vous, dans un support habilité du département de votre siège. C'est compris dans votre forfait : rien à avancer, rien à faire.",
    main: "avocat",
    faite: (e) => e.aLAnnoncePubliee,
  },
  {
    identifiant: "guichet",
    titre: "Dépôt au guichet unique",
    explication:
      "Votre avocat dépose la modification à l'INPI en votre nom, statuts à jour à l'appui. Comptez trois à sept jours ouvrés.",
    main: "avocat",
    faite: (e) => auMoins(e.sousPhase, "5d"),
  },
  {
    identifiant: "extrait",
    /*
     * Le mot que le client connaît est « Kbis ».
     *
     * « Extrait à jour » est le terme du greffe : personne ne demande son extrait à sa
     * banque, on lui donne son Kbis. L'étape annonçait donc, sans le nommer, le seul
     * document que le client attend.
     */
    titre: "Kbis à jour",
    explication:
      "Le greffe inscrit la modification et délivre votre nouveau Kbis. Il rejoint vos documents dès sa réception : vous n'avez rien à réclamer.",
    main: "avocat",
    faite: (e) => e.aLeKbis || e.status === "terminee",
  },
];

/**
 * Le parcours d'un dépôt de comptes annuels.
 *
 * Ni annonce légale ni Kbis. Le dépôt des comptes ne modifie pas la société : rien
 * n'est publié, et le greffe ne délivre pas d'extrait - il enregistre le dépôt et en
 * accuse réception. Le client lisait deux étapes qui ne viendraient jamais, dont une
 * qui lui promettait un geste - publier une annonce - qu'on ne lui demanderait pas.
 *
 * Il n'y a pas non plus d'attestation de capital : la société existe, son capital est
 * déposé depuis longtemps.
 */
const COMPTES: Definition[] = [
  {
    identifiant: "transmis",
    titre: "Comptes transmis à un avocat",
    explication:
      "C'est parti : vos comptes approuvés et leurs annexes sont au cabinet. Un avocat en accuse réception et les prend en main.",
    main: "avocat",
    faite: (e) => e.status !== "en_cours" && e.status !== null,
  },
  {
    identifiant: "verification",
    titre: "Vérification par un avocat",
    explication:
      "Votre avocat contrôle le procès-verbal d'approbation, la déclaration de confidentialité s'il y en a une, et la cohérence de vos comptes : rien ne part au greffe sans son accord. Il vous écrit si un point doit être repris.",
    main: (e) => (e.status === "corrections_demandees" ? "vous" : "avocat"),
    action: "Voir ce qui est demandé",
    ou: "messagerie",
    faite: (e) =>
      e.status !== "corrections_demandees" &&
      (auMoins(e.sousPhase, "5c") || e.status === "valide" || e.status === "terminee"),
  },
  {
    identifiant: "greffe",
    titre: "Dépôt au greffe",
    explication:
      "Votre avocat dépose vos comptes au greffe du tribunal de commerce, en votre nom. Comptez quelques jours ouvrés.",
    main: "avocat",
    faite: (e) => auMoins(e.sousPhase, "5d"),
  },
  {
    identifiant: "enregistre",
    titre: "Dépôt enregistré",
    /*
     * Le greffe accuse le dépôt, il ne délivre pas d'extrait.
     *
     * Le récépissé n'arrive pas toujours : certains greffes n'en émettent pas, et
     * l'avocat peut clore le dossier sans. La phrase ne le promet donc pas.
     */
    explication:
      "C'est fait : le greffe a enregistré le dépôt, votre obligation annuelle est remplie pour cet exercice. Le récépissé, quand le greffe en délivre un, rejoint vos documents.",
    main: "avocat",
    /*
     * La sous-phase suffit, sans attendre un document.
     *
     * L'étape ne se cochait que sur un récépissé déposé ou un dossier « terminée » :
     * un dépôt clos sans récépissé - le cas quand le greffe n'en délivre pas - restait
     * « en cours » pour toujours, sur un dossier que le cabinet avait fini.
     */
    faite: (e) => auMoins(e.sousPhase, "5e") || e.aLeKbis || e.status === "terminee",
  },
];

/**
 * Les étapes du dossier, avec celle qui est en cours.
 *
 * Une seule étape est « en cours » : la première qui n'est pas faite. Les suivantes
 * sont à venir, même si l'une d'elles se trouve remplie par avance - un Kbis déposé
 * avant le dépôt au greffe ne ferait pas sauter la file, il signalerait une erreur de
 * saisie qu'il vaut mieux voir.
 */
export function etapesDuSuivi(etat: EtatDuDossier): EtapeDeSuivi[] {
  const parcours =
    etat.type === "auto-entrepreneur"
      ? AUTO_ENTREPRISE
      : etat.type === "modification"
        ? MODIFICATION
        : etat.type === "comptes"
          ? COMPTES
          : TOUTES;
  const retenues = parcours.filter(
    (d) => d.identifiant !== "attestation" || attestationRequise(etat.forme)
  );

  let enCoursTrouvee = false;

  return retenues.map((d) => {
    const faite = d.faite(etat);
    let etatEtape: EtatEtape;

    /*
     * Une étape faite se dit faite, où qu'elle soit dans le rail.
     *
     * Elle ne l'était qu'avant la première étape en attente : tout ce qui suivait
     * passait « à venir », fait ou non. Un dossier immatriculé dont le cabinet n'avait
     * pas encore joint la parution annonçait donc « Dépôt au greffe : à venir » et
     * « Kbis délivré : à venir » - au client qui avait le Kbis dans ses documents et le
     * courriel d'immatriculation dans sa boîte. La barre d'avancement s'arrêtait à
     * 50 % sur un dossier clos.
     *
     * Les étapes ne se suivent pas toujours dans l'ordre : la parution d'un journal
     * arrive quand elle arrive, et le reste n'attend pas. Une seule reste « en cours »,
     * la première qui manque - c'est elle qu'on vient lire.
     */
    if (faite) {
      etatEtape = "faite";
    } else if (!enCoursTrouvee) {
      enCoursTrouvee = true;
      etatEtape = "en_cours";
    } else {
      etatEtape = "a_venir";
    }

    const main = typeof d.main === "function" ? d.main(etat) : d.main;

    return {
      identifiant: d.identifiant,
      titre: d.titre,
      explication: typeof d.explication === "function" ? d.explication(etat) : d.explication,
      main,
      etat: etatEtape,
      // Le geste ne s'affiche que là où il y en a un à faire.
      action: main === "vous" ? d.action : undefined,
      ou: d.ou ?? "dossier",
    };
  });
}

/** L'étape en cours, ou null quand tout est fait. */
export function etapeEnCours(etat: EtatDuDossier): EtapeDeSuivi | null {
  return etapesDuSuivi(etat).find((e) => e.etat === "en_cours") ?? null;
}

/**
 * L'étape à mettre en avant : celle qu'on vient lire.
 *
 * Un dossier renvoyé par l'avocat passe devant tout le reste. Sans cela, un dossier de
 * création sans attestation de capital mettait en avant « Attestation de dépôt de
 * capital » alors que l'avocat venait de renvoyer le dossier : la demande à laquelle
 * il fallait répondre n'était nulle part, et le rail ne montrait rien de neuf.
 *
 * Le rail, lui, garde sa vérité : l'attestation reste à fournir, et s'y lit comme
 * telle.
 */
export function etapeAMettreEnAvant(etat: EtatDuDossier): EtapeDeSuivi | null {
  const etapes = etapesDuSuivi(etat);

  if (etat.status === "corrections_demandees") {
    const renvoi = etapes.find((e) => e.identifiant === "verification");
    if (renvoi) return renvoi;
  }

  return etapes.find((e) => e.etat === "en_cours") ?? null;
}

/**
 * Ce qu'on attend du client, ou rien.
 *
 * C'est la phrase qui part en notification et qui s'affiche en tête du dossier. Quand
 * la main est à l'avocat, on ne demande rien : annoncer une action qui n'en est pas
 * une use l'attention pour les fois où elle compte.
 */
export function attenteDuClient(etat: EtatDuDossier): EtapeDeSuivi | null {
  const courante = etapeEnCours(etat);
  return courante && courante.main === "vous" ? courante : null;
}

/** La part du chemin parcouru, pour la barre d'avancement. */
export function avancementDuSuivi(etat: EtatDuDossier): number {
  const etapes = etapesDuSuivi(etat);
  if (etapes.length === 0) return 0;

  const faites = etapes.filter((e) => e.etat === "faite").length;
  return Math.round((faites / etapes.length) * 100);
}
