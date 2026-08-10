import { journal } from "@/lib/journal";

/**
 * Envoi d'emails transactionnels, par Resend.
 *
 * Porté depuis lib/mail.js. Sans clé, le message part dans le journal plutôt que
 * sur le réseau : on peut développer sans compte Resend, et la trace dit ce qui
 * aurait été envoyé.
 *
 * Un envoi ne lève jamais. Ne pas avoir prévenu quelqu'un est un problème ;
 * empêcher son inscription parce que l'email n'est pas parti en est un plus grand.
 */
const RESEND = "https://api.resend.com/emails";

export function adresseApplication(): string {
  const brut = process.env.APP_URL ?? "http://localhost:3000";
  return brut.replace(/\/+$/, "");
}

function echapper(texte: string): string {
  return String(texte ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface Resultat {
  ok: boolean;
  /** Vrai quand aucune clé n'est configurée : le message n'est pas parti. */
  simule?: boolean;
}

export async function envoyer(message: {
  destinataire: string;
  sujet: string;
  html: string;
  texte: string;
}): Promise<Resultat> {
  const cle = process.env.RESEND_API_KEY;
  const expediteur = process.env.MAIL_FROM ?? "Formalist <onboarding@resend.dev>";

  if (!cle) {
    // On ne consigne ni l'adresse ni le corps : le journal masque déjà les
    // champs personnels, et un email en clair y échapperait.
    journal.info({ sujet: message.sujet }, "Email non envoyé : aucune clé configurée");
    return { ok: true, simule: true };
  }

  try {
    const reponse = await fetch(RESEND, {
      method: "POST",
      headers: { Authorization: "Bearer " + cle, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: expediteur,
        to: [message.destinataire],
        subject: message.sujet,
        html: message.html,
        text: message.texte,
      }),
    });

    if (!reponse.ok) {
      journal.error({ statut: reponse.status }, "Envoi refusé par Resend");
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    journal.error({ err: e }, "Envoi interrompu");
    return { ok: false };
  }
}

/** Gabarit volontairement simple : les clients de messagerie en supportent peu. */
function gabarit(titre: string, corps: string, libelleBouton: string, lien: string): string {
  return `<!DOCTYPE html>
<html lang="fr"><body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;padding:40px 32px;">
        <tr><td style="font-size:20px;font-weight:700;letter-spacing:0;padding-bottom:24px;">formalist</td></tr>
        <tr><td style="font-size:22px;font-weight:700;letter-spacing:0;padding-bottom:12px;">${echapper(titre)}</td></tr>
        <tr><td style="font-size:15px;line-height:1.6;color:#444;">${corps}</td></tr>
        <tr><td style="padding:28px 0 8px;">
          <a href="${lien}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:15px;padding:14px 28px;border-radius:100px;">${echapper(libelleBouton)}</a>
        </td></tr>
        <tr><td style="font-size:12px;line-height:1.6;color:#999;padding-top:20px;">
          Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
          <span style="color:#666;word-break:break-all;">${lien}</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function emailDeVerification(prenom: string, adresse: string, jeton: string) {
  const lien = adresseApplication() + "/api/auth/verifier?jeton=" + encodeURIComponent(jeton);

  return envoyer({
    destinataire: adresse,
    sujet: "Confirmez votre adresse email - Formalist",
    html: gabarit(
      "Bienvenue" + (prenom ? " " + echapper(prenom) : ""),
      "Il ne reste qu'une étape : confirmez votre adresse pour activer votre compte. Ce lien est valable 24 heures.",
      "Confirmer mon adresse",
      lien
    ),
    texte:
      "Bienvenue sur Formalist.\n\nConfirmez votre adresse en ouvrant ce lien (valable 24 heures) :\n" +
      lien,
  });
}

export function emailInvitationEquipe(
  adresse: string,
  jeton: string,
  equipe: string,
  invitant: string
) {
  const lien = adresseApplication() + "/api/equipe/accepter?jeton=" + encodeURIComponent(jeton);

  return envoyer({
    destinataire: adresse,
    sujet: invitant + " vous invite à rejoindre " + equipe,
    html: gabarit(
      "Rejoignez " + echapper(equipe),
      echapper(invitant) +
        " vous invite à rejoindre <strong>" +
        echapper(equipe) +
        "</strong> sur Formalist. Cette invitation est valable 7 jours.",
      "Rejoindre l'équipe",
      lien
    ),
    texte:
      invitant + " vous invite à rejoindre " + equipe + " sur Formalist.\n\nLien (valable 7 jours) :\n" + lien,
  });
}
