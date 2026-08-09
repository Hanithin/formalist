/**
 * routes/team.js - Équipe : membres, rôles, droits et invitations
 *
 * GET    /api/team                     état de l'équipe (membres + invitations)
 * PUT    /api/team                     renommer l'équipe
 * POST   /api/team/invitations         inviter par email
 * POST   /api/team/invitations/:id/resend
 * DELETE /api/team/invitations/:id     annuler une invitation
 * PUT    /api/team/members/:id         changer rôle et droits
 * DELETE /api/team/members/:id         retirer un membre
 * GET    /api/team/accept?token=       accepter une invitation (lien de l'email)
 */

const crypto = require("crypto");
const { authGuard } = require("../middleware/auth-guard");
const { jsonResponse, errorResponse, matchRoute } = require("../lib/router");
const { parseBody } = require("../lib/multipart");
const { stmts, db } = require("../db");
const { hasRole } = require("../auth");
const { sendTeamInvitationEmail } = require("../lib/mail");
const teamAccess = require("../lib/team-access");

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ROLE_LABELS = { admin: "administrateur", collaborateur: "collaborateur", avocat: "avocat" };

/**
 * Équipe de l'utilisateur, créée à la première visite. Le type dépend de son
 * rôle : un avocat ouvre un cabinet, où seuls les avocats peuvent inviter.
 */
function ensureTeam(user) {
  const existing = stmts.getTeamOfUser.get(user.id);
  if (existing) return existing;

  const estAvocat = hasRole(user, "avocat");
  const nom = estAvocat ? "Cabinet " + (user.name || "").replace(/^(Me\.?|Maître)\s*/i, "") : "Équipe de " + (user.name || "");
  const info = stmts.createTeam.run(nom.trim() || "Mon équipe", estAvocat ? "cabinet" : "client", user.id);
  stmts.addTeamMember.run(info.lastInsertRowid, user.id, "admin", 1, 1, 1);
  return stmts.getTeamOfUser.get(user.id);
}

// Qui a le droit d'inviter et de gérer les membres
function peutGerer(team, membre, user) {
  if (!membre) return false;
  if (team.type === "cabinet") {
    // Dans un cabinet, la gestion appartient aux avocats
    return membre.role === "avocat" || (membre.role === "admin" && hasRole(user, "avocat"));
  }
  return membre.role === "admin";
}

function etatEquipe(team, user) {
  const membre = stmts.getTeamMember.get(team.id, user.id);
  return {
    team: { id: team.id, name: team.name, type: team.type, owner_id: team.owner_id },
    me: {
      id: membre.id,
      role: membre.role,
      can_create: !!membre.can_create,
      can_edit: !!membre.can_edit,
      can_view_all: !!membre.can_view_all,
      can_manage: peutGerer(team, membre, user),
    },
    members: stmts.getTeamMembers.all(team.id).map(m => ({
      id: m.id, user_id: m.user_id, name: m.name, email: m.email,
      role: m.role, can_create: !!m.can_create, can_edit: !!m.can_edit,
      can_view_all: !!m.can_view_all, last_seen_at: m.last_seen_at,
      is_owner: m.user_id === team.owner_id,
    })),
    invitations: stmts.getInvitationsByTeam.all(team.id).map(i => ({
      id: i.id, email: i.email, role: i.role, expires_at: i.expires_at,
      created_at: i.created_at, invited_by_name: i.invited_by_name,
      expired: new Date(i.expires_at).getTime() < Date.now(),
    })),
  };
}

function nouveauJeton() {
  return crypto.randomBytes(24).toString("hex");
}

module.exports = function teamRoutes(pathname, req, res, url) {
  let params;

  if (pathname === "/api/team" && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    return jsonResponse(res, 200, etatEquipe(ensureTeam(user), user));
  }

  if (pathname === "/api/team" && req.method === "PUT") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      const team = ensureTeam(user);
      const membre = stmts.getTeamMember.get(team.id, user.id);
      if (!peutGerer(team, membre, user)) return errorResponse(res, 403, "Vous ne gérez pas cette équipe");
      try {
        const body = await parseBody(req);
        const nom = (body.name || "").trim();
        if (!nom) return errorResponse(res, 400, "Nom requis");
        stmts.renameTeam.run(nom.slice(0, 80), team.id);
        return jsonResponse(res, 200, { ok: true });
      } catch (e) {
        return errorResponse(res, 400, "Requête invalide");
      }
    })();
  }

  if (pathname === "/api/team/invitations" && req.method === "POST") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      const team = ensureTeam(user);
      const membre = stmts.getTeamMember.get(team.id, user.id);
      if (!peutGerer(team, membre, user)) {
        return errorResponse(res, 403, team.type === "cabinet"
          ? "Seul un avocat du cabinet peut inviter"
          : "Seul un administrateur de l'équipe peut inviter");
      }
      try {
        const body = await parseBody(req);
        const email = (body.email || "").trim().toLowerCase();
        let role = body.role === "admin" || body.role === "avocat" ? body.role : "collaborateur";
        if (role === "avocat" && team.type !== "cabinet") role = "collaborateur";

        if (!EMAIL_RE.test(email)) return errorResponse(res, 400, "Adresse email invalide");

        const deja = db.prepare(`SELECT m.id FROM team_members m JOIN users u ON u.id = m.user_id
          WHERE m.team_id = ? AND u.email = ?`).get(team.id, email);
        if (deja) return errorResponse(res, 409, "Cette personne fait déjà partie de l'équipe");
        if (stmts.getPendingInvitation.get(team.id, email)) {
          return errorResponse(res, 409, "Une invitation est déjà en attente pour cette adresse");
        }

        const token = nouveauJeton();
        const expires = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
        const info = stmts.createInvitation.run(
          team.id, email, role,
          body.can_create === false ? 0 : 1,
          body.can_edit === false ? 0 : 1,
          body.can_view_all === true ? 1 : 0,
          token, user.id, expires
        );

        const envoi = await sendTeamInvitationEmail({
          email, token, teamName: team.name, inviterName: user.name, roleLabel: ROLE_LABELS[role],
        });
        return jsonResponse(res, 201, { ok: true, id: info.lastInsertRowid, mailSent: envoi.ok });
      } catch (e) {
        return errorResponse(res, 400, "Requête invalide");
      }
    })();
  }

  if ((params = matchRoute(pathname, "/api/team/invitations/:id/resend")) && req.method === "POST") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      const team = ensureTeam(user);
      const membre = stmts.getTeamMember.get(team.id, user.id);
      if (!peutGerer(team, membre, user)) return errorResponse(res, 403, "Accès refusé");

      const invit = stmts.getInvitationById.get(params.id);
      if (!invit || invit.team_id !== team.id) return errorResponse(res, 404, "Invitation introuvable");

      const token = nouveauJeton();
      stmts.refreshInvitation.run(token, new Date(Date.now() + INVITATION_TTL_MS).toISOString(), invit.id);
      const envoi = await sendTeamInvitationEmail({
        email: invit.email, token, teamName: team.name, inviterName: user.name,
        roleLabel: ROLE_LABELS[invit.role],
      });
      return jsonResponse(res, 200, { ok: true, mailSent: envoi.ok });
    })();
  }

  if ((params = matchRoute(pathname, "/api/team/invitations/:id")) && req.method === "DELETE") {
    const user = authGuard(req, res);
    if (!user) return;
    const team = ensureTeam(user);
    const membre = stmts.getTeamMember.get(team.id, user.id);
    if (!peutGerer(team, membre, user)) return errorResponse(res, 403, "Accès refusé");

    const invit = stmts.getInvitationById.get(params.id);
    if (!invit || invit.team_id !== team.id) return errorResponse(res, 404, "Invitation introuvable");
    stmts.revokeInvitation.run(invit.id);
    return jsonResponse(res, 200, { ok: true });
  }

  if ((params = matchRoute(pathname, "/api/team/members/:id")) && req.method === "PUT") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      const team = ensureTeam(user);
      const moi = stmts.getTeamMember.get(team.id, user.id);
      if (!peutGerer(team, moi, user)) return errorResponse(res, 403, "Accès refusé");

      const cible = stmts.getTeamMemberById.get(params.id);
      if (!cible || cible.team_id !== team.id) return errorResponse(res, 404, "Membre introuvable");
      if (cible.user_id === team.owner_id) return errorResponse(res, 403, "Le propriétaire de l'équipe ne peut pas être modifié");

      try {
        const body = await parseBody(req);
        let role = ["admin", "collaborateur", "avocat"].indexOf(body.role) !== -1 ? body.role : cible.role;
        if (role === "avocat" && team.type !== "cabinet") role = "collaborateur";

        // On ne se retire pas le dernier administrateur
        if (cible.role === "admin" && role !== "admin" && stmts.countTeamAdmins.get(team.id).c <= 1) {
          return errorResponse(res, 409, "L'équipe doit garder au moins un administrateur");
        }

        // Un administrateur a tous les droits par construction
        const admin = role === "admin";
        stmts.updateTeamMember.run(
          role,
          admin || body.can_create !== false ? 1 : 0,
          admin || body.can_edit !== false ? 1 : 0,
          admin || body.can_view_all === true ? 1 : 0,
          cible.id
        );
        return jsonResponse(res, 200, { ok: true });
      } catch (e) {
        return errorResponse(res, 400, "Requête invalide");
      }
    })();
  }

  if ((params = matchRoute(pathname, "/api/team/members/:id")) && req.method === "DELETE") {
    const user = authGuard(req, res);
    if (!user) return;
    const team = ensureTeam(user);
    const moi = stmts.getTeamMember.get(team.id, user.id);
    if (!peutGerer(team, moi, user)) return errorResponse(res, 403, "Accès refusé");

    const cible = stmts.getTeamMemberById.get(params.id);
    if (!cible || cible.team_id !== team.id) return errorResponse(res, 404, "Membre introuvable");
    if (cible.user_id === team.owner_id) return errorResponse(res, 403, "Le propriétaire de l'équipe ne peut pas être retiré");
    stmts.removeTeamMember.run(cible.id);
    return jsonResponse(res, 200, { ok: true });
  }

  // Lien cliqué depuis l'email : on répond par une redirection
  if (pathname === "/api/team/accept" && req.method === "GET") {
    const token = url.searchParams.get("token") || "";
    const vers = (statut) => {
      res.writeHead(302, { Location: "/equipe.html?invit=" + statut });
      res.end();
      return true;
    };

    const invit = stmts.getInvitationByToken.get(token);
    if (!invit) return vers("invalide");
    if (invit.accepted_at) return vers("deja");
    if (invit.revoked_at) return vers("annulee");
    if (new Date(invit.expires_at).getTime() < Date.now()) return vers("expiree");

    const user = require("../auth").authenticate(req);
    if (!user) {
      // Pas connecté : on garde le jeton pour reprendre après authentification
      res.writeHead(302, { Location: "/connexion.html?invit=" + encodeURIComponent(token) });
      res.end();
      return true;
    }
    if (user.email.toLowerCase() !== invit.email.toLowerCase()) return vers("autre-compte");

    if (!stmts.getTeamMember.get(invit.team_id, user.id)) {
      stmts.addTeamMember.run(
        invit.team_id, user.id, invit.role,
        invit.can_create, invit.can_edit, invit.can_view_all
      );
    }
    stmts.acceptInvitation.run(invit.id);
    return vers("ok");
  }

  /* ===== Notes internes attachées à un dossier =====
     Visibles uniquement par les membres de l'équipe qui les a écrites : le
     client ne lit pas les notes du cabinet, et inversement. */

  if ((params = matchRoute(pathname, "/api/formalites/:id/notes")) && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    const formalite = stmts.getFormaliteById.get(params.id);
    if (!formalite) return errorResponse(res, 404, "Dossier introuvable");
    if (!teamAccess.canRead(user, formalite)) return errorResponse(res, 403, "Accès refusé");

    const team = teamAccess.teamOf(user);
    if (!team) return jsonResponse(res, 200, { notes: [], members: 0 });

    const notes = stmts.getTeamNotes.all(params.id, team.id).map(n => ({
      id: n.id, content: n.content, created_at: n.created_at,
      author_id: n.author_id, author_name: n.author_name,
      mine: n.author_id === user.id,
      can_delete: n.author_id === user.id || team.role === "admin",
    }));
    return jsonResponse(res, 200, {
      notes,
      team: { id: team.id, name: team.name, type: team.type },
      members: stmts.getTeamMembers.all(team.id).length,
    });
  }

  if ((params = matchRoute(pathname, "/api/formalites/:id/notes")) && req.method === "POST") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      const formalite = stmts.getFormaliteById.get(params.id);
      if (!formalite) return errorResponse(res, 404, "Dossier introuvable");
      if (!teamAccess.canRead(user, formalite)) return errorResponse(res, 403, "Accès refusé");

      const team = teamAccess.teamOf(user);
      if (!team) return errorResponse(res, 400, "Vous n'appartenez à aucune équipe");

      try {
        const body = await parseBody(req);
        const content = (body.content || "").trim();
        if (!content) return errorResponse(res, 400, "Message vide");
        const info = stmts.createTeamNote.run(params.id, team.id, user.id, content.slice(0, 4000));
        return jsonResponse(res, 201, { ok: true, id: info.lastInsertRowid });
      } catch (e) {
        return errorResponse(res, 400, "Requête invalide");
      }
    })();
  }

  if ((params = matchRoute(pathname, "/api/formalites/:fid/notes/:id")) && req.method === "DELETE") {
    const user = authGuard(req, res);
    if (!user) return;
    const note = stmts.getTeamNoteById.get(params.id);
    if (!note) return errorResponse(res, 404, "Note introuvable");

    const team = teamAccess.teamOf(user);
    if (!team || note.team_id !== team.id) return errorResponse(res, 403, "Accès refusé");
    // Son auteur, ou un administrateur de l'équipe
    if (note.author_id !== user.id && team.role !== "admin") {
      return errorResponse(res, 403, "Seul l'auteur ou un administrateur peut supprimer cette note");
    }
    stmts.deleteTeamNote.run(note.id);
    return jsonResponse(res, 200, { ok: true });
  }

  return false;
};
