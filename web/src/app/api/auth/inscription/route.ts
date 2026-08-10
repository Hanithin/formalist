import { NextResponse } from "next/server";
import { z } from "zod";
import { inscrire } from "@/infrastructure/db/depots/inscription";
import { verifierInscription } from "@/domain/acces/inscription";
import { verifierQuota, enregistrerTentative } from "@/infrastructure/db/limitation";
import { QUOTA_INSCRIPTION } from "@/domain/contenu/limitation";
import { validerCorps, schemas, EntreeInvalide } from "@/lib/valider";
import { route } from "@/lib/reponses";
import { headers } from "next/headers";

const SCHEMA = z.object({
  prenom: schemas.nom,
  nom: schemas.nom,
  email: schemas.email,
  motDePasse: z.string().min(1, "Indiquez un mot de passe").max(200),
});

export const POST = route(async (requete: Request) => {
  const demande = await validerCorps(SCHEMA, requete);

  // Les règles de mot de passe vivent dans le domaine : le schéma vérifie la
  // forme, elles vérifient le fond.
  const anomalies = verifierInscription(demande);
  if (anomalies.length > 0) {
    throw new EntreeInvalide(
      Object.fromEntries(anomalies.map((a) => [a.champ, [a.message]]))
    );
  }

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "inconnue";
  await verifierQuota("inscription", ip, QUOTA_INSCRIPTION);
  await enregistrerTentative("inscription", ip);

  await inscrire(demande);

  // Même réponse que l'adresse soit libre ou déjà prise : distinguer
  // permettrait d'énumérer les comptes existants.
  return NextResponse.json(
    {
      ok: true,
      message:
        "Vérifiez votre boîte email : un lien de confirmation vous attend. Il est valable 24 heures.",
    },
    { status: 201 }
  );
});
