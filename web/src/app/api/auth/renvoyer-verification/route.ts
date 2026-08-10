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

  // Réponse identique dans tous les cas : ce formulaire est ouvert à tous.
  return NextResponse.json({
    ok: true,
    message: "Si un compte existe avec cette adresse, un nouveau lien vient d'être envoyé.",
  });
});
