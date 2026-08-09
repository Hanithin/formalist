/**
 * scripts/create-avocat.js
 *
 * Crée (ou met à jour) un compte avocat et l'assigne à un dossier.
 *
 *   node scripts/create-avocat.js <email> <motdepasse> "<nom>" [id du dossier]
 *
 * Le compte est créé confirmé : il sert à travailler en local, pas à tester
 * le parcours d'inscription.
 */

const { db, stmts, hashPassword } = require("../db");

const email = (process.argv[2] || "").trim().toLowerCase();
const password = process.argv[3] || "";
const name = process.argv[4] || "";
const dossierId = process.argv[5] ? parseInt(process.argv[5], 10) : null;

if (!email || !password || !name) {
  console.error('Usage : node scripts/create-avocat.js <email> <motdepasse> "<nom>" [id du dossier]');
  process.exit(1);
}

const { hash, salt } = hashPassword(password);
let user = stmts.getUserByEmail.get(email);

if (user) {
  stmts.updateUserPassword.run(hash, salt, user.id);
  db.prepare("UPDATE users SET name = ?, role = 'avocat', roles = '[\"avocat\"]', email_verified = 1 WHERE id = ?")
    .run(name, user.id);
  console.log("Compte avocat mis à jour : " + email);
} else {
  const parts = name.replace(/^(Me\.?|Maître)\s*/i, "").split(/\s+/);
  const info = stmts.createUserFull.run(
    email, hash, salt, name, parts[0] || name, parts.slice(1).join(" "), "avocat", JSON.stringify(["avocat"])
  );
  stmts.setEmailVerified.run(info.lastInsertRowid);
  console.log("Compte avocat créé : " + email);
}

user = stmts.getUserByEmail.get(email);

if (dossierId) {
  const f = db.prepare("SELECT id, societe FROM formalites WHERE id = ?").get(dossierId);
  if (!f) {
    console.error("Dossier " + dossierId + " introuvable : aucune assignation.");
    process.exit(1);
  }
  db.prepare("UPDATE formalites SET assigned_avocat_id = ?, updated_at = datetime('now') WHERE id = ?")
    .run(user.id, dossierId);
  console.log("Assigné au dossier " + dossierId + " (" + f.societe + ")");

  // Trace l'intervention pour que le dossier reflète l'arrivée de l'avocat
  const already = db.prepare(
    "SELECT COUNT(*) c FROM audit_log WHERE formalite_id = ? AND actor_id = ?"
  ).get(dossierId, user.id).c;
  if (!already) {
    const add = db.prepare(
      "INSERT INTO audit_log (formalite_id, actor_id, actor_role, action, target_field, before_value, after_value, comment, created_at) VALUES (?, ?, 'avocat', ?, NULL, NULL, ?, ?, datetime('now', ?))"
    );
    add.run(dossierId, user.id, "status_change", "Dossier pris en charge par " + name, null, "-1 days");
    add.run(dossierId, user.id, "doc_validated", "Pièce d'identité", "Conforme", "-20 hours");
    add.run(dossierId, user.id, "note", null,
      "Il ne manque que l'attestation de dépôt de capital pour lancer l'immatriculation.", "-4 hours");
    console.log("3 entrées d'historique ajoutées");
  }
}

console.log("\nIdentifiants : " + email + " / " + password);
