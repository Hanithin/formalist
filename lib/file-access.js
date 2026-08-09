/**
 * lib/file-access.js - Qui a le droit de lire un fichier déposé.
 *
 * Un fichier de uploads/ est atteignable si l'une de ces conditions est vraie :
 *  - la personne l'a déposé elle-même ;
 *  - le fichier est rattaché à un dossier qu'elle peut lire (propriétaire, avocat
 *    assigné, ou équipe autorisée - les règles sont dans lib/team-access.js) ;
 *  - le fichier est référencé par une de ses fiches (document de coffre, contrat,
 *    message de support) ;
 *  - elle est administrateur de la plateforme.
 *
 * Tout le reste, y compris un fichier que rien ne référence, est refusé. Un fichier
 * orphelin n'appartient à personne : rien ne justifie de l'envoyer.
 */

const path = require("path");
const { db, stmts } = require("../db");
const { hasRole } = require("../auth");
const teamAccess = require("./team-access");

/**
 * @returns {{ok: true} | {ok: false, status: 401|403|404}}
 */
function peutLireFichier(user, filename) {
  const nom = path.basename(filename || "");
  if (!nom) return { ok: false, status: 404 };
  if (!user) return { ok: false, status: 401 };

  if (hasRole(user, "admin")) return { ok: true };

  // 1. Registre de propriété, écrit au moment du dépôt
  const registre = stmts.getUploadedFile.get(nom);
  if (registre) {
    if (registre.user_id === user.id) return { ok: true };
    if (registre.formalite_id) {
      const dossier = db.prepare("SELECT * FROM formalites WHERE id = ?").get(registre.formalite_id);
      if (teamAccess.canRead(user, dossier)) return { ok: true };
    }
  }

  // 2. Documents rattachés à un dossier
  const doc = db.prepare("SELECT formalite_id FROM documents WHERE file_path LIKE ?").get("%" + nom);
  if (doc) {
    const dossier = db.prepare("SELECT * FROM formalites WHERE id = ?").get(doc.formalite_id);
    if (teamAccess.canRead(user, dossier)) return { ok: true };
  }

  // 3. Pièces jointes de la messagerie : rattachées à un dossier
  const message = db.prepare("SELECT formalite_id FROM messages WHERE file_path LIKE ?").get("%" + nom);
  if (message) {
    const dossier = db.prepare("SELECT * FROM formalites WHERE id = ?").get(message.formalite_id);
    if (teamAccess.canRead(user, dossier)) return { ok: true };
  }

  // 4. Coffre personnel
  const perso = db.prepare("SELECT user_id FROM user_documents WHERE file_path LIKE ?").get("%" + nom);
  if (perso && perso.user_id === user.id) return { ok: true };

  // 5. Contrats : le client et l'avocat qui en a la charge
  const contrat = db.prepare("SELECT user_id, assigned_avocat_id FROM contrats WHERE file_path LIKE ?").get("%" + nom);
  if (contrat && (contrat.user_id === user.id || contrat.assigned_avocat_id === user.id)) {
    return { ok: true };
  }

  // 6. Pièces jointes du support : le client concerné et l'expéditeur
  const support = db.prepare("SELECT user_id, sender_id FROM support_messages WHERE file_path LIKE ?").get("%" + nom);
  if (support && (support.user_id === user.id || support.sender_id === user.id)) {
    return { ok: true };
  }

  // Rien ne rattache ce fichier à cette personne. On ne distingue pas « le fichier
  // n'existe pas » de « il ne vous appartient pas » : la réponse ne doit pas
  // permettre de deviner quels fichiers sont stockés.
  return { ok: false, status: 404 };
}

module.exports = { peutLireFichier };
