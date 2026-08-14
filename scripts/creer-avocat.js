#!/usr/bin/env node
/*
 * Crée un compte avocat, confirmé, avec ses disponibilités par défaut.
 *
 * Sans ce script, créer un avocat en production passe par le parcours d'inscription,
 * dont l'email de confirmation ne part pas tant que Resend et APP_URL ne sont pas
 * configurés - et le compte reste inutilisable.
 *
 * Le mot de passe et l'adresse de la base sont lus dans des fichiers, jamais passés
 * en argument : un argument de commande est visible de tout processus de la machine
 * et reste dans l'historique du shell. Même choix que
 * scripts/reinitialiser-mot-de-passe.js, pour la même raison.
 *
 * Les plages par défaut sont celles du domaine (PLAGES_PAR_DEFAUT) : lundi à
 * vendredi, 9 h - 12 h et 14 h - 18 h, par tranches de 30 minutes. Sans elles,
 * l'avocat n'apparaît nulle part dans la prise de rendez-vous - il est créé, il se
 * connecte, et rien ne se passe côté client sans que personne comprenne pourquoi.
 * Il les ajuste ensuite depuis « Mes disponibilités ».
 *
 * Usage :
 *   node scripts/creer-avocat.js \
 *     --email maitre.dupont@exemple.fr \
 *     --nom "Maître Dupont" \
 *     --mot-de-passe-depuis ~/mdp-avocat.txt \
 *     [--url-depuis ~/adresse-base.txt] [--sans-creneaux]
 *
 * Relancé sur une adresse existante, il met le compte à jour plutôt que d'échouer :
 * le rôle est ajouté, l'adresse confirmée, le mot de passe remplacé.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const { Client } = require("pg");

const ITERATIONS = 100_000;
const LONGUEUR_CLE = 64;
const ALGORITHME = "sha512";
const LONGUEUR_MINIMALE = 8;

/*
 * Les mêmes valeurs que PLAGES_PAR_DEFAUT dans
 * src/domain/consultation/disponibilites.ts. Un script en JavaScript simple ne peut
 * pas importer le domaine en TypeScript ; un test compare les deux listes
 * (tests/unite/script-avocat.test.ts) pour qu'elles ne divergent pas en silence.
 */
const PLAGES_PAR_DEFAUT = [1, 2, 3, 4, 5].flatMap((jour) => [
  { jour, debut: "09:00", fin: "12:00", duree: 30 },
  { jour, debut: "14:00", fin: "18:00", duree: 30 },
]);

function argument(nom) {
  const i = process.argv.indexOf("--" + nom);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function lireFichier(chemin) {
  const complet = chemin.replace(/^~/, process.env.HOME ?? "");
  return fs.readFileSync(complet, "utf8").replace(/[\r\n]+$/, "");
}

function hacher(motDePasse) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(motDePasse, salt, ITERATIONS, LONGUEUR_CLE, ALGORITHME)
    .toString("hex");
  return { hash, salt };
}

async function principal() {
  const email = (argument("email") ?? "").trim().toLowerCase();
  const nom = (argument("nom") ?? "").trim();
  const cheminMotDePasse = argument("mot-de-passe-depuis");
  const cheminUrl = argument("url-depuis");
  const sansCreneaux = process.argv.includes("--sans-creneaux");

  if (!email || !nom || !cheminMotDePasse) {
    console.error(
      'Usage : node scripts/creer-avocat.js --email adresse --nom "Nom affiché" --mot-de-passe-depuis fichier [--url-depuis fichier] [--sans-creneaux]',
    );
    process.exit(1);
  }

  const brute = cheminUrl
    ? lireFichier(cheminUrl).trim()
    : process.env.DATABASE_URL;
  if (!brute) {
    console.error(
      "Aucune adresse de base : posez DATABASE_URL ou passez --url-depuis.",
    );
    process.exit(1);
  }

  // TLS hors de la machine, jamais en local où PostgreSQL ne le propose pas.
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(brute);
  const url =
    local || /sslmode=/.test(brute)
      ? brute
      : brute + (brute.includes("?") ? "&" : "?") + "sslmode=verify-full";

  const motDePasse = lireFichier(cheminMotDePasse);
  if (motDePasse.length < LONGUEUR_MINIMALE) {
    console.error(
      "Le mot de passe doit faire au moins " +
        LONGUEUR_MINIMALE +
        " caractères.",
    );
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const empreinte = hacher(motDePasse);
    const existant = await client.query(
      "SELECT id, roles FROM users WHERE lower(email) = $1",
      [email],
    );

    let avocatId;
    if (existant.rows.length > 0) {
      avocatId = existant.rows[0].id;
      await client.query(
        "UPDATE users SET password_hash = $1, salt = $2, name = $3, role = 'avocat', roles = $4, email_verified = true, suspended = false WHERE id = $5",
        [
          empreinte.hash,
          empreinte.salt,
          nom,
          JSON.stringify(["avocat"]),
          avocatId,
        ],
      );
      console.log("Compte existant mis à jour : " + email);
    } else {
      const cree = await client.query(
        "INSERT INTO users(email, password_hash, salt, name, role, roles, email_verified) VALUES($1, $2, $3, $4, 'avocat', $5, true) RETURNING id",
        [
          email,
          empreinte.hash,
          empreinte.salt,
          nom,
          JSON.stringify(["avocat"]),
        ],
      );
      avocatId = cree.rows[0].id;
      console.log("Compte avocat créé : " + email);
    }

    if (sansCreneaux) {
      console.log("Aucune disponibilité posée (--sans-creneaux).");
    } else {
      const deja = await client.query(
        "SELECT count(*)::int AS n FROM avocat_availability WHERE avocat_id = $1",
        [avocatId],
      );
      if (deja.rows[0].n > 0) {
        // Les siennes priment : les compléter créerait des chevauchements.
        console.log(
          "Disponibilités déjà publiées (" +
            deja.rows[0].n +
            ") : rien n'est ajouté.",
        );
      } else {
        for (const p of PLAGES_PAR_DEFAUT) {
          await client.query(
            "INSERT INTO avocat_availability(avocat_id, day_of_week, start_time, end_time, slot_duration_minutes) VALUES($1, $2, $3, $4, $5)",
            [avocatId, p.jour, p.debut, p.fin, p.duree],
          );
        }
        console.log(
          PLAGES_PAR_DEFAUT.length +
            " plages posées : du lundi au vendredi, 9 h - 12 h et 14 h - 18 h, par tranches de 30 minutes.",
        );
      }
    }

    console.log("L'avocat apparaît désormais dans la prise de rendez-vous.");
    console.log("Pensez à supprimer " + cheminMotDePasse + ".");
  } finally {
    await client.end();
  }
}

principal().catch((e) => {
  console.error("Échec :", e.message);
  process.exit(1);
});
