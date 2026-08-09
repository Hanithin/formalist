import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/infrastructure/db/client";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { revoquerToutesLesSessions, creerSession } from "@/infrastructure/db/sessions";
import { hacher, verifier, jeton, LONGUEUR_MINIMALE } from "@/lib/mots-de-passe";
import { validerCorps } from "@/lib/valider";
import { route } from "@/lib/reponses";
import { NOM_COOKIE } from "@/lib/cookies";
import { DUREE_ABSOLUE_MS } from "@/domain/acces/session";

const SCHEMA = z.object({
  actuel: z.string().min(1, "Mot de passe actuel requis"),
  nouveau: z
    .string()
    .min(LONGUEUR_MINIMALE, "Le mot de passe doit faire au moins " + LONGUEUR_MINIMALE + " caractères"),
});

export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { actuel, nouveau } = await validerCorps(SCHEMA, requete);

  const compte = await prisma.users.findUniqueOrThrow({ where: { id: utilisateur.id } });
  if (!verifier(actuel, { hash: compte.password_hash, salt: compte.salt })) {
    return NextResponse.json({ error: "Mot de passe actuel incorrect" }, { status: 403 });
  }

  const empreinte = hacher(nouveau);
  await prisma.users.update({
    where: { id: utilisateur.id },
    data: { password_hash: empreinte.hash, salt: empreinte.salt },
  });

  // On change souvent de mot de passe pour chasser quelqu'un : toutes les sessions
  // ouvertes tombent, y compris celle-ci. On en rouvre une pour la personne qui
  // vient de faire la manipulation, sinon elle se retrouve déconnectée sans raison
  // apparente.
  await revoquerToutesLesSessions(utilisateur.id);
  const valeur = jeton();
  await creerSession(utilisateur.id, valeur);

  const reponse = NextResponse.json({ ok: true, message: "Mot de passe modifié. Les autres sessions ont été fermées." });
  reponse.cookies.set(NOM_COOKIE, valeur, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DUREE_ABSOLUE_MS / 1000,
  });
  return reponse;
});
