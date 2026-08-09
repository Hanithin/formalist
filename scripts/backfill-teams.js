/**
 * scripts/backfill-teams.js
 *
 * Crée une équipe pour chaque compte qui n'en a pas encore, et rattache ses
 * dossiers existants à cette équipe. À lancer une fois après la mise en place
 * du module Équipe.
 *
 *   node scripts/backfill-teams.js            # aperçu
 *   node scripts/backfill-teams.js --confirm  # applique
 */

const { db, stmts } = require("../db");

const confirm = process.argv.includes("--confirm");

const users = db.prepare("SELECT id, name, email, role, roles FROM users ORDER BY id").all();
const plan = [];

for (const u of users) {
  const team = stmts.getTeamOfUser.get(u.id);
  const dossiers = db.prepare("SELECT COUNT(*) c FROM formalites WHERE user_id = ? AND team_id IS NULL").get(u.id).c;
  if (team && dossiers === 0) continue;

  let roles = [];
  try { roles = JSON.parse(u.roles || "[]"); } catch (e) {}
  if (!roles.length && u.role) roles = [u.role];
  const estAvocat = roles.indexOf("avocat") !== -1;

  plan.push({
    user: u,
    teamId: team ? team.id : null,
    type: estAvocat ? "cabinet" : "client",
    nom: estAvocat
      ? "Cabinet " + String(u.name || "").replace(/^(Me\.?|Maître)\s*/i, "").trim()
      : "Équipe de " + (u.name || u.email),
    dossiers,
  });
}

if (!plan.length) {
  console.log("Rien à faire : toutes les équipes existent et tous les dossiers sont rattachés.");
  process.exit(0);
}

console.log("À traiter :");
for (const p of plan) {
  console.log("  " + (p.user.name || p.user.email)
    + (p.teamId ? " (équipe existante)" : " → créer « " + p.nom + " » (" + p.type + ")")
    + (p.dossiers ? " · " + p.dossiers + " dossier(s) à rattacher" : ""));
}

if (!confirm) {
  console.log("\nAperçu seulement. Relancez avec --confirm pour appliquer.");
  process.exit(0);
}

const rattache = db.prepare("UPDATE formalites SET team_id = ? WHERE user_id = ? AND team_id IS NULL");
let equipes = 0, dossiers = 0;

const run = db.transaction(() => {
  for (const p of plan) {
    let teamId = p.teamId;
    if (!teamId) {
      const info = stmts.createTeam.run(p.nom || "Mon équipe", p.type, p.user.id);
      teamId = info.lastInsertRowid;
      stmts.addTeamMember.run(teamId, p.user.id, "admin", 1, 1, 1);
      equipes++;
    }
    if (p.dossiers) dossiers += rattache.run(teamId, p.user.id).changes;
  }
});
run();

console.log("\n" + equipes + " équipe(s) créée(s), " + dossiers + " dossier(s) rattaché(s).");
console.log("Dossiers encore sans équipe : "
  + db.prepare("SELECT COUNT(*) c FROM formalites WHERE team_id IS NULL").get().c);
