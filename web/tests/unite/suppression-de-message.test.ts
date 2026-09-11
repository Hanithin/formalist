import { describe, it, expect } from "vitest";
import { peutSupprimerUnMessage, MENTION_SUPPRIME } from "@/domain/messagerie/messages";

/**
 * Qui peut retirer un message d'un fil de dossier.
 *
 * L'avocat qui le tient, et lui seul. Un client ne retire pas ce qu'il a écrit à son
 * conseil : ce qui s'échange là fait partie du dossier, et l'y laisser est précisément
 * ce qui permet à chacun de s'y référer plus tard. L'avocat, lui, en répond - c'est à
 * lui d'écarter un relevé bancaire posté en clair ou un fichier destiné à un autre
 * dossier, fût-il écrit par le client.
 */
describe("le droit de retirer un message", () => {
  it("appartient à l'avocat", () => {
    expect(peutSupprimerUnMessage(["avocat"])).toBe(true);
  });

  it("appartient aussi à l'administrateur, qui répond de la plateforme", () => {
    expect(peutSupprimerUnMessage(["admin"])).toBe(true);
  });

  it("n'appartient pas au client, même pour ses propres messages", () => {
    /* Le geste n'existe pas de son côté : ni la croix à l'écran, ni la route, qui
       refuse sans regarder qui a écrit le message. */
    expect(peutSupprimerUnMessage(["user"])).toBe(false);
    expect(peutSupprimerUnMessage([])).toBe(false);
  });

  it("suit un rôle parmi d'autres", () => {
    /* Un compte porte plusieurs rôles : c'en avoir un qui donne le droit suffit. */
    expect(peutSupprimerUnMessage(["user", "avocat"])).toBe(true);
  });
});

describe("la mention qui tient la place", () => {
  it("ne laisse rien deviner du contenu retiré", () => {
    /* Elle dit qu'il y avait là quelque chose - un trou sans explication dans une
       conversation déjà lue serait pire - et rien de plus. */
    expect(MENTION_SUPPRIME).toBe("Message supprimé");
  });
});
