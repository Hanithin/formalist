import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/infrastructure/db/client";
import { creerSession } from "@/infrastructure/db/sessions";
import { verifierQuota, enregistrerTentative } from "@/infrastructure/db/limitation";
import { QUOTA_CONNEXION } from "@/domain/contenu/limitation";
import { verifier, jeton } from "@/lib/mots-de-passe";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";
import { NOM_COOKIE } from "@/lib/cookies";
import { DUREE_ABSOLUE_MS } from "@/domain/acces/session";

const SCHEMA = z.object({
  email: schemas.email,
  motDePasse: z.string().min(1, "Mot de passe requis"),
});

export const POST = route(async (requete: Request) => {
  const { email, motDePasse } = await validerCorps(SCHEMA, requete);

  // La limite porte sur l'adresse visée, pas sur l'appelant : c'est le compte
  // qu'on protège d'un essai systématique de mots de passe.
  await verifierQuota("connexion", email, QUOTA_CONNEXION);
  await enregistrerTentative("connexion", email);

  const compte = await prisma.users.findUnique({ where: { email } });

  // Même réponse dans tous les cas de refus : distinguer « compte inconnu » de
  // « mot de passe faux » permettrait d'énumérer les adresses inscrites.
  const refus = NextResponse.json({ error: "Email ou mot de passe incorrect" }, { status: 401 });
  if (!compte) return refus;
  if (!verifier(motDePasse, { hash: compte.password_hash, salt: compte.salt })) return refus;

  if (compte.suspended) {
    return NextResponse.json({ error: "Ce compte est désactivé. Contactez le support." }, { status: 403 });
  }
  if (!compte.email_verified) {
    return NextResponse.json(
      { error: "Votre adresse email n'est pas encore confirmée. Ouvrez le lien reçu par email." },
      { status: 403 }
    );
  }

  const valeur = jeton();
  await creerSession(compte.id, valeur);

  const reponse = NextResponse.json({ ok: true });
  reponse.cookies.set(NOM_COOKIE, valeur, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DUREE_ABSOLUE_MS / 1000,
  });
  return reponse;
});
