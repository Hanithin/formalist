import Stripe from "stripe";
import { journal } from "@/lib/journal";

/**
 * Le client Stripe, créé au premier usage.
 *
 * Paresseux pour la même raison que le client Prisma : « next build » importe chaque
 * module de route pour en collecter la configuration, et la clé est un secret
 * d'exécution. Un client construit à l'import ferait échouer la construction de
 * l'image partout où le secret n'est pas encore posé.
 */

export class PaiementIndisponible extends Error {
  readonly statut = 503;
  constructor(message = "Le paiement est momentanément indisponible.") {
    super(message);
    this.name = "PaiementIndisponible";
  }
}

/**
 * Une clé de production n'a rien à faire ailleurs qu'en production.
 *
 * Sans ce garde-fou, un « npm run dev » lancé avec le mauvais fichier
 * d'environnement crée des clients, des paiements et des remboursements réels dans
 * le compte Stripe de l'entreprise. La clé de test, elle, est refusée nulle part :
 * une production configurée en test échouerait au premier encaissement, ce qui se
 * voit tout de suite, alors que l'inverse ne se voit qu'en relevé bancaire.
 */
function verifierLeMode(cle: string): void {
  if (cle.startsWith("sk_live_") && process.env.NODE_ENV !== "production") {
    throw new PaiementIndisponible(
      "Clé Stripe de production hors production : refusé. Utilisez une clé sk_test_ en développement."
    );
  }
}

let client: Stripe | undefined;

export function stripe(): Stripe {
  if (client) return client;

  const cle = process.env.STRIPE_SECRET_KEY;
  if (!cle) throw new PaiementIndisponible("STRIPE_SECRET_KEY manquante");
  verifierLeMode(cle);

  client = new Stripe(cle);
  return client;
}

/** Le paiement est-il configuré ? La page le demande avant de proposer de payer. */
export function paiementConfigure(): boolean {
  const cle = process.env.STRIPE_SECRET_KEY;
  if (!cle) return false;
  try {
    verifierLeMode(cle);
    return true;
  } catch {
    return false;
  }
}

/* ---------- Ouvrir un paiement ---------- */

export interface DemandeDePaiement {
  /** La consultation réglée, ou le dossier quand c'est une formalité. */
  consultationId?: number;
  dossierId?: number;
  /** Ce qui est acheté, tel que le client le lira sur la page de Stripe. */
  intitule: string;
  /** Montant total encaissé, taxes comprises. */
  montantCentimes: number;
  email: string;
  /** Adresse de retour, avec {SESSION} là où Stripe posera l'identifiant. */
  retour: string;
  abandon: string;
  /** La session expire avec la réservation : les deux délais doivent coïncider. */
  expireDans: number;
}

/**
 * Ouvre une session de paiement hébergée et rend son adresse.
 *
 * Hébergée, et non des champs de carte dans nos pages : aucune donnée bancaire ne
 * traverse l'application, et la politique de sécurité de contenu n'a pas à s'ouvrir
 * aux scripts de Stripe. Le client part chez Stripe et revient.
 */
export async function ouvrirPaiement(demande: DemandeDePaiement) {
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    /*
     * Le prix reste en euros, quel que soit l'endroit d'où l'on se connecte.
     *
     * Sans ce réglage, Stripe suit le tableau de bord, et sa tarification adaptative
     * proposait au client une devise locale - « 497,00 $US » à côté de « 414,00 € » -
     * avec 3,60 % de frais de conversion à sa charge. Nos offres sont annoncées en
     * euros hors taxes, la TVA est française, et personne n'a demandé cette conversion.
     *
     * Posé ici plutôt que dans le tableau de bord : un réglage d'interface se remet un
     * jour sans que personne le remarque, et c'est le prix affiché au client qui change.
     */
    adaptive_pricing: { enabled: false },
    /*
     * Les codes promotionnels s'appliquent sur la page de Stripe.
     *
     * Les coupons se créent dans le tableau de bord et n'ont donc rien à déployer. Une
     * remise ne perturbe rien en aval : la confirmation ne regarde que l'état du
     * paiement, jamais le montant, et l'application ne conserve que la référence de
     * session - aucun montant réglé qu'une remise rendrait faux.
     */
    allow_promotion_codes: true,
    customer_email: demande.email,
    client_reference_id: String(demande.consultationId ?? demande.dossierId),
    /*
     * L'objet réglé est retrouvé par là au retour du webhook, qui ne reçoit que la
     * session : sans ce lien, un encaissement ne saurait pas quoi confirmer. Les deux
     * clés cohabitent - une consultation et un dossier n'ont rien à voir, et les
     * confondre confirmerait la mauvaise chose.
     */
    metadata: demande.consultationId
      ? { consultation: String(demande.consultationId) }
      : { dossier: String(demande.dossierId) },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: demande.montantCentimes,
          product_data: { name: demande.intitule },
        },
      },
    ],
    expires_at: Math.floor(Date.now() / 1000) + demande.expireDans,
    success_url: demande.retour.replace("{SESSION}", "{CHECKOUT_SESSION_ID}"),
    cancel_url: demande.abandon,
  });

  if (!session.url) {
    // Stripe a créé la session mais n'a pas d'adresse à présenter : rien à faire
    // côté client, et surtout ne pas laisser croire que le paiement est ouvert.
    throw new PaiementIndisponible();
  }

  return { reference: session.id, adresse: session.url };
}

/* ---------- Relire un paiement ---------- */

export interface Encaissement {
  reference: string;
  /** L'un des deux est renseigné : une session règle une consultation ou un dossier. */
  consultationId: number | null;
  dossierId: number | null;
  payee: boolean;
  expiree: boolean;
}

/** Un identifiant de métadonnée, ou null s'il n'en est pas un. */
function identifiant(brut: string | null | undefined): number | null {
  const nombre = Number(brut);
  return Number.isInteger(nombre) && nombre > 0 ? nombre : null;
}

function lire(session: Stripe.Checkout.Session): Encaissement {
  /*
   * On ne retombe sur client_reference_id que pour une consultation : c'est ce que
   * faisaient les sessions ouvertes avant que les dossiers ne se règlent aussi ici,
   * et elles doivent continuer de se confirmer.
   */
  const dossierId = identifiant(session.metadata?.dossier);
  const consultationId = dossierId
    ? null
    : identifiant(session.metadata?.consultation ?? session.client_reference_id);

  return {
    reference: session.id,
    consultationId,
    dossierId,
    /*
     * « Payé » couvre aussi ce qui n'avait rien à payer.
     *
     * Stripe rend trois états : « paid », « unpaid » et « no_payment_required ». Le
     * dernier désigne une session menée à son terme sans qu'un moyen de paiement ait
     * été demandé. Un code promotionnel de cent pour cent, lui, rend bien « paid » sur
     * ce chemin - vérifié sur une session à zéro euro menée jusqu'au bout - mais ne
     * reconnaître que « paid » ferait dépendre la confirmation d'un détail de Stripe
     * qui ne nous appartient pas : le troisième état existe, et l'ignorer laisserait
     * un client aller au bout du parcours sans que rien ne parte chez l'avocat.
     */
    payee:
      session.payment_status === "paid" || session.payment_status === "no_payment_required",
    expiree: session.status === "expired",
  };
}

/**
 * L'état d'une session, demandé à Stripe.
 *
 * Sert au retour du client : un webhook peut arriver en retard, ou pas du tout si le
 * relais n'est pas en marche. Le client ne doit pas rester devant une consultation
 * non confirmée alors qu'il vient de payer.
 */
export async function relirePaiement(reference: string): Promise<Encaissement> {
  const session = await stripe().checkout.sessions.retrieve(reference);
  return lire(session);
}

/* ---------- Le webhook ---------- */

export class SignatureInvalide extends Error {
  readonly statut = 400;
  constructor() {
    super("Signature invalide");
    this.name = "SignatureInvalide";
  }
}

/**
 * Vérifie qu'un appel vient bien de Stripe.
 *
 * C'est la seule authentification de cette route : elle est publique, et n'importe
 * qui peut lui envoyer un corps de requête prétendant qu'une consultation est payée.
 * La signature est donc vérifiée sur le corps brut - reformaté, il ne correspondrait
 * plus.
 */
export function evenementDeStripe(corpsBrut: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new PaiementIndisponible("STRIPE_WEBHOOK_SECRET manquante");
  if (!signature) throw new SignatureInvalide();

  try {
    return stripe().webhooks.constructEvent(corpsBrut, signature, secret);
  } catch (e) {
    journal.warn({ err: e }, "Webhook Stripe rejeté");
    throw new SignatureInvalide();
  }
}

/** Ce qu'un événement de paiement nous apprend, ou null s'il ne nous concerne pas. */
export function encaissementDe(evenement: Stripe.Event): Encaissement | null {
  if (
    evenement.type === "checkout.session.completed" ||
    evenement.type === "checkout.session.expired" ||
    evenement.type === "checkout.session.async_payment_succeeded" ||
    evenement.type === "checkout.session.async_payment_failed"
  ) {
    return lire(evenement.data.object);
  }
  return null;
}

/* ---------- Rembourser ---------- */

/**
 * Rembourse l'intégralité d'un encaissement.
 *
 * Le remboursement porte sur le paiement, pas sur la session : c'est l'intention de
 * paiement qu'on retrouve depuis la session, et elle seule peut être remboursée.
 */
export async function rembourser(reference: string): Promise<{ rembourse: boolean }> {
  const session = await stripe().checkout.sessions.retrieve(reference);

  const paiement =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (!paiement || session.payment_status !== "paid") {
    // Rien n'a été encaissé : il n'y a rien à rendre, et ce n'est pas une erreur.
    return { rembourse: false };
  }

  await stripe().refunds.create({ payment_intent: paiement });
  return { rembourse: true };
}
