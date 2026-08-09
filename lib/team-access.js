/**
 * lib/team-access.js - Qui voit quoi, une fois les équipes en place.
 *
 * Règles retenues :
 *  - un collaborateur ne voit que les dossiers qu'il a créés ;
 *  - l'admin d'équipe voit tout et intervient sur tout ;
 *  - l'admin peut accorder « voit tous les dossiers » à un collaborateur ;
 *  - dans un cabinet, les avocats voient l'ensemble des dossiers du cabinet ;
 *  - l'administrateur de la plateforme garde sa vue globale.
 */

const { db, stmts } = require("../db");
const { hasRole } = require("../auth");

/** Équipe de l'utilisateur (avec ses droits), ou null s'il n'en a pas encore. */
function teamOf(user) {
  return stmts.getTeamOfUser.get(user.id) || null;
}

/** Rattache un dossier à l'équipe de son créateur, à la création. */
function attachToTeam(formaliteId, user) {
  const team = teamOf(user);
  if (!team) return null;
  db.prepare("UPDATE formalites SET team_id = ? WHERE id = ?").run(team.id, formaliteId);
  return team.id;
}

/** Voit-il l'ensemble des dossiers de son équipe ? */
function voitToutLEquipe(team) {
  if (!team) return false;
  if (team.role === "admin") return true;
  if (team.type === "cabinet" && team.role === "avocat") return true;
  return !!team.can_view_all;
}

/**
 * Liste des dossiers visibles. On part de la vue existante (client, avocat
 * assigné, admin plateforme) et on y ajoute ceux de l'équipe quand le droit
 * le permet - sans jamais en retirer.
 */
function listFormalites(user) {
  if (hasRole(user, "admin")) return stmts.getAllFormalites.all();

  const base = hasRole(user, "avocat")
    ? stmts.getFormalitesByAvocatWithClient.all(user.id, user.id)
    : stmts.getFormalitesByUser.all(user.id);

  const team = teamOf(user);
  if (!team || !voitToutLEquipe(team)) return base;

  const equipe = db.prepare(`SELECT f.*, u.name as user_name, u.email as user_email, a.name as avocat_name,
      (SELECT COUNT(*) FROM signature_requests sr WHERE sr.formalite_id = f.id) AS total_signatures,
      (SELECT COUNT(*) FROM signature_requests sr WHERE sr.formalite_id = f.id AND sr.signed_at IS NULL) AS pending_signatures,
      (SELECT COUNT(*) FROM documents d WHERE d.formalite_id = f.id AND d.rejection_reason IS NOT NULL) AS rejected_docs
    FROM formalites f
    LEFT JOIN users u ON f.user_id = u.id
    LEFT JOIN users a ON f.assigned_avocat_id = a.id
    WHERE f.team_id = ?
    ORDER BY f.updated_at DESC`).all(team.id);

  const vus = new Set(base.map(f => f.id));
  return base.concat(equipe.filter(f => !vus.has(f.id)));
}

/** Peut-il ouvrir ce dossier ? */
function canRead(user, formalite) {
  if (!formalite) return false;
  if (hasRole(user, "admin")) return true;
  if (formalite.user_id === user.id) return true;
  if (formalite.assigned_avocat_id === user.id) return true;

  const team = teamOf(user);
  if (!team || formalite.team_id !== team.id) return false;
  return voitToutLEquipe(team);
}

/** Peut-il le modifier ? Lire ne suffit pas : il faut le droit d'écriture. */
function canWrite(user, formalite) {
  if (!formalite) return false;
  if (hasRole(user, "admin")) return true;
  if (formalite.user_id === user.id) return true;
  if (formalite.assigned_avocat_id === user.id) return true;

  const team = teamOf(user);
  if (!team || formalite.team_id !== team.id) return false;
  if (team.role === "admin") return true;
  if (team.type === "cabinet" && team.role === "avocat") return true;
  return !!(team.can_view_all && team.can_edit);
}

/** Peut-il créer un dossier ? */
function canCreate(user) {
  const team = teamOf(user);
  if (!team) return true; // pas encore d'équipe : rien à restreindre
  if (team.role === "admin") return true;
  return !!team.can_create;
}

/**
 * Qui a fait quoi sur un dossier : premier auteur et dernière intervention
 * d'un avocat ou d'un administrateur, avec l'horodatage.
 */
function intervenants(formaliteId) {
  const creation = db.prepare(`SELECT a.created_at, u.name, a.actor_role
    FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
    WHERE a.formalite_id = ? ORDER BY a.created_at ASC LIMIT 1`).get(formaliteId);

  const revision = db.prepare(`SELECT a.created_at, u.name, a.actor_role
    FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
    WHERE a.formalite_id = ? AND a.actor_role IN ('avocat','admin')
    ORDER BY a.created_at DESC LIMIT 1`).get(formaliteId);

  const proprietaire = db.prepare(`SELECT u.name FROM formalites f
    LEFT JOIN users u ON u.id = f.user_id WHERE f.id = ?`).get(formaliteId);

  return {
    created_by: (creation && creation.name) || (proprietaire && proprietaire.name) || null,
    created_at: creation ? creation.created_at : null,
    reviewed_by: revision ? revision.name : null,
    reviewed_at: revision ? revision.created_at : null,
  };
}

module.exports = { teamOf, attachToTeam, listFormalites, canRead, canWrite, canCreate, intervenants, voitToutLEquipe };
