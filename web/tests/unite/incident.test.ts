import { describe, expect, it } from "vitest";
import {
  empreinteDe,
  estUnIncident,
  messageNormalise,
  observer,
  pileNettoyee,
} from "@/domain/exploitation/incident";

/**
 * Ce qu'on retient d'une panne, et ce qu'on refuse d'en retenir.
 *
 * Deux exigences se tiennent ensemble ici. Le journal doit regrouper : mille fois la
 * même panne ne fait pas mille lignes à lire. Et il ne doit pas devenir un second
 * fichier de données personnelles : le message d'une erreur recopie volontiers ce que
 * le client a saisi - une adresse refusée par une contrainte, un courriel invalide, un
 * numéro de dossier.
 *
 * Le même masquage sert les deux : ce qui varie d'une occurrence à l'autre est
 * précisément ce qu'il ne faut pas garder.
 */

describe("ce que le journal écrit", () => {
  it("masque les courriels", () => {
    expect(messageNormalise("Adresse refusée : claire.dufour@exemple.fr")).toBe(
      "Adresse refusée : <courriel>"
    );
  });

  it("masque les identifiants et les nombres", () => {
    expect(messageNormalise("Le dossier 74732 est introuvable")).toBe(
      "Le dossier <n> est introuvable"
    );
    expect(messageNormalise("Jeton 550e8400-e29b-41d4-a716-446655440000 inconnu")).toContain(
      "<identifiant>"
    );
  });

  it("masque un SIREN comme un numéro", () => {
    expect(messageNormalise("SIREN 940577380 déjà pris")).toBe("SIREN <numero> déjà pris");
  });

  it("tronque un message interminable", () => {
    const observe = observer(new Error("x".repeat(900)));
    expect(observe.message.length).toBeLessThanOrEqual(400);
  });
});

describe("le regroupement des occurrences", () => {
  const erreur = (message: string) => {
    const e = new Error(message);
    e.stack = "Error: " + message + "\n    at lire (/app/src/domain/lecture.ts:12:5)";
    return e;
  };

  it("réunit la même panne rencontrée sur deux dossiers", () => {
    /* Sans cela, la liste compterait une ligne par dossier plutôt qu'une ligne par
       panne, et l'on ne verrait plus laquelle revient. */
    const a = observer(erreur("Le dossier 74732 est introuvable"));
    const b = observer(erreur("Le dossier 88104 est introuvable"));
    expect(a.empreinte).toBe(b.empreinte);
  });

  it("sépare deux pannes de causes différentes", () => {
    const a = observer(erreur("Le dossier est introuvable"));
    const b = observer(erreur("La société est introuvable"));
    expect(a.empreinte).not.toBe(b.empreinte);
  });

  it("ne dépend pas du chemin qui l'a rencontrée", () => {
    /* La même erreur de base atteinte par trois routes reste une seule panne : c'est la
       pile qui dit d'où elle vient. */
    const a = observer(erreur("Connexion perdue"), { chemin: "/api/dossiers" });
    const b = observer(erreur("Connexion perdue"), { chemin: "/api/signature" });
    expect(a.empreinte).toBe(b.empreinte);
  });

  it("ne dépend pas de l'endroit où tourne le serveur", () => {
    /* Les chemins absolus diffèrent entre un poste de travail et le conteneur : sans
       les couper, la même panne ferait deux lignes selon la machine. */
    const ici = new Error("Panne");
    ici.stack = "Error: Panne\n    at lire (/Users/quelquun/formalist/web/src/lib/a.ts:3:1)";
    const laBas = new Error("Panne");
    laBas.stack = "Error: Panne\n    at lire (/app/src/lib/a.ts:3:1)";
    expect(empreinteDe(observer(ici))).toBe(empreinteDe(observer(laBas)));
  });
});

describe("la pile retenue", () => {
  it("ne garde que ce qui est à nous", () => {
    const pile = [
      "Error: Panne",
      "    at lire (/app/src/domain/lecture.ts:12:5)",
      "    at handler (/app/node_modules/next/dist/server/route.js:88:1)",
      "    at process (node:internal/process/task_queues:95:5)",
    ].join("\n");
    const nettoyee = pileNettoyee(pile) ?? "";
    expect(nettoyee).toContain("src/domain/lecture.ts");
    expect(nettoyee).not.toContain("node_modules");
    expect(nettoyee).not.toContain("node:internal");
  });

  it("rend null quand il n'y a pas de pile", () => {
    expect(pileNettoyee(null)).toBeNull();
  });

  it("masque le message que sa première ligne répète", () => {
    /* Masquer le message et laisser la pile en garder la version brute juste en dessous
       ne masquerait rien du tout. */
    const pile = "Error: Le dossier 74732 est introuvable\n    at lire (/app/src/a.ts:12:5)";
    const nettoyee = pileNettoyee(pile) ?? "";
    expect(nettoyee).not.toContain("74732");
    expect(nettoyee).toContain("<n>");
  });

  it("garde les numéros de ligne des cadres", () => {
    /* Ce sont des nombres, mais ceux-là on veut les lire. */
    const pile = "Error: Panne\n    at lire (/app/src/a.ts:12:5)";
    expect(pileNettoyee(pile) ?? "").toContain(":12:5");
  });
});

describe("ce qui n'est pas un incident", () => {
  it("écarte les redirections de Next", () => {
    /* `redirect()` et `notFound()` lèvent une exception : c'est la mécanique du
       framework, pas une panne. Sans ce tri, chaque page protégée remplirait la liste. */
    const redirection = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;..." });
    expect(estUnIncident(redirection)).toBe(false);

    const introuvable = Object.assign(new Error("x"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(estUnIncident(introuvable)).toBe(false);
  });

  it("retient une vraie erreur", () => {
    expect(estUnIncident(new Error("Connexion perdue"))).toBe(true);
  });

  it("retient ce qui n'est pas une Error", () => {
    const observe = observer("quelque chose a été lancé");
    expect(estUnIncident("quelque chose a été lancé")).toBe(true);
    expect(observe.type).toBe("string");
    expect(observe.pile).toBeNull();
  });
});
