/**
 * Applique les migrations SQL qui manquent, au démarrage du conteneur.
 *
 * Rien ne les appliquait : le Dockerfile copiait `migrations/` dans l'image et
 * s'arrêtait là. Il fallait donc, à chaque mise en ligne, se souvenir d'ouvrir un
 * client SQL et de comparer à la main ce qui avait déjà tourné. Deux migrations sont
 * ainsi restées en arrière sans que personne le sache, dont celle qui autorise le
 * statut « a_relire » : la production d'actes échouait en production sur une erreur de
 * contrainte, et rien ne disait pourquoi.
 *
 * Une table garde le nom de ce qui est passé. Elle ne dit pas ce que la base contient -
 * seulement ce que ce script a exécuté - et c'est suffisant : les fichiers sont écrits
 * pour être rejouables (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, DROP
 * CONSTRAINT avant de la recréer, INSERT gardé par NOT EXISTS). Sur une base déjà en
 * service, la première exécution les rejoue donc tous sans rien casser - et rattrape au
 * passage ceux qui manquaient.
 *
 * Un échec arrête le démarrage. Servir l'application sur un schéma incomplet est pire
 * que ne pas la servir : elle répond, et se casse au premier geste qui compte.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const DOSSIER = fileURLToPath(new URL("../../migrations", import.meta.url));

/**
 * Ce qu'il reste à passer, dans l'ordre des noms.
 *
 * Les fichiers sont numérotés : leur ordre alphabétique est leur ordre chronologique,
 * et une migration qui en suppose une autre vient après elle.
 */
export function aAppliquer(fichiers, dejaFaites) {
  const faites = new Set(dejaFaites);
  return fichiers
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => !faites.has(f));
}

/**
 * Le certificat est vérifié.
 *
 * L'adresse interne de Render ne passe pas par TLS - elle ne sort pas du réseau privé.
 * Une adresse externe, elle, porte `sslmode=require` : ces hébergeurs présentent des
 * certificats émis par une autorité publique, que Node connaît déjà.
 */
function connexion(adresse) {
  const chiffre = /sslmode=(require|verify-ca|verify-full)/.test(adresse);
  return new pg.Client({
    connectionString: adresse,
    ssl: chiffre ? { rejectUnauthorized: true } : undefined,
  });
}

async function principal() {
  const adresse = process.env.DATABASE_URL;
  if (!adresse) {
    console.error("DATABASE_URL manque : impossible d'appliquer les migrations.");
    process.exit(1);
  }

  const client = connexion(adresse);
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        nom         TEXT PRIMARY KEY,
        applique_le TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    /*
     * Un verrou le temps du passage.
     *
     * Render peut démarrer la nouvelle version pendant que l'ancienne tourne encore :
     * deux instances appliqueraient la même migration en même temps. Le verrou est
     * consultatif et lié à la session - il se relâche même si le processus meurt.
     */
    await client.query("SELECT pg_advisory_lock(hashtext('formalist_migrations'))");

    const { rows } = await client.query("SELECT nom FROM schema_migrations");
    const restantes = aAppliquer(
      await readdir(DOSSIER),
      rows.map((r) => r.nom)
    );

    if (restantes.length === 0) {
      console.log("Migrations : rien à appliquer.");
      return;
    }

    for (const nom of restantes) {
      const sql = await readFile(path.join(DOSSIER, nom), "utf8");
      /* Tout ou rien : une migration à moitié passée laisse un schéma que personne
         ne sait décrire. */
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (nom) VALUES ($1)", [nom]);
        await client.query("COMMIT");
        console.log("Migration appliquée : " + nom);
      } catch (e) {
        await client.query("ROLLBACK");
        throw new Error("Migration " + nom + " : " + (e instanceof Error ? e.message : e));
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('formalist_migrations'))").catch(() => {});
    await client.end();
  }
}

/* Exécuté directement, non importé par un test. */
if (process.argv[1] && process.argv[1].endsWith("appliquer-les-migrations.mjs")) {
  principal().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
