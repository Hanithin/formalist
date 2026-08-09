/**
 * scripts/seed-consultations-demo.js
 *
 * Ouvre des créneaux pour l'avocat et crée quelques consultations, afin de voir
 * la page dans un état représentatif (prochain rendez-vous, en attente, passée).
 *
 *   node scripts/seed-consultations-demo.js <email du client>            # ajoute
 *   node scripts/seed-consultations-demo.js <email du client> --clean    # retire
 */

const { db, stmts } = require("../db");

const email = (process.argv[2] || "").trim().toLowerCase();
const clean = process.argv.includes("--clean");

if (!email) {
  console.error("Usage : node scripts/seed-consultations-demo.js <email> [--clean]");
  process.exit(1);
}

const client = stmts.getUserByEmail.get(email);
if (!client) {
  console.error("Aucun compte pour " + email);
  process.exit(1);
}

// Un avocat autre que le client : se prendre rendez-vous à soi-même n'a pas de sens
const avocat = db.prepare(
  "SELECT id, name FROM users WHERE (role = 'avocat' OR roles LIKE '%avocat%') AND id != ? ORDER BY id LIMIT 1"
).get(client.id);
if (!avocat) {
  console.error("Aucun compte avocat : lancez d'abord scripts/create-avocat.js");
  process.exit(1);
}

if (clean) {
  const c = db.prepare("DELETE FROM lawyer_consultations WHERE user_id = ?").run(client.id);
  const a = db.prepare("DELETE FROM avocat_availability WHERE avocat_id = ?").run(avocat.id);
  console.log("Supprimé : " + c.changes + " consultation(s), " + a.changes + " plage(s) horaire(s).");
  process.exit(0);
}

// Créneaux du lundi au vendredi, matin et après-midi
const dejaDispo = db.prepare("SELECT COUNT(*) c FROM avocat_availability WHERE avocat_id = ?").get(avocat.id).c;
if (!dejaDispo) {
  const ins = db.prepare(
    "INSERT INTO avocat_availability (avocat_id, day_of_week, start_time, end_time, slot_duration_minutes) VALUES (?, ?, ?, ?, 30)"
  );
  for (let jour = 1; jour <= 5; jour++) {
    ins.run(avocat.id, jour, "09:00", "12:30");
    ins.run(avocat.id, jour, "14:00", "18:00");
  }
  console.log("Créneaux ouverts pour " + avocat.name + " : lundi à vendredi, 9h-12h30 et 14h-18h.");
} else {
  console.log("L'avocat a déjà " + dejaDispo + " plage(s) horaire(s).");
}

const dejaCons = db.prepare("SELECT COUNT(*) c FROM lawyer_consultations WHERE user_id = ?").get(client.id).c;
if (dejaCons) {
  console.log("Le compte a déjà " + dejaCons + " consultation(s). --clean pour repartir de zéro.");
  process.exit(0);
}

/** Date à J+n, à une heure donnée, en heure locale.
    toISOString() convertirait en UTC et décalerait les rendez-vous. */
function dateA(joursDecalage, heure) {
  const d = new Date();
  d.setDate(d.getDate() + joursDecalage);
  const [h, m] = heure.split(":");
  d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
  const p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate())
    + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":00";
}

const insertCons = db.prepare(`INSERT INTO lawyer_consultations
  (user_id, avocat_id, scheduled_at, duration_minutes, status, price_cents, topic, notes, domain, description, payment_status, meeting_link, accepted_at)
  VALUES (?, ?, ?, 30, ?, 9900, ?, NULL, ?, ?, 'paid', ?, ?)`);

const DEMO = [
  {
    quand: dateA(2, "10:00"), statut: "scheduled",
    sujet: "Répartition du capital entre associés",
    domaine: "droit_societes",
    description: "Nous sommes trois associés et souhaitons revoir la répartition avant l'immatriculation.",
    lien: "https://meet.google.com/demo-formalist",
    accepte: dateA(-1, "09:12"),
  },
  {
    quand: dateA(6, "15:30"), statut: "scheduled",
    sujet: "Choix du régime de TVA",
    domaine: "fiscalite",
    description: "Franchise en base ou régime réel : quelle option pour une activité de conseil ?",
    lien: null, accepte: null,
  },
  {
    quand: dateA(-9, "11:00"), statut: "done",
    sujet: "Relecture d'un contrat de prestation",
    domaine: "contrats",
    description: "Clauses de résiliation et pénalités de retard à vérifier.",
    lien: "https://meet.google.com/demo-formalist",
    accepte: dateA(-12, "16:40"),
  },
];

DEMO.forEach(c => {
  insertCons.run(client.id, avocat.id, c.quand, c.statut, c.sujet, c.domaine, c.description, c.lien, c.accepte);
});

console.log(DEMO.length + " consultations créées pour " + email + " :");
DEMO.forEach(c => console.log("  " + c.quand + " · " + c.sujet + " [" + c.statut + (c.lien ? ", visio" : ", en attente") + "]"));
console.log("\nPour revenir en arrière : node scripts/seed-consultations-demo.js " + email + " --clean");
