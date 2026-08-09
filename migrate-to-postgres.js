/**
 * migrate-to-postgres.js - Reprise des données de SQLite vers Postgres.
 *
 *   DATABASE_URL=postgres://... node migrate-to-postgres.js [--verifier]
 *
 * Le schéma doit avoir été appliqué au préalable :
 *   psql "$DATABASE_URL" -f migrations/001_schema_initial.sql
 *
 * Trois conversions sont nécessaires, la copie brute ne suffit pas :
 *   - les dates passent de texte ISO à TIMESTAMPTZ ;
 *   - les drapeaux 0/1 passent en booléens ;
 *   - les identifiants sont insérés explicitement, puis la séquence IDENTITY est
 *     recalée, sans quoi la première insertion applicative entrerait en collision.
 *
 * Le script est rejouable : il vide les tables cibles avant de copier.
 */

const { Client } = require("pg");
const { db } = require("./db");

const VERIFIER_SEULEMENT = process.argv.includes("--verifier");

// Ordre de dépendance : une table n'est copiée qu'après celles qu'elle référence.
const ORDRE = [
  "users", "teams", "formalites", "api_usage", "audit_log",
  "avocat_availability", "avocat_blocked_dates", "contact_messages", "contrats",
  "documents", "email_tokens", "lawyer_consultations", "messages", "notifications",
  "payments", "sessions", "signature_requests", "support_conversations",
  "support_messages", "team_invitations", "team_members", "team_notes",
  "uploaded_files", "user_documents", "user_sessions",
];

const COLONNES_DATE = /^(created_at|updated_at|expires_at|used_at|rejected_at|last_seen|last_seen_at|last_login_at|started_at|ended_at|accepted_at|revoked_at|signed_at|sent_at|paid_at|deleted_at|verified_at|scheduled_at)$/;
const COLONNES_BOOLEENNES = /^(read|suspended|email_verified|can_view_all|can_edit|can_create|is_active|archived)$/;

/** Texte ISO de SQLite vers un objet Date, ou null. */
function versDate(valeur) {
  if (valeur == null || valeur === "") return null;
  // SQLite écrit « 2026-08-09 22:15:00 » : sans fuseau, c'est de l'UTC ici.
  const normalise = /^\d{4}-\d{2}-\d{2} /.test(valeur) ? valeur.replace(" ", "T") + "Z" : valeur;
  const d = new Date(normalise);
  return isNaN(d.getTime()) ? null : d;
}

function convertir(colonne, valeur) {
  if (COLONNES_DATE.test(colonne)) return versDate(valeur);
  if (COLONNES_BOOLEENNES.test(colonne)) return valeur == null ? null : !!valeur;
  return valeur;
}

/**
 * Recense les lignes qui pointent vers un parent inexistant.
 *
 * SQLite n'applique pas toujours ses clés étrangères ; Postgres, si. Sans ce
 * contrôle, la reprise échoue au milieu du parcours et l'origine du refus est
 * difficile à relier à la donnée fautive.
 */
function referencesBrisees() {
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all().map(t => t.name);

  const trouvees = [];
  for (const table of tables) {
    for (const fk of db.prepare("PRAGMA foreign_key_list(" + table + ")").all()) {
      const cible = fk.to || "id";
      const lignes = db.prepare(
        "SELECT a.rowid AS rid FROM " + table + " a" +
        " LEFT JOIN " + fk.table + " b ON b." + cible + " = a." + fk.from +
        " WHERE a." + fk.from + " IS NOT NULL AND b." + cible + " IS NULL"
      ).all();
      if (lignes.length) {
        trouvees.push({ table, colonne: fk.from, vers: fk.table, rowids: lignes.map(l => l.rid) });
      }
    }
  }
  return trouvees;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL manquante. Exemple :");
    console.error('  DATABASE_URL="postgres://user:mdp@hote/base" node migrate-to-postgres.js');
    process.exit(1);
  }

  const pg = new Client({ connectionString: url });
  await pg.connect();

  const presentes = new Set(
    (await pg.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    )).rows.map(r => r.table_name)
  );

  const manquantes = ORDRE.filter(t => !presentes.has(t));
  if (manquantes.length) {
    console.error("Tables absentes de Postgres :", manquantes.join(", "));
    console.error("Appliquez d'abord migrations/001_schema_initial.sql");
    await pg.end();
    process.exit(1);
  }

  if (VERIFIER_SEULEMENT) {
    console.log("Comparaison des volumes\n");
    let ecarts = 0;
    for (const table of ORDRE) {
      const source = db.prepare("SELECT COUNT(*) c FROM " + table).get().c;
      const cible = parseInt((await pg.query("SELECT COUNT(*) c FROM " + table)).rows[0].c, 10);
      const marque = source === cible ? "ok" : "ECART";
      if (source !== cible) ecarts++;
      console.log("  " + table.padEnd(24) + String(source).padStart(6) + " -> " + String(cible).padStart(6) + "  " + marque);
    }
    console.log(ecarts ? "\n" + ecarts + " table(s) en écart" : "\nToutes les tables concordent");
    await pg.end();
    return;
  }

  const brisees = referencesBrisees();
  if (brisees.length) {
    const total = brisees.reduce((n, b) => n + b.rowids.length, 0);
    console.log("Références brisées dans SQLite : " + total + " ligne(s)");
    for (const b of brisees) {
      console.log("  " + b.table + "." + b.colonne + " -> " + b.vers + " : " + b.rowids.length);
    }
    if (!process.argv.includes("--purger-orphelins")) {
      console.log("\nCes lignes pointent vers un parent qui n'existe plus : l'application ne");
      console.log("peut déjà plus s'en servir. Postgres les refusera.");
      console.log("Relancez avec --purger-orphelins pour les supprimer avant la reprise.");
      await pg.end();
      process.exit(1);
    }
    for (const b of brisees) {
      db.prepare("DELETE FROM " + b.table + " WHERE rowid IN (" + b.rowids.join(",") + ")").run();
    }
    console.log("  " + total + " ligne(s) supprimée(s)\n");
  }

  await pg.query("BEGIN");
  try {
    // Vidage en ordre inverse, pour ne pas heurter les clés étrangères
    for (const table of [...ORDRE].reverse()) {
      await pg.query("DELETE FROM " + table);
    }

    let totalLignes = 0;
    for (const table of ORDRE) {
      const lignes = db.prepare("SELECT * FROM " + table).all();
      if (!lignes.length) {
        console.log("  " + table.padEnd(24) + "vide");
        continue;
      }

      const colonnes = Object.keys(lignes[0]);
      const listeColonnes = colonnes.map(c => '"' + c + '"').join(", ");

      // Les identifiants viennent de SQLite : on force l'écriture dans une colonne IDENTITY
      const forcer = colonnes.includes("id");
      if (forcer) await pg.query('ALTER TABLE ' + table + ' ALTER COLUMN id DROP IDENTITY IF EXISTS');

      for (const ligne of lignes) {
        const valeurs = colonnes.map(c => convertir(c, ligne[c]));
        const jetons = colonnes.map((_, i) => "$" + (i + 1)).join(", ");
        await pg.query(
          "INSERT INTO " + table + " (" + listeColonnes + ") VALUES (" + jetons + ")",
          valeurs
        );
      }

      if (forcer) {
        // On rétablit l'IDENTITY et on cale la séquence après le plus grand identifiant
        const max = (await pg.query("SELECT COALESCE(MAX(id), 0) m FROM " + table)).rows[0].m;
        await pg.query(
          "ALTER TABLE " + table + " ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (START WITH " + (Number(max) + 1) + ")"
        );
      }

      totalLignes += lignes.length;
      console.log("  " + table.padEnd(24) + String(lignes.length).padStart(6) + " lignes");
    }

    await pg.query("COMMIT");
    console.log("\n" + totalLignes + " lignes reprises. Vérification : node migrate-to-postgres.js --verifier");
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("\nReprise annulée, rien n'a été écrit :", e.message);
    process.exitCode = 1;
  } finally {
    await pg.end();
  }
}

main();
