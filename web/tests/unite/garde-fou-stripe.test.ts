import { describe, it, expect, afterEach } from "vitest";
import { paiementConfigure } from "@/infrastructure/paiement/stripe";

/**
 * Une clé de production n'a rien à faire ailleurs qu'en production.
 *
 * Ce garde-fou existe parce que le compte Stripe utilisé est un compte réel, qui sert
 * déjà un autre site. Sans lui, un « npm run dev » lancé avec le mauvais fichier
 * d'environnement crée des clients, des paiements et des remboursements véritables :
 * une erreur qui ne se voit qu'en relevé bancaire, et qu'on ne peut pas défaire.
 *
 * L'inverse n'est pas gardé : une production configurée en test échouerait au premier
 * encaissement, ce qui se voit immédiatement.
 */
const CLE_ORIGINE = process.env.STRIPE_SECRET_KEY;
const ENV_ORIGINE = process.env.NODE_ENV;

function poser(cle: string | undefined, environnement: string) {
  if (cle === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = cle;
  // NODE_ENV est en lecture seule dans les types, pas à l'exécution.
  (process.env as Record<string, string>).NODE_ENV = environnement;
}

afterEach(() => {
  poser(CLE_ORIGINE, ENV_ORIGINE ?? "test");
});

describe("le garde-fou de la clé Stripe", () => {
  it("refuse une clé de production hors production", () => {
    poser("sk_live_quelquechose", "development");
    expect(paiementConfigure()).toBe(false);

    poser("sk_live_quelquechose", "test");
    expect(paiementConfigure()).toBe(false);
  });

  it("accepte une clé de test en développement", () => {
    poser("sk_test_quelquechose", "development");
    expect(paiementConfigure()).toBe(true);
  });

  it("accepte une clé de production en production", () => {
    poser("sk_live_quelquechose", "production");
    expect(paiementConfigure()).toBe(true);
  });

  it("sans clé, le paiement n'est pas configuré", () => {
    poser(undefined, "development");
    expect(paiementConfigure()).toBe(false);
  });

  it("la configuration locale est bien en mode test", () => {
    // Le garde-fou ne sert à rien si personne ne regarde ce qui est réellement posé.
    const cle = CLE_ORIGINE;
    if (!cle) return;
    expect(cle.startsWith("sk_live_")).toBe(false);
  });
});
