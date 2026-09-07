import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { chiffrer, dechiffrer, chiffrementDisponible, ChiffrementNonConfigure } from "@/lib/chiffrement";

/**
 * Le chiffrement des identifiants du guichet.
 *
 * Il se distingue du hachage des mots de passe de l'application : celui-ci se vérifie
 * sans jamais se relire, celui-là doit être rejoué auprès de l'INPI. Ce qui suit vérifie
 * les trois propriétés dont dépend ce choix - on relit ce qu'on a écrit, deux
 * chiffrements du même secret ne se ressemblent pas, et un message modifié est refusé
 * plutôt que rendu de travers.
 */

const CLE = "a".repeat(64);
const ENV = { ...process.env };

beforeEach(() => {
  process.env.GUICHET_CLE = CLE;
});

afterEach(() => {
  process.env = { ...ENV };
});

describe("le chiffrement des secrets", () => {
  it("rend ce qu'on lui a confié", () => {
    const secret = "mot-de-passe-e-procedures-2026";
    expect(dechiffrer(chiffrer(secret))).toBe(secret);
  });

  it("garde les accents et les caractères hors ASCII", () => {
    const secret = "Mot dé passé — ç@ëù€";
    expect(dechiffrer(chiffrer(secret))).toBe(secret);
  });

  /*
   * Deux chiffrements du même secret diffèrent : le vecteur est tiré au hasard. Sans
   * cela, deux avocats portant le même mot de passe se reconnaîtraient dans la base.
   */
  it("ne produit jamais deux fois le même message", () => {
    expect(chiffrer("identique")).not.toBe(chiffrer("identique"));
  });

  /*
   * Le sceau fait son travail. Sans lui, un octet retourné dans la base donnerait un
   * mot de passe différent, envoyé tel quel à l'INPI - et l'erreur ressemblerait à une
   * faute de frappe de l'avocat.
   */
  it("refuse un message modifié plutôt que de le rendre de travers", () => {
    const [vecteur, sceau, message] = chiffrer("secret").split(".");
    const abime = message.slice(0, -2) + (message.slice(-2) === "AA" ? "AB" : "AA");

    expect(() => dechiffrer([vecteur, sceau, abime].join("."))).toThrow();
  });

  it("refuse un secret dont il manque un morceau", () => {
    expect(() => dechiffrer("juste-une-chaine")).toThrow("Secret illisible");
  });

  /*
   * Une clé trop courte n'est pas allongée en silence : ce serait chiffrer moins bien
   * qu'annoncé sans que personne le sache.
   */
  it("exige une clé de trente-deux octets", () => {
    process.env.GUICHET_CLE = "trop-courte";
    expect(() => chiffrer("secret")).toThrow(ChiffrementNonConfigure);
    expect(chiffrementDisponible()).toBe(false);

    delete process.env.GUICHET_CLE;
    expect(() => chiffrer("secret")).toThrow(ChiffrementNonConfigure);
  });

  /* L'hexadécimal et le base64 sont les deux formes qu'un générateur rend. */
  it("accepte la clé en hexadécimal comme en base64", () => {
    expect(chiffrementDisponible()).toBe(true);

    process.env.GUICHET_CLE = Buffer.alloc(32, 7).toString("base64");
    expect(dechiffrer(chiffrer("secret"))).toBe("secret");
  });
});
