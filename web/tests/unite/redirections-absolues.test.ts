import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { adresseDeRetour } from "@/lib/site";

/**
 * Une redirection ne se bâtit pas sur l'adresse de la requête.
 *
 * En production, le conteneur écoute sur 0.0.0.0 - c'est ce que dit le Dockerfile, et
 * c'est ce que `requete.url` porte dans un gestionnaire de route. Une redirection
 * construite dessus renvoie le navigateur vers http://0.0.0.0:3000, qui ne mène nulle
 * part depuis un poste de client.
 *
 * Trois chemins en souffraient, et ce sont les trois qu'on atteint depuis l'extérieur :
 * la confirmation d'inscription, l'acceptation d'une invitation d'équipe, et le retour
 * de Stripe après un paiement. Le premier geste d'un nouveau client échouait donc, en
 * silence - il recevait son courriel, cliquait, et tombait dans le vide.
 *
 * `adresseDeRetour` répond pour eux : l'adresse déclarée de l'application, et celle de
 * la requête seulement à défaut - en développement, où le port varie.
 */

function fichiersDeRoute(racine: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(racine, { withFileTypes: true })) {
    const chemin = path.join(racine, entree.name);
    if (entree.isDirectory()) trouves.push(...fichiersDeRoute(chemin));
    else if (entree.name === "route.ts") trouves.push(chemin);
  }
  return trouves;
}

describe("les redirections des routes", () => {
  it("ne se bâtissent jamais sur l'adresse de la requête", () => {
    const fautives: string[] = [];

    for (const fichier of fichiersDeRoute("src/app/api")) {
      const source = readFileSync(fichier, "utf-8");
      /*
       * On ne cherche pas `new URL(..., requete.url)` en général : lire un paramètre de
       * l'adresse demandée est légitime et fréquent. C'est la redirection qui compte,
       * et elle se reconnaît à sa destination relative bâtie sur la requête.
       */
      for (const m of source.matchAll(/new URL\(\s*(["'`][^"'`]*["'`]|[^,)]+),\s*(requete|request)\.url\s*\)/g)) {
        const premier = m[1].trim();
        /* `new URL(requete.url)` seul lit l'adresse ; c'est la forme à deux temps qui bâtit. */
        if (/^(requete|request)\.url$/.test(premier)) continue;
        fautives.push(fichier + " : " + m[0].replace(/\s+/g, " "));
      }
    }

    expect(fautives).toEqual([]);
  });
});

describe("l'adresse de retour", () => {
  const requete = (url: string) => new Request(url);

  it("prend l'adresse déclarée de l'application", () => {
    const avant = process.env.APP_URL;
    process.env.APP_URL = "https://app.formalist.fr";
    try {
      expect(adresseDeRetour(requete("http://0.0.0.0:3000/api/auth/verifier"), "/connexion")).toBe(
        "https://app.formalist.fr/connexion"
      );
    } finally {
      if (avant === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = avant;
    }
  });

  it("retombe sur celle de la requête quand rien n'est déclaré", () => {
    /* En développement le port varie, et c'est ce qui évite de renvoyer en production. */
    const avant = process.env.APP_URL;
    delete process.env.APP_URL;
    try {
      expect(adresseDeRetour(requete("http://localhost:3210/api/auth/verifier"), "/connexion")).toBe(
        "http://localhost:3210/connexion"
      );
    } finally {
      if (avant !== undefined) process.env.APP_URL = avant;
    }
  });
});
