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
  consultationId: number;
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
    customer_email: demande.email,
    client_reference_id: String(demande.consultationId),
    // La consultation est retrouvée par là au retour du webhook, qui ne reçoit que
    // la session : sans ce lien, un encaissement ne saurait pas quoi confirmer.
    metadata: { consultation: String(demande.consultationId) },
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
  consultationId: number | null;
  payee: boolean;
  expiree: boolean;
}

function lire(session: Stripe.Checkout.Session): Encaissement {
  const brut = session.metadata?.consultation ?? session.client_reference_id;
  const consultationId = Number(brut);

  return {
    reference: session.id,
    consultationId: Number.isInteger(consultationId) && consultationId > 0 ? consultationId : null,
    payee: session.payment_status === "paid",
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
