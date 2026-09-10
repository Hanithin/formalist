import crypto from "node:crypto";

/**
 * Les événements que Resend nous renvoie sur le sort d'un message.
 *
 * Envoyer un courriel ne dit pas qu'il est arrivé. Le fournisseur l'accepte, puis le
 * remet - ou le rend, parce que l'adresse n'existe pas, parce que la boîte est pleine,
 * parce qu'un serveur l'a classé indésirable. Sans ces avis, l'écran ne peut affirmer
 * qu'une chose : que nous l'avons posté. C'est ce qu'il disait, et le client qui
 * attendait une signature n'avait rien de plus.
 *
 * La route qui les reçoit est publique - Resend appelle depuis ses serveurs et n'a pas
 * de session chez nous. Son authentification est la signature du corps, vérifiée avant
 * toute lecture : sans elle, n'importe qui pourrait annoncer qu'un message a rebondi, ou
 * qu'il a été ouvert.
 */

/** Ce qu'un avis nous apprend, une fois traduit dans nos termes. */
export type SortDuMessage = "remis" | "ouvert" | "rendu" | "indesirable";

export interface AvisDeResend {
  /** L'identifiant rendu à l'envoi : c'est par lui que l'avis retrouve sa demande. */
  identifiant: string;
  sort: SortDuMessage;
  quand: Date;
}

/**
 * Resend nomme ses événements ; nous ne retenons que ceux qui changent ce qu'on affiche.
 *
 * « delivery_delayed » et « clicked » sont volontairement ignorés : le premier ne
 * conclut rien - le message est en route, on le saura -, le second dirait « lien
 * cliqué » là où l'ouverture de la page de signature le dit déjà, et mieux.
 */
const SORTS: Record<string, SortDuMessage> = {
  "email.delivered": "remis",
  "email.opened": "ouvert",
  "email.bounced": "rendu",
  "email.complained": "indesirable",
};

/**
 * Vérifie la signature Svix dont Resend accompagne chaque appel.
 *
 * Le calcul porte sur les octets reçus, non sur un JSON reparsé puis réécrit : une
 * réécriture change l'ordre des clés ou les espaces, et la signature ne correspond plus.
 *
 * L'horodatage entre dans le calcul et se contrôle aussi : sans cela, un appel légitime
 * intercepté resterait rejouable indéfiniment, avec sa signature valide.
 */
const TOLERANCE = 5 * 60_000;

export class AvisRefuse extends Error {
  readonly statut = 400;
  constructor(message: string) {
    super(message);
    this.name = "AvisRefuse";
  }
}

export function verifierSignature(
  corps: string,
  entetes: { id: string | null; horodatage: string | null; signature: string | null },
  secret: string
): void {
  if (!entetes.id || !entetes.horodatage || !entetes.signature) {
    throw new AvisRefuse("Avis non signé");
  }

  const emis = Number(entetes.horodatage) * 1000;
  if (!Number.isFinite(emis) || Math.abs(Date.now() - emis) > TOLERANCE) {
    throw new AvisRefuse("Avis hors délai");
  }

  /* Le secret est communiqué préfixé - « whsec_… » -, la clé est ce qui suit, en
     base64. Signer avec le préfixe donne une signature qui ne correspond à rien. */
  const cle = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const attendue = crypto
    .createHmac("sha256", cle)
    .update(entetes.id + "." + entetes.horodatage + "." + corps)
    .digest("base64");

  /*
   * L'en-tête porte plusieurs signatures, séparées par des espaces et préfixées de leur
   * version : c'est ainsi qu'une clé se remplace sans interruption, les deux valant
   * pendant la bascule. Il suffit qu'une corresponde.
   */
  const proposees = entetes.signature
    .split(" ")
    .filter((s) => s.startsWith("v1,"))
    .map((s) => s.slice(3));

  const bonne = proposees.some((proposee) => {
    const a = Buffer.from(proposee, "base64");
    const b = Buffer.from(attendue, "base64");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });

  if (!bonne) throw new AvisRefuse("Signature invalide");
}

/**
 * Traduit un avis reçu, ou rend null s'il ne nous concerne pas.
 *
 * Un avis qu'on ignore n'est pas une erreur : Resend envoie tout ce qui est souscrit, et
 * refuser ce qu'on ne traite pas le ferait réessayer indéfiniment.
 */
export function avisDeResend(charge: unknown): AvisDeResend | null {
  if (!charge || typeof charge !== "object") return null;

  const { type, created_at, data } = charge as {
    type?: string;
    created_at?: string;
    data?: { email_id?: string };
  };

  const sort = type ? SORTS[type] : undefined;
  if (!sort || !data?.email_id) return null;

  const quand = created_at ? new Date(created_at) : new Date();
  return {
    identifiant: data.email_id,
    sort,
    quand: Number.isNaN(quand.getTime()) ? new Date() : quand,
  };
}
