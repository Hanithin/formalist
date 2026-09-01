import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import { encaissementDe } from "@/infrastructure/paiement/stripe";

/**
 * La lecture d'un avis de paiement.
 *
 * C'est elle qui décide qu'un dossier part chez l'avocat. Se tromper d'un état laisse
 * un client aller au bout du parcours, régler, et ne rien voir arriver - une panne
 * silencieuse, du côté où l'argent a déjà changé de main.
 */
function avis(session: Partial<Stripe.Checkout.Session>): Stripe.Event {
  return {
    type: "checkout.session.completed",
    data: { object: { id: "cs_essai", status: "complete", ...session } },
  } as unknown as Stripe.Event;
}

describe("l'état d'un encaissement", () => {
  it("reconnaît un paiement abouti", () => {
    const lu = encaissementDe(avis({ payment_status: "paid", metadata: { dossier: "42" } }));
    expect(lu).toMatchObject({ dossierId: 42, payee: true });
  });

  /*
   * Un code promotionnel de cent pour cent ramène le total à zéro. Stripe rend alors
   * « paid » sur ce chemin - vérifié sur une session menée jusqu'au bout - et le
   * dossier doit être confié comme n'importe quel autre.
   */
  it("confie un dossier réglé entièrement par un code promotionnel", () => {
    const lu = encaissementDe(
      avis({ payment_status: "paid", amount_total: 0, metadata: { dossier: "42" } })
    );
    expect(lu?.payee).toBe(true);
  });

  /*
   * Le troisième état de Stripe : une session menée à son terme sans qu'un moyen de
   * paiement ait été demandé. Le traiter comme impayé ferait dépendre la confirmation
   * d'un détail qui ne nous appartient pas.
   */
  it("traite « aucun paiement requis » comme réglé", () => {
    const lu = encaissementDe(
      avis({ payment_status: "no_payment_required", amount_total: 0, metadata: { dossier: "42" } })
    );
    expect(lu?.payee).toBe(true);
  });

  it("ne confie rien tant que le paiement n'a pas abouti", () => {
    const lu = encaissementDe(avis({ payment_status: "unpaid", metadata: { dossier: "42" } }));
    expect(lu?.payee).toBe(false);
  });

  /* Une consultation et un dossier se confirment séparément : les confondre confirmerait
     la mauvaise chose. */
  it("sépare une consultation d'un dossier", () => {
    const dossier = encaissementDe(avis({ payment_status: "paid", metadata: { dossier: "7" } }));
    expect(dossier).toMatchObject({ dossierId: 7, consultationId: null });

    const consultation = encaissementDe(
      avis({ payment_status: "paid", metadata: { consultation: "9" } })
    );
    expect(consultation).toMatchObject({ dossierId: null, consultationId: 9 });
  });

  it("ignore un événement qui ne parle pas de règlement", () => {
    const autre = { type: "customer.created", data: { object: {} } } as unknown as Stripe.Event;
    expect(encaissementDe(autre)).toBeNull();
  });
});
