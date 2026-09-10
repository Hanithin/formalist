import { NextResponse } from "next/server";
import {
  messageDAvis,
  messageDeReinitialisation,
  messageDeSignature,
  messageDeVerification,
  messageInvitationEquipe,
  type Message,
} from "@/infrastructure/mail/envoi";

/**
 * Relire un courriel sans l'envoyer.
 *
 * En local, aucune clé Resend n'est configurée : rien ne part, et l'on ne voyait donc
 * jamais ce que reçoit la personne à qui l'on écrit. Y poser une clé réelle serait pire
 * - les dossiers d'essai portent des adresses d'essai, et l'un d'eux porte parfois une
 * vraie, qu'on écrirait alors depuis une machine de développement.
 *
 * Les messages viennent des mêmes fonctions que l'envoi : ce qu'on relit ici est
 * exactement ce qui part, sans gabarit d'aperçu à tenir à jour.
 *
 * Hors développement, la route n'existe pas. Elle rend des jetons d'exemple et le
 * contenu de messages transactionnels : ni l'un ni l'autre n'a sa place sur un serveur
 * ouvert, même derrière une session.
 */

const JETON = "jeton-d-exemple-0000000000000000000000000000";

const EXEMPLES: Record<string, () => Message | null> = {
  verification: () => messageDeVerification("Camille", "camille@exemple.fr", JETON),
  signature: () =>
    messageDeSignature("Jean Dupont", "jean.dupont@exemple.fr", JETON, "ATELIER MERIDIEN"),
  "mot-de-passe": () => messageDeReinitialisation("Camille", "camille@exemple.fr", JETON),
  equipe: () =>
    messageInvitationEquipe("camille@exemple.fr", JETON, "Cabinet Roseberry", "Hani Madfai"),
  avis: () =>
    messageDAvis(
      "Camille",
      "camille@exemple.fr",
      {
        sujet: "Vos actes sont prêts à signer",
        corps:
          "Votre avocat a validé vos actes de constitution.\n\nVous pouvez maintenant les relire et les signer depuis votre dossier.",
      } as Parameters<typeof messageDAvis>[2],
      "/creation?dossier=1&etape=7"
    ),
};

/** La page qui liste les messages, quand on n'en demande aucun en particulier. */
function sommaire(): string {
  const liens = Object.keys(EXEMPLES)
    .map((cle) => '<li><a href="/api/courriels/apercu?type=' + cle + '">' + cle + "</a></li>")
    .join("");

  return (
    '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Aperçu des courriels</title>' +
    "<style>body{font-family:system-ui,sans-serif;margin:48px;color:#18181b}" +
    "h1{font-size:20px;margin:0 0 6px}p{color:#52525b;margin:0 0 24px}" +
    "ul{padding-left:18px;line-height:2}a{color:#6d28d9}</style></head><body>" +
    "<h1>Aperçu des courriels</h1>" +
    "<p>Ce que reçoit la personne à qui l'on écrit. Rien n'est envoyé.</p>" +
    "<ul>" +
    liens +
    "</ul></body></html>"
  );
}

export async function GET(requete: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Introuvable", { status: 404 });
  }

  const type = new URL(requete.url).searchParams.get("type");
  if (!type) {
    return new NextResponse(sommaire(), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const exemple = EXEMPLES[type];
  if (!exemple) {
    return new NextResponse("Ce courriel n'existe pas : " + type, { status: 404 });
  }

  const message = exemple();
  if (!message) {
    return new NextResponse("Ce courriel ne compose rien avec cet exemple", { status: 204 });
  }

  /*
   * Le sujet et le destinataire en tête du HTML rendu.
   *
   * Ils ne font pas partie du corps, et c'est pourtant la première chose qu'on vérifie :
   * un sujet mal accordé se voit dans une boîte de réception, pas dans un gabarit.
   */
  const entete =
    '<div style="font-family:system-ui,sans-serif;background:#18181b;color:#fff;padding:14px 20px;font-size:13px;line-height:1.7">' +
    "<strong>Sujet</strong> · " +
    message.sujet +
    "<br><strong>À</strong> · " +
    message.destinataire +
    "</div>";

  return new NextResponse(entete + message.html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
