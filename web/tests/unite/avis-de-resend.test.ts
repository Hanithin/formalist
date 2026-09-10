import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifierSignature, avisDeResend, AvisRefuse } from "@/infrastructure/mail/evenements";

/**
 * La route qui reçoit les avis de Resend est publique, comme celle de Stripe.
 *
 * C'est nécessaire - le fournisseur appelle depuis ses serveurs et n'a pas de session
 * chez nous - et c'est ce qui rend la vérification indispensable : sans elle, n'importe
 * qui pourrait annoncer qu'un message a rebondi, ou qu'il a été ouvert par quelqu'un qui
 * ne l'a jamais reçu.
 */

const SECRET = "whsec_" + Buffer.from("un secret de vérification").toString("base64");

function signer(corps: string, id: string, horodatage: string, secret = SECRET) {
  const cle = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signature = crypto
    .createHmac("sha256", cle)
    .update(id + "." + horodatage + "." + corps)
    .digest("base64");
  return { id, horodatage, signature: "v1," + signature };
}

const MAINTENANT = () => String(Math.floor(Date.now() / 1000));

describe("la vérification d'un avis de Resend", () => {
  it("accepte un avis correctement signé", () => {
    const corps = '{"type":"email.delivered"}';
    expect(() =>
      verifierSignature(corps, signer(corps, "msg_1", MAINTENANT()), SECRET)
    ).not.toThrow();
  });

  it("refuse un avis non signé", () => {
    expect(() =>
      verifierSignature("{}", { id: null, horodatage: null, signature: null }, SECRET)
    ).toThrow(AvisRefuse);
  });

  it("refuse un corps modifié après signature", () => {
    /* C'est l'attaque que la signature écarte : un avis légitime intercepté, dont on
       change l'identifiant de message pour marquer une autre demande comme rejetée. */
    const entetes = signer('{"type":"email.delivered"}', "msg_1", MAINTENANT());
    expect(() => verifierSignature('{"type":"email.bounced"}', entetes, SECRET)).toThrow(
      AvisRefuse
    );
  });

  it("refuse une signature calculée avec un autre secret", () => {
    const corps = "{}";
    const autre = "whsec_" + Buffer.from("un autre secret").toString("base64");
    expect(() =>
      verifierSignature(corps, signer(corps, "msg_1", MAINTENANT(), autre), SECRET)
    ).toThrow(AvisRefuse);
  });

  it("refuse un avis trop ancien", () => {
    /* Sans contrôle de l'horodatage, un appel légitime intercepté resterait rejouable
       indéfiniment, avec sa signature valide - de quoi remettre une demande dans un
       état qu'elle a quitté. */
    const vieux = String(Math.floor(Date.now() / 1000) - 3600);
    const corps = "{}";
    expect(() => verifierSignature(corps, signer(corps, "msg_1", vieux), SECRET)).toThrow(
      AvisRefuse
    );
  });

  it("accepte l'une quelconque des signatures proposées", () => {
    /* Plusieurs versions cohabitent le temps qu'une clé se remplace : il suffit qu'une
       corresponde, sans quoi la bascule couperait le suivi. */
    const corps = "{}";
    const horodatage = MAINTENANT();
    const bonne = signer(corps, "msg_1", horodatage).signature;
    const entetes = { id: "msg_1", horodatage, signature: "v1,QUlF " + bonne };
    expect(() => verifierSignature(corps, entetes, SECRET)).not.toThrow();
  });
});

describe("la lecture d'un avis", () => {
  it("traduit ce qui change ce qu'on affiche", () => {
    const avis = avisDeResend({
      type: "email.delivered",
      created_at: "2026-09-08T09:00:00.000Z",
      data: { email_id: "msg_1" },
    });
    expect(avis).toEqual({
      identifiant: "msg_1",
      sort: "remis",
      quand: new Date("2026-09-08T09:00:00.000Z"),
    });
  });

  it("ignore ce qui ne conclut rien", () => {
    /* Un avis ignoré n'est pas une erreur : le refuser ferait réessayer Resend
       indéfiniment sur un message que nous avons bien reçu. */
    expect(
      avisDeResend({ type: "email.delivery_delayed", data: { email_id: "msg_1" } })
    ).toBeNull();
    expect(avisDeResend({ type: "email.delivered" })).toBeNull();
    expect(avisDeResend(null)).toBeNull();
  });

  it("rattache l'avis par l'identifiant du message, jamais par l'adresse", () => {
    /* La même personne peut avoir deux demandes en cours dans deux dossiers : son
       adresse ne dit pas laquelle a rebondi. */
    const avis = avisDeResend({
      type: "email.bounced",
      data: { email_id: "msg_2", to: ["jean@exemple.fr"] },
    });
    expect(avis?.identifiant).toBe("msg_2");
    expect(avis?.sort).toBe("rendu");
  });
});
