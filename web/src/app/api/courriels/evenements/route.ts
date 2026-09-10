import { NextResponse } from "next/server";
import { avisDeResend, verifierSignature, AvisRefuse } from "@/infrastructure/mail/evenements";
import { inscrireLAvis } from "@/infrastructure/db/depots/signatures";
import { journal } from "@/lib/journal";
import { route } from "@/lib/reponses";

/**
 * Les avis de Resend sur le sort des courriels envoyés.
 *
 * Cette route est publique, et c'est nécessaire : Resend appelle depuis ses serveurs et
 * n'a pas de session chez nous. Son authentification est la signature du corps, vérifiée
 * avant toute lecture - sans elle, n'importe qui pourrait annoncer qu'un message a
 * rebondi, ou qu'il a été ouvert par quelqu'un qui ne l'a jamais reçu.
 *
 * Le corps est lu en texte brut, tel qu'il est arrivé : la signature porte sur les
 * octets reçus, et un JSON reparsé puis réécrit ne correspondrait plus.
 *
 * La réponse est 200 dès que la signature est bonne, même pour un avis qui ne nous
 * concerne pas : un 4xx ferait réessayer Resend indéfiniment sur un message que nous
 * avons bien reçu et volontairement ignoré.
 *
 * Sans RESEND_WEBHOOK_SECRET, la route refuse tout. C'est le comportement voulu : une
 * route qui accepterait les avis non signés faute de secret configuré serait une porte
 * ouverte, et le silence d'un webhook non branché se voit tout de suite - les dates de
 * remise restent vides.
 */
export const POST = route(async (requete: Request) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    journal.warn({}, "Avis Resend reçu sans RESEND_WEBHOOK_SECRET configuré");
    return NextResponse.json({ error: "Avis non accepté" }, { status: 400 });
  }

  const corps = await requete.text();

  try {
    verifierSignature(
      corps,
      {
        id: requete.headers.get("svix-id"),
        horodatage: requete.headers.get("svix-timestamp"),
        signature: requete.headers.get("svix-signature"),
      },
      secret
    );
  } catch (e) {
    if (e instanceof AvisRefuse) {
      journal.warn({ motif: e.message }, "Avis Resend rejeté");
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const avis = avisDeResend(JSON.parse(corps));
  if (!avis) return NextResponse.json({ recu: true, traite: false });

  const inscrit = await inscrireLAvis(avis);
  journal.info({ sort: avis.sort, inscrit }, "Avis Resend traité");

  return NextResponse.json({ recu: true, traite: inscrit });
});
