/**
 * scripts/seed-admin-demo.js
 *
 * Crée des données de démo pour l'espace admin :
 *  - quelques sessions historiques pour chaque user
 *  - paiements liés aux formalités de création
 *  - consultations juridiques (passées + à venir)
 *
 * Idempotent : skip si déjà présent.
 *
 * Usage: node scripts/seed-admin-demo.js
 */

const { db, stmts } = require("../db");

function isoMinusDays(days, hour, minute) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  if (hour != null) d.setUTCHours(hour, minute || 0, 0, 0);
  return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
}

function seedSessionsForUser(userId, email) {
  const existing = db.prepare("SELECT COUNT(*) as c FROM user_sessions WHERE user_id = ?").get(userId).c;
  if (existing > 0) return { user: email, sessions: 0, skipped: "already" };

  const ips = ["82.65.114.12", "84.13.27.118", "176.158.41.93"];
  const uas = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148"
  ];

  // Crée 5 sessions étalées sur les 14 derniers jours
  const insert = db.prepare(`
    INSERT INTO user_sessions (user_id, started_at, last_seen_at, ended_at, duration_seconds, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Sessions personnalisées selon l'utilisateur (varie le temps total réaliste)
  function seededRand(seed) {
    var x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }
  function r(seed, min, max) { return min + Math.floor(seededRand(seed) * (max - min + 1)); }
  var nbSessions = r(userId * 7, 4, 9);
  var sessions = [];
  for (var i = 0; i < nbSessions; i++) {
    sessions.push({
      daysAgo: r(userId * 100 + i, 0, 20),
      hour: r(userId * 50 + i, 8, 19),
      durationMin: r(userId * 30 + i, 5, 90)
    });
  }
  sessions.sort(function(a, b){ return b.daysAgo - a.daysAgo; });

  let count = 0;
  for (const s of sessions) {
    const startedAt = isoMinusDays(s.daysAgo, s.hour);
    const endIso = new Date(new Date(startedAt + "Z").getTime() + s.durationMin * 60 * 1000)
      .toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
    insert.run(
      userId,
      startedAt,
      endIso,
      endIso,
      s.durationMin * 60,
      ips[count % ips.length],
      uas[count % uas.length]
    );
    count++;
  }

  // Met à jour les colonnes agrégées sur users
  const last = db.prepare("SELECT MAX(last_seen_at) as ls FROM user_sessions WHERE user_id = ?").get(userId).ls;
  const total = db.prepare("SELECT COALESCE(SUM(duration_seconds), 0) as t FROM user_sessions WHERE user_id = ?").get(userId).t;
  db.prepare("UPDATE users SET last_login_at = ?, last_seen_at = ?, total_time_seconds = ? WHERE id = ?")
    .run(last, last, total, userId);

  return { user: email, sessions: count };
}

function seedPaymentsForUser(userId, email) {
  const existing = db.prepare("SELECT COUNT(*) as c FROM payments WHERE user_id = ?").get(userId).c;
  if (existing > 0) return { user: email, payments: 0, skipped: "already" };

  const formalites = db.prepare(
    "SELECT id, societe, forme FROM formalites WHERE user_id = ? ORDER BY created_at ASC LIMIT 3"
  ).all(userId);
  if (formalites.length === 0) return { user: email, payments: 0, skipped: "no formalite" };

  const PRICES = { starter: 12900, pro: 24900, premium: 39900 };
  const insert = stmts.createPayment;

  let count = 0;
  formalites.forEach((f, idx) => {
    const offerKey = ["starter", "pro", "premium"][idx % 3];
    const amount = PRICES[offerKey];
    const paidAt = isoMinusDays(10 - idx * 3, 15, 30 + idx * 5);
    insert.run(
      userId,
      f.id,
      amount,
      "EUR",
      "Création " + (f.forme || "société") + " — " + (f.societe || ""),
      "paid",
      "pi_demo_" + Math.random().toString(36).slice(2, 12),
      paidAt
    );
    count++;
  });

  return { user: email, payments: count };
}

function seedConsultationsForUser(userId, email) {
  const existing = db.prepare("SELECT COUNT(*) as c FROM lawyer_consultations WHERE user_id = ?").get(userId).c;
  if (existing > 0) return { user: email, consultations: 0, skipped: "already" };

  const avocat = db.prepare("SELECT id FROM users WHERE role = 'avocat' ORDER BY id ASC LIMIT 1").get();
  if (!avocat) return { user: email, consultations: 0, skipped: "no avocat" };

  const insert = stmts.createConsultation;
  // 1 passée terminée, 1 future programmée
  insert.run(userId, avocat.id, isoMinusDays(5, 14, 0), 30, "done", 4900,
    "Conseil sur structure SASU", "Points abordés : capital social, statuts, dirigeant.");
  insert.run(userId, avocat.id, isoMinusDays(-4, 10, 30), 30, "scheduled", 4900,
    "Suivi formalité ZS CAR", null);

  return { user: email, consultations: 2 };
}

function main() {
  const users = db.prepare("SELECT id, email, role FROM users").all();
  console.log(`Found ${users.length} user(s)`);
  for (const u of users) {
    const sessions = seedSessionsForUser(u.id, u.email);
    const payments = u.role === "user" ? seedPaymentsForUser(u.id, u.email) : { user: u.email, payments: 0, skipped: "not user" };
    const consultations = u.role === "user" ? seedConsultationsForUser(u.id, u.email) : { user: u.email, consultations: 0, skipped: "not user" };
    console.log(`  ${u.email} [${u.role}]`);
    console.log(`     sessions:`, sessions);
    console.log(`     payments:`, payments);
    console.log(`     consult: `, consultations);
  }
}

main();
