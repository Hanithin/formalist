import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Le blueprint doit déclarer ce que le code lit.
 *
 * `MAIL_FROM` manquait à render.yaml. Le code la lit et retombe, à défaut, sur
 * l'expéditeur du bac à sable de Resend - qui ne livre qu'au titulaire du compte et
 * rejette tous les autres destinataires. Résultat : les inscriptions aboutissaient,
 * l'écran annonçait qu'un lien de confirmation était parti, et personne ne recevait
 * rien. Le défaut a tenu jusqu'à ce qu'on ne puisse plus créer de compte.
 *
 * Rien ne le signalait : une variable absente vaut `undefined`, et une valeur de
 * repli est faite pour que le programme continue. Ce test relie les deux fichiers.
 */

const RACINE = path.join(process.cwd(), "..");

function blueprint(): string {
  return readFileSync(path.join(RACINE, "render.yaml"), "utf8");
}

/** Les variables lues par le code de l'application, hors code généré et tests. */
function variablesLues(): Map<string, string> {
  const trouvees = new Map<string, string>();

  const parcourir = (dossier: string) => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = path.join(dossier, entree.name);
      if (entree.isDirectory()) {
        if (entree.name === "generated" || entree.name === "node_modules") continue;
        parcourir(chemin);
        continue;
      }
      if (!/\.(ts|tsx|cjs|js)$/.test(entree.name)) continue;

      const source = readFileSync(chemin, "utf8");
      for (const trouve of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) {
        if (!trouvees.has(trouve[1])) {
          trouvees.set(trouve[1], path.relative(RACINE, chemin));
        }
      }
    }
  };

  parcourir(path.join(process.cwd(), "src"));
  return trouvees;
}

/**
 * Ce qui n'a pas à figurer au blueprint, et pourquoi.
 *
 * Deux familles seulement. Ce que la plateforme pose d'elle-même, et les réglages
 * facultatifs dont la valeur de repli fonctionne en production - un réglage qu'on
 * peut ne jamais toucher n'est pas un oubli. Tout le reste doit être déclaré :
 * c'est précisément parce que MAIL_FROM avait l'air facultative, avec sa valeur de
 * repli, que les inscriptions ont cessé de fonctionner sans que rien ne le dise.
 */
const HORS_BLUEPRINT = new Map<string, string>([
  ["NODE_ENV", "posée par Next et par le blueprint lui-même"],
  ["PORT", "posée par l'hébergeur"],
  ["CI", "posée par l'intégration continue"],
  ["VERCEL_URL", "posée par la plateforme, inutilisée sur Render"],
  ["NEXT_RUNTIME", "posée par Next"],
  ["NEXT_PUBLIC_SITE_URL", "le site vitrine, déployé séparément"],
  ["BASE_URL", "les tests de parcours seulement"],
  ["DATABASE_URL_TEST", "les tests seulement"],
  ["npm_package_version", "posée par npm"],
  [
    "LOG_LEVEL",
    "réglage facultatif : à défaut, info en production et debug ailleurs",
  ],
  [
    "FORMALIST_TEMPLATES",
    "surcharge facultative : le Dockerfile copie templates/ à la racine de l'image, et docx.cjs l'y trouve",
  ],
]);

describe("les variables d'environnement", () => {
  it("sont toutes déclarées dans le blueprint de déploiement", () => {
    const rendu = blueprint();
    const manquantes: string[] = [];

    for (const [variable, fichier] of variablesLues()) {
      if (HORS_BLUEPRINT.has(variable)) continue;
      if (rendu.includes("key: " + variable)) continue;
      manquantes.push(variable + " (lu dans " + fichier + ")");
    }

    expect(manquantes).toEqual([]);
  });

  it("déclarent l'expéditeur des emails, et pas seulement la clé", () => {
    /*
     * Les deux vont ensemble : la clé sans l'expéditeur laisse partir les messages
     * depuis le bac à sable, qui les refuse pour tout destinataire autre que le
     * titulaire du compte. C'est le cas qui a cassé les inscriptions.
     */
    const rendu = blueprint();
    expect(rendu).toContain("key: RESEND_API_KEY");
    expect(rendu).toContain("key: MAIL_FROM");
  });
});
