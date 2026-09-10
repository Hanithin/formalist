/**
 * Circuit de signature des statuts.
 *
 * Chaque associé reçoit un lien portant un jeton. Il n'a pas de compte : le jeton
 * est sa seule preuve, ce qui impose qu'il soit long, à usage unique, et que
 * l'accès à un lien ne révèle rien d'autre que ce qu'il y a à signer.
 *
 * Porté depuis routes/signature.js.
 */

export type EtatSignature = "en_attente" | "ouverte" | "signee";

export interface DemandeSignature {
  id: number;
  nom: string;
  email: string;
  ouverteLe: Date | null;
  signeeLe: Date | null;
}

export function etatDemande(demande: DemandeSignature): EtatSignature {
  if (demande.signeeLe) return "signee";
  if (demande.ouverteLe) return "ouverte";
  return "en_attente";
}

export function libelleEtat(etat: EtatSignature): string {
  if (etat === "signee") return "Signé";
  if (etat === "ouverte") return "Lien ouvert";
  return "En attente";
}

/**
 * Où en est une demande, du premier envoi à la signature.
 *
 * Le circuit ne disait rien entre les deux. « Chacun reçoit son lien par email »
 * s'affichait une fois, et le client qui attendait une signature n'avait plus aucune
 * prise : ni savoir si le message était parti, ni s'il était arrivé, ni le renvoyer
 * autrement qu'en relançant tout le circuit - ce qui invalide les jetons de ceux qui
 * n'ont pas encore signé.
 *
 * L'ordre des jalons est celui du temps, et il ne se contracte pas : un message peut
 * être accepté par le fournisseur sans jamais être remis, remis sans être ouvert,
 * ouvert sans que le lien soit cliqué. Chaque mot dit exactement ce qu'il sait.
 */
export type JalonEnvoi =
  "non_envoye" | "echec" | "rejete" | "envoye" | "remis" | "mail_ouvert" | "lien_ouvert" | "signee";

export interface SuiviDemande extends DemandeSignature {
  envoyeLe: Date | null;
  remisLe: Date | null;
  mailOuvertLe: Date | null;
  /** Ce que le fournisseur a répondu quand il a refusé le message, ou l'a rendu. */
  motif: string | null;
  relances: number;
}

/**
 * Le jalon le plus avancé qu'on puisse affirmer.
 *
 * On lit à rebours : ce qui est le plus tardif emporte le reste, puisqu'on ne signe
 * pas sans avoir ouvert et qu'on n'ouvre pas sans avoir reçu. Un rejet fait exception -
 * il vient après l'envoi et l'annule, et c'est la seule chose à dire d'une adresse qui
 * n'existe pas.
 */
export function jalonDeLEnvoi(demande: SuiviDemande): JalonEnvoi {
  if (demande.signeeLe) return "signee";

  /*
   * Un rejet passe devant tout ce qui l'a précédé.
   *
   * Il vient après l'envoi et il l'annule : une adresse qui rend le message ne le
   * recevra pas davantage la prochaine fois. Le laisser derrière « Remis » ou « Mail
   * ouvert » - c'est l'ordre du temps, et le serveur d'en face peut très bien accepter
   * puis rendre - afficherait un message en route alors qu'il est revenu, et cacherait
   * la seule chose à faire : corriger l'adresse. Une relance efface ces dates, donc un
   * rejet affiché parle toujours du dernier message envoyé.
   */
  if (demande.motif === MOTIF_REJET) return "rejete";

  if (demande.ouverteLe) return "lien_ouvert";
  if (demande.mailOuvertLe) return "mail_ouvert";
  if (demande.remisLe) return "remis";
  if (demande.motif) return "echec";
  if (demande.envoyeLe) return "envoye";
  return "non_envoye";
}

/** Ce que le dépôt inscrit quand le fournisseur rend le message : l'adresse ne reçoit pas. */
export const MOTIF_REJET = "rejet";

/** La date que porte un jalon, celle qu'on affiche à côté de son libellé. */
export function dateDuJalon(demande: SuiviDemande): Date | null {
  const jalon = jalonDeLEnvoi(demande);
  if (jalon === "signee") return demande.signeeLe;
  if (jalon === "lien_ouvert") return demande.ouverteLe;
  if (jalon === "mail_ouvert") return demande.mailOuvertLe;
  if (jalon === "remis") return demande.remisLe;
  /*
   * Un rejet ne porte pas de date dans sa pastille.
   *
   * « Adresse incorrecte le 11 sept. à 00h39 » ne se lit pas, et surtout : la date
   * n'apprend rien à qui doit corriger une adresse. La pastille pose le diagnostic, et
   * la phrase en dessous dit quand le message est revenu et quoi faire.
   */
  if (jalon === "rejete") return null;
  return demande.envoyeLe;
}

/**
 * Le motif tel qu'on peut l'afficher, ou null s'il n'apprend rien.
 *
 * La colonne porte deux sortes de valeurs : nos propres marqueurs - « simule »,
 * « rejet » -, que le libellé du jalon dit déjà en français, et la phrase du
 * fournisseur, qui est la seule à valoir d'être lue. « domain is not verified » désigne
 * le domaine à vérifier, « the recipient does not exist » l'adresse à corriger : c'est
 * ce qui dit quoi faire, et cela finissait dans le journal, où personne ne va.
 */
export function motifLisible(demande: SuiviDemande): string | null {
  if (!demande.motif) return null;
  if (demande.motif === MOTIF_REJET) return null;
  return demande.motif;
}

/**
 * Ce qu'il y a à faire, quand il y a quelque chose à faire.
 *
 * Une pastille rouge dit qu'il y a un problème ; elle ne dit pas comment en sortir. Le
 * conseil se pose sous la ligne, à côté du champ qu'il désigne et du bouton qui
 * l'applique - « corrigez l'adresse, puis relancez » n'a de sens que là.
 */
export function conseilDuJalon(demande: SuiviDemande): string | null {
  const jalon = jalonDeLEnvoi(demande);

  if (jalon === "rejete") {
    const quand = demande.envoyeLe;
    return (
      "Le message est revenu" +
      (quand
        ? " le " + quand.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
        : "") +
      " : cette adresse ne reçoit pas. Corrigez-la ci-dessus, puis relancez."
    );
  }

  if (jalon === "echec") return motifLisible(demande);
  return null;
}

export function libelleJalon(jalon: JalonEnvoi): string {
  if (jalon === "signee") return "Signé";
  if (jalon === "lien_ouvert") return "Lien ouvert";
  if (jalon === "mail_ouvert") return "Mail ouvert";
  if (jalon === "remis") return "Remis";
  if (jalon === "envoye") return "Envoyé";
  /* Le diagnostic, non le symptôme. « Adresse rejetée » décrit ce qu'a fait le serveur
     d'en face ; « Adresse incorrecte » dit ce qu'il faut en conclure, et donc quoi
     corriger - c'est la seule chose à faire de cette ligne. */
  if (jalon === "rejete") return "Adresse incorrecte";
  if (jalon === "echec") return "Non parti";
  return "Pas encore envoyé";
}

/**
 * Peut-on relancer cette personne ?
 *
 * Pas celle qui a signé - il n'y a plus rien à lui demander. Pas deux fois dans la
 * minute non plus : un double clic sur « Relancer » ne doit pas poster deux messages
 * identiques à quelqu'un qui n'a pas encore eu le temps d'ouvrir le premier.
 */
export const DELAI_ENTRE_RELANCES = 60_000;

export function peutRelancer(demande: SuiviDemande, maintenant: Date = new Date()): boolean {
  if (demande.signeeLe) return false;
  if (!demande.envoyeLe) return true;
  return maintenant.getTime() - demande.envoyeLe.getTime() >= DELAI_ENTRE_RELANCES;
}

/** Le dossier avance quand tout le monde a signé, pas avant. */
export function toutLeMondeASigne(demandes: DemandeSignature[]): boolean {
  return demandes.length > 0 && demandes.every((d) => d.signeeLe !== null);
}

export function resteASigner(demandes: DemandeSignature[]): number {
  return demandes.filter((d) => d.signeeLe === null).length;
}

/**
 * Ce qu'on dit de l'avancement, du point de vue du client.
 */
export function resumeSignatures(demandes: DemandeSignature[]): string {
  if (demandes.length === 0) return "Aucune signature demandée";

  const restant = resteASigner(demandes);
  if (restant === 0) return "Tous les associés ont signé";
  if (restant === 1) return "Il reste une signature";
  return "Il reste " + restant + " signatures";
}

/**
 * Une signature est un tracé : on n'accepte qu'une image PNG en ligne, produite
 * par la zone de signature. Refuser le reste évite qu'un contenu arbitraire soit
 * stocké puis réinjecté dans un document Word.
 */
/** Ce par quoi commence une image acceptée : rien d'autre n'entre dans un acte. */
export const PREFIXE_PNG = "data:image/png;base64,";
const TAILLE_MAXIMALE = 512 * 1024;

export class SignatureRefusee extends Error {
  readonly statut = 400;
  constructor(message: string) {
    super(message);
    this.name = "SignatureRefusee";
  }
}

export function verifierTrace(trace: string): void {
  if (!trace || !trace.startsWith(PREFIXE_PNG)) {
    throw new SignatureRefusee("Signature invalide");
  }
  if (trace.length > TAILLE_MAXIMALE) {
    throw new SignatureRefusee("Signature trop volumineuse");
  }

  const donnees = trace.slice(PREFIXE_PNG.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(donnees)) {
    throw new SignatureRefusee("Signature invalide");
  }
}

/** Phase du dossier une fois toutes les signatures recueillies. */
export const PHASE_APRES_SIGNATURE = 5;
