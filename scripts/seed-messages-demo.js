/**
 * scripts/seed-messages-demo.js
 *
 * Crée un échange réaliste dans la messagerie : un fil avec l'avocat du dossier
 * et un fil avec le support. Sert à voir la page dans un état représentatif.
 *
 *   node scripts/seed-messages-demo.js <id du dossier>            # ajoute
 *   node scripts/seed-messages-demo.js <id du dossier> --clean    # retire
 */

const { db } = require("../db");

const formaliteId = parseInt(process.argv[2], 10);
const clean = process.argv.includes("--clean");
// Le fil support appartient par défaut au client du dossier ; --support=<email>
// permet de le créer sur un autre compte (utile pour tester depuis son propre compte).
const supportArg = (process.argv.find(a => a.startsWith("--support=")) || "").split("=")[1];

if (!formaliteId) {
  console.error("Usage : node scripts/seed-messages-demo.js <id du dossier> [--clean]");
  process.exit(1);
}

const f = db.prepare("SELECT * FROM formalites WHERE id = ?").get(formaliteId);
if (!f) {
  console.error("Dossier " + formaliteId + " introuvable.");
  process.exit(1);
}

if (clean) {
  const m = db.prepare("DELETE FROM messages WHERE formalite_id = ?").run(formaliteId);
  const supportTargetId = resolveSupportUser();
  const s = db.prepare("DELETE FROM support_messages WHERE user_id IN (?, ?)").run(f.user_id, supportTargetId);
  console.log("Supprimé : " + m.changes + " messages, " + s.changes + " messages de support.");
  process.exit(0);
}

if (!f.assigned_avocat_id) {
  console.error("Aucun avocat assigné à ce dossier : lancez d'abord scripts/create-avocat.js");
  process.exit(1);
}

const force = process.argv.includes("--force");
const existing = db.prepare("SELECT COUNT(*) c FROM messages WHERE formalite_id = ?").get(formaliteId).c;
if (existing > 0 && !force) {
  console.log("Ce dossier a déjà " + existing + " message(s).");
  console.log("--force pour ajouter le fil de démonstration par-dessus, --clean pour repartir de zéro.");
  process.exit(0);
}

function resolveSupportUser() {
  if (!supportArg) return f.user_id;
  const u = db.prepare("SELECT id FROM users WHERE email = ?").get(supportArg.trim().toLowerCase());
  if (!u) {
    console.error("Compte introuvable pour --support=" + supportArg);
    process.exit(1);
  }
  return u.id;
}

const client = f.user_id;
const avocat = f.assigned_avocat_id;
const societe = f.societe || "votre société";

// Échange sur le dépôt de capital, l'étape où le dossier est réellement bloqué
const THREAD = [
  [avocat, "Bonjour, je prends en charge le dossier " + societe + ". J'ai relu vos statuts, tout est conforme.", "-3 days"],
  [avocat, "Il ne manque que l'attestation de dépôt de capital pour lancer l'immatriculation. Vous pouvez la demander directement depuis votre espace Qonto.", "-3 days"],
  [client, "Bonjour, merci. Le virement est parti hier, je devrais recevoir l'attestation d'ici 48 h.", "-2 days"],
  [avocat, "Parfait. Dès que vous l'avez, déposez-la dans le dossier : je transmets au greffe dans la foulée.", "-2 days"],
  [client, "Une question : faut-il un justificatif de domicile au nom de la société ou au mien ?", "-1 days"],
  [avocat, "Au nom de la société pour le siège. Si vous domiciliez chez vous, une attestation de domiciliation signée suffit, avec votre justificatif personnel de moins de 3 mois.", "-20 hours"],
];

const insertMsg = db.prepare(
  "INSERT INTO messages (formalite_id, sender_id, content, created_at, read) VALUES (?, ?, ?, datetime('now', ?), 1)"
);
THREAD.forEach(m => insertMsg.run(formaliteId, m[0], m[2] ? m[1] : m[1], m[2]));

// Fil support : le dernier message n'est pas lu, pour voir la pastille
const supportUser = resolveSupportUser();
// Le répondant doit être quelqu'un d'autre que l'auteur de la question,
// sinon la conversation n'a qu'une seule voix.
const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' AND id != ? LIMIT 1").get(supportUser)
  || db.prepare("SELECT id FROM users WHERE role = 'avocat' AND id != ? LIMIT 1").get(supportUser);
const SUPPORT = [
  [supportUser, "Bonjour, ma facture indique une TVA à 20 % alors que je pensais être exonéré. Pouvez-vous vérifier ?", "-5 hours", 1],
];
if (admin) {
  SUPPORT.push([admin.id, "Bonjour, la TVA s'applique bien à nos honoraires. Je vous envoie le détail par email d'ici ce soir.", "-2 hours", 0]);
}
const insertSupport = db.prepare(
  "INSERT INTO support_messages (user_id, sender_id, content, read, created_at) VALUES (?, ?, ?, ?, datetime('now', ?))"
);
SUPPORT.forEach(m => insertSupport.run(supportUser, m[0], m[1], m[3], m[2]));

console.log(THREAD.length + " messages ajoutés au dossier " + formaliteId + " (" + societe + ")");
console.log(SUPPORT.length + " message(s) de support" + (admin ? "" : " (aucun compte admin : réponse non créée)"));
console.log("\nPour revenir en arrière : node scripts/seed-messages-demo.js " + formaliteId + " --clean");
