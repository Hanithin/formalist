/**
 * lib/mail.js - envoi d'emails transactionnels via Resend
 *
 * Config (.env) :
 *   RESEND_API_KEY  clé API Resend. Absente => mode console (le mail n'est pas
 *                   envoyé, son contenu est affiché dans les logs serveur).
 *   MAIL_FROM       expéditeur, ex. "Formalist <contact@formalist.fr>"
 *   APP_URL         base des liens, ex. "http://localhost:3000"
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function appUrl() {
  return (process.env.APP_URL || "http://localhost:" + (process.env.PORT || 3000)).replace(/\/+$/, "");
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Envoie un email. Retourne { ok, skipped?, error? } - n'émet jamais d'exception,
 * l'appelant ne doit pas échouer parce qu'un email n'est pas parti.
 */
async function sendMail({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || "Formalist <onboarding@resend.dev>";

  if (!key) {
    console.log("\n[mail] RESEND_API_KEY absente - email non envoyé.");
    console.log("[mail] Destinataire :", to);
    console.log("[mail] Sujet        :", subject);
    console.log("[mail] Contenu      :\n" + (text || html) + "\n");
    return { ok: true, skipped: true };
  }

  try {
    const r = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });
    if (!r.ok) {
      const body = await r.text();
      console.error("[mail] Envoi refusé par Resend (" + r.status + ") :", body);
      return { ok: false, error: "Envoi impossible" };
    }
    return { ok: true };
  } catch (e) {
    console.error("[mail] Envoi interrompu :", e.message);
    return { ok: false, error: "Envoi impossible" };
  }
}

/* Gabarit HTML commun, volontairement simple (compatible clients mail) */
function layout({ title, body, ctaLabel, ctaUrl }) {
  return `<!DOCTYPE html>
<html lang="fr"><body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;padding:40px 32px;">
        <tr><td style="font-size:20px;font-weight:700;letter-spacing: 0;padding-bottom:24px;">formalist</td></tr>
        <tr><td style="font-size:22px;font-weight:700;letter-spacing: 0;padding-bottom:12px;">${escapeHtml(title)}</td></tr>
        <tr><td style="font-size:15px;line-height:1.6;color:#444;">${body}</td></tr>
        <tr><td style="padding:28px 0 8px;">
          <a href="${ctaUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:15px;padding:14px 28px;border-radius:100px;">${escapeHtml(ctaLabel)}</a>
        </td></tr>
        <tr><td style="font-size:12px;line-height:1.6;color:#999;padding-top:20px;">
          Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
          <span style="color:#666;word-break:break-all;">${ctaUrl}</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function sendVerificationEmail(user, token) {
  const link = appUrl() + "/api/auth/verify?token=" + encodeURIComponent(token);
  const prenom = user.first_name || user.name || "";
  return sendMail({
    to: user.email,
    subject: "Confirmez votre adresse email - Formalist",
    html: layout({
      title: "Bienvenue" + (prenom ? " " + escapeHtml(prenom) : "") + " !",
      body: "Il ne reste qu'une étape : confirmez votre adresse email pour activer votre compte Formalist. Ce lien est valable 24 heures.",
      ctaLabel: "Confirmer mon adresse",
      ctaUrl: link,
    }),
    text: "Bienvenue sur Formalist.\n\nConfirmez votre adresse email en ouvrant ce lien (valable 24 h) :\n" + link,
  });
}

function sendTeamInvitationEmail({ email, token, teamName, inviterName, roleLabel }) {
  const link = appUrl() + "/api/team/accept?token=" + encodeURIComponent(token);
  return sendMail({
    to: email,
    subject: (inviterName || "Formalist") + " vous invite à rejoindre " + teamName,
    html: layout({
      title: "Rejoignez " + escapeHtml(teamName),
      body: escapeHtml(inviterName || "Un membre de l'équipe")
        + " vous invite à rejoindre <strong>" + escapeHtml(teamName) + "</strong> sur Formalist"
        + (roleLabel ? " en tant que <strong>" + escapeHtml(roleLabel) + "</strong>" : "")
        + ". Cette invitation est valable 7 jours.",
      ctaLabel: "Rejoindre l'équipe",
      ctaUrl: link,
    }),
    text: (inviterName || "Un membre de l'équipe") + " vous invite à rejoindre " + teamName
      + " sur Formalist" + (roleLabel ? " en tant que " + roleLabel : "")
      + ".\n\nOuvrez ce lien pour accepter (valable 7 jours) :\n" + link,
  });
}

module.exports = { sendMail, sendVerificationEmail, sendTeamInvitationEmail, appUrl };
