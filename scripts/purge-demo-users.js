/**
 * scripts/purge-demo-users.js
 *
 * Supprime les comptes de démonstration (admin@/avocat@/test@formalist.fr) et
 * toutes les données qui leur sont rattachées. À lancer une seule fois, après la
 * mise en place de l'inscription avec confirmation d'email.
 *
 *   node scripts/purge-demo-users.js            # aperçu, ne supprime rien
 *   node scripts/purge-demo-users.js --confirm  # supprime réellement
 *
 * Une copie de la base est faite avant suppression (data/formalist.db.bak).
 */

const fs = require("fs");
const path = require("path");

const DEMO_EMAILS = ["admin@formalist.fr", "avocat@formalist.fr", "test@formalist.fr"];
const DB_PATH = path.join(__dirname, "..", "data", "formalist.db");
const confirm = process.argv.includes("--confirm");

const { db } = require("../db");

const users = db.prepare(
  `SELECT id, email, name, role FROM users WHERE email IN (${DEMO_EMAILS.map(() => "?").join(",")})`
).all(...DEMO_EMAILS);

if (!users.length) {
  console.log("Aucun compte de démonstration en base.");
  process.exit(0);
}

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(t => t.name);

// Colonnes de propriété : la ligne appartient au compte, elle part avec lui.
const OWNER_COLUMNS = ["user_id", "sender_id", "actor_id", "uid"];
// Colonnes d'affectation : la ligne appartient à quelqu'un d'autre (un client),
// on se contente de retirer l'affectation à l'avocat de démonstration.
const ASSIGN_COLUMNS = ["assigned_avocat_id", "avocat_id"];
// Exception : ici avocat_id désigne bien le propriétaire de la ligne.
const OWNER_OVERRIDES = { avocat_availability: ["avocat_id"] };

function modeFor(table, col) {
  if ((OWNER_OVERRIDES[table] || []).includes(col)) return "delete";
  if (OWNER_COLUMNS.includes(col)) return "delete";
  if (ASSIGN_COLUMNS.includes(col)) return "null";
  return null;
}

const COLUMNS = OWNER_COLUMNS.concat(ASSIGN_COLUMNS);

const ids = users.map(u => u.id);
const placeholders = ids.map(() => "?").join(",");

console.log("Comptes concernés :");
for (const u of users) console.log("  -", u.email, "(" + u.role + ", id " + u.id + ")");

const plan = [];
for (const table of tables) {
  if (table === "users" || table.startsWith("sqlite_")) continue;
  const cols = db.prepare("PRAGMA table_info(" + table + ")").all().map(c => c.name);
  for (const col of COLUMNS) {
    if (!cols.includes(col)) continue;
    const mode = modeFor(table, col);
    if (!mode) continue;
    const n = db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE ${col} IN (${placeholders})`).get(...ids).c;
    if (n) plan.push({ table, col, n, mode });
  }
}

console.log("\nLignes rattachées :");
if (!plan.length) console.log("  (aucune)");
for (const p of plan) {
  console.log("  -", p.table + "." + p.col + " :", p.n, p.mode === "delete" ? "(supprimées)" : "(affectation retirée)");
}

if (!confirm) {
  console.log("\nAperçu seulement. Relancez avec --confirm pour supprimer.");
  process.exit(0);
}

fs.copyFileSync(DB_PATH, DB_PATH + ".bak");
console.log("\nSauvegarde écrite : " + DB_PATH + ".bak");

db.pragma("foreign_keys = OFF");
const run = db.transaction(() => {
  // Les affectations sont retirées avant les suppressions de comptes
  for (const p of plan.filter(p => p.mode === "null")) {
    db.prepare(`UPDATE ${p.table} SET ${p.col} = NULL WHERE ${p.col} IN (${placeholders})`).run(...ids);
  }
  for (const p of plan.filter(p => p.mode === "delete")) {
    db.prepare(`DELETE FROM ${p.table} WHERE ${p.col} IN (${placeholders})`).run(...ids);
  }
  db.prepare(`DELETE FROM users WHERE id IN (${placeholders})`).run(...ids);
});
run();
db.pragma("foreign_keys = ON");

// Les comptes restants (créés avant la confirmation d'email) restent utilisables
db.prepare("UPDATE users SET email_verified = 1 WHERE email_verified IS NULL OR email_verified = 0").run();

console.log("Comptes de démonstration supprimés.");
console.log("Comptes restants :", db.prepare("SELECT COUNT(*) c FROM users").get().c);
