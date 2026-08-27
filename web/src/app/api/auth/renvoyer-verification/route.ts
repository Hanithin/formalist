import { NextResponse } from "next/server";
import { z } from "zod";
import { headers } from "next/headers";
import { renvoyerConfirmation } from "@/infrastructure/db/depots/inscription";
import { verifierQuota, enregistrerTentative } from "@/infrastructure/db/limitation";
import { QUOTA_INSCRIPTION } from "@/domain/contenu/limitation";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({ email: schemas.email });

export const POST = route(async (requete: Request) => {
  const { email } = await validerCorps(SCHEMA, requete);

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "inconnue";
  await verifierQuota("renvoi-verification", ip, QUOTA_INSCRIPTION);
  await enregistrerTentative("renvoi-verification", ip);

  await renvoyerConfirmation(email);

  /*
   * Une panne d'envoi se dit, mais sans rien révéler du compte.
   *
   * Elle se lit sur la configuration, non sur le résultat de l'envoi : sans clé, aucun
   * courriel ne part pour personne, et le dire n'apprend rien sur l'existence de
   * l'adresse. Lire l'échec de l'envoi lui-même, en revanche, distinguerait un compte
   * inconnu - pour lequel on n'a rien tenté - d'un compte existant.
   *
   * Sans cela, le client redemandait un lien qui ne partait pas, et recommençait.
   */
  const courrielPossible = !!process.env.RESEND_API_KEY;

  return NextResponse.json({
    ok: true,
    courrielPossible,
    message: courrielPossible
      ? "Si un compte existe avec cette adresse, un nouveau lien vient d'être envoyé. Il est valable 24 heures."
      : "L'envoi des emails est momentanément indisponible. Écrivez-nous et nous confirmerons votre adresse.",
  });
});
