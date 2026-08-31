import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Le `.env` du projet, versé dans l'environnement du processus.
 *
 * Vitest ne le fait pas : Vite ne charge que les variables préfixées pour le
 * navigateur, et les vérifications d'ici lisent `process.env` comme le fait
 * l'application. Sans cela, on met ses identifiants dans le `.env`, la commande
 * répond « non configuré », et on cherche l'erreur du mauvais côté.
 *
 * Ce qui est déjà posé dans l'environnement gagne : une variable passée en ligne de
 * commande doit pouvoir viser un autre compte que celui du fichier.
 */
const RACINE = path.join(import.meta.dirname, "..", "..");

for (const fichier of [".env.local", ".env"]) {
  let contenu: string;
  try {
    contenu = readFileSync(path.join(RACINE, fichier), "utf8");
  } catch {
    continue;
  }

  for (const ligne of contenu.split("\n")) {
    const trouve = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(ligne);
    if (!trouve) continue;
    const [, cle, brut] = trouve;
    if (process.env[cle] !== undefined) continue;
    process.env[cle] = brut.trim().replace(/^["']|["']$/g, "");
  }
}
