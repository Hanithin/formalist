#!/usr/bin/env node
/*
 * Réinitialise le mot de passe d'un compte, en local ou en production.
 *
 * Le mot de passe et l'adresse de la base sont lus dans des fichiers, jamais passés en
 * argument : un argument de commande est visible de tout processus de la machine, et
 * reste dans l'historique du shell. Aucune saisie interactive non plus - une invite
 * masquée demande le mode brut du terminal, qui se bloque dès qu'on lance le script
 * autrement qu'à la main, et un outil d'exploitation doit pouvoir être répété.
 *
 * Les paramètres de hachage reprennent exactement ceux de src/lib/mots-de-passe.ts -
 * PBKDF2-SHA512, 100 000 itérations, clé de 64 octets, sel par compte. Ils ne peuvent
 * pas différer : une empreinte calculée autrement serait refusée à la connexion, avec
 * le même message que pour un mot de passe faux. Un test le vérifie
 * (tests/unite/script-mot-de-passe.test.ts).
 *
 * Usage :
 *   node scripts/reinitialiser-mot-de-passe.js \
 *     --email moi@exemple.fr \
 *     --mot-de-passe-depuis ~/nouveau-mdp.txt \
 *     --url-depuis ~/adresse-base.txt
 *
 * Sans --url-depuis, DATABASE_URL est utilisée.
 *
 * Le script lève aussi les blocages qui refusent la connexion alors que le mot de
 * passe est bon : adresse non confirmée, compte suspendu, et tentatives comptées par
 * la limitation de débit. C'est ce dernier point qui explique le plus souvent un
 * « email ou mot de passe incorrect » qui persiste après plusieurs essais.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const { Client } = require("pg");

const ITERATIONS = 100_000;
const LONGUEUR_CLE = 64;
const ALGORITHME = "sha512";
const LONGUEUR_MINIMALE = 8;

function argument(nom) {
  const i = process.argv.indexOf("--" + nom);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function lireFichier(chemin) {
  const complet = chemin.replace(/^~/, process.env.HOME ?? "");
  const contenu = fs.readFileSync(complet, "utf8");
  // L'éditeur ajoute souvent un retour à la ligne final : le garder ferait un mot de
  // passe différent de celui qu'on croit avoir choisi.
  return contenu.replace(/[\r\n]+$/, "");
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
  const cheminMotDePasse = argument("mot-de-passe-depuis");
  const cheminUrl = argument("url-depuis");

  if (!email || !cheminMotDePasse) {
    console.error(
      "Usage : node scripts/reinitialiser-mot-de-passe.js --email adresse --mot-de-passe-depuis fichier [--url-depuis fichier]",
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

  /*
   * TLS demandé explicitement quand l'adresse ne le précise pas.
   *
   * psql négocie le chiffrement de lui-même ; le pilote de node ne le fait pas, et
   * un hébergeur qui l'exige refuse alors la connexion avec « SSL/TLS required ».
   * Sur une base jointe par l'internet, ce n'est pas une option : les identifiants
   * et le contenu des requêtes passeraient en clair.
   *
   * verify-full plutôt que require : le certificat du serveur est réellement
   * vérifié, sans quoi le chiffrement protège d'une écoute mais pas d'un serveur
   * qui se ferait passer pour la base. Le pilote traite aujourd'hui require comme
   * verify-full mais annonce l'inverse pour sa prochaine version majeure - autant
   * écrire ce qu'on veut vraiment.
   *
   * Sauf en local : une base sur la machine même n'expose rien sur le réseau, et
   * PostgreSQL n'y est généralement pas configuré pour TLS. L'exiger quand même
   * ferait échouer le script avec « The server does not support SSL connections ».
   */
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
  if (/[\r\n]/.test(motDePasse)) {
    // Deux lignes dans le fichier : on ne devine pas laquelle est le mot de passe.
    console.error("Le fichier du mot de passe contient plusieurs lignes.");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const { rows } = await client.query(
      "SELECT id, email, name, role, roles, suspended, email_verified FROM users WHERE lower(email) = $1",
      [email],
    );
    if (rows.length === 0) {
      console.error("Aucun compte à cette adresse.");
      process.exit(1);
    }

    const compte = rows[0];
    console.log(
      "Compte : " +
        compte.name +
        " | rôles " +
        (compte.roles ?? compte.role) +
        " | adresse confirmée avant : " +
        (compte.email_verified ? "oui" : "non") +
        " | suspendu avant : " +
        (compte.suspended ? "oui" : "non"),
    );

    const empreinte = hacher(motDePasse);
    await client.query(
      "UPDATE users SET password_hash = $1, salt = $2, email_verified = true, suspended = false WHERE id = $3",
      [empreinte.hash, empreinte.salt, compte.id],
    );

    // Les tentatives comptées bloquent la connexion un quart d'heure, même avec le bon
    // mot de passe : les effacer évite de croire que le nouveau ne marche pas non plus.
    const effacees = await client.query(
      "DELETE FROM tentatives WHERE action = $1 AND cle = $2",
      ["connexion", compte.email],
    );

    // Un mot de passe changé doit fermer les accès obtenus avec l'ancien.
    const sessions = await client.query(
      "UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
      [compte.id],
    );

    console.log(
      "Mot de passe changé pour " +
        compte.email +
        " | tentatives effacées : " +
        effacees.rowCount +
        " | sessions révoquées : " +
        sessions.rowCount,
    );
    console.log(
      "Pensez à supprimer " + cheminMotDePasse + " et le fichier de l'adresse.",
    );
  } finally {
    await client.end();
  }
}

principal().catch((e) => {
  console.error("Échec :", e.message);
  process.exit(1);
});
