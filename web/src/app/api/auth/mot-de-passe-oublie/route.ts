import { NextResponse } from "next/server";
import { z } from "zod";
import {
  demanderReinitialisation,
  reinitialiser,
} from "@/infrastructure/db/depots/reinitialisation";
import { verifierQuota, enregistrerTentative } from "@/infrastructure/db/limitation";
import { QUOTA_CONNEXION } from "@/domain/contenu/limitation";
import {
  REPONSE_DEMANDE,
  CONFIRMATION_CHANGEMENT,
  messageReinitialisation,
} from "@/domain/acces/reinitialisation";
import { LONGUEUR_MINIMALE } from "@/lib/mots-de-passe";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";
import { NOM_COOKIE } from "@/lib/cookies";
import { DUREE_ABSOLUE_MS } from "@/domain/acces/session";

const DEMANDE = z.object({ email: schemas.email });

const NOUVEAU = z.object({
  jeton: z.string().min(1, "Lien invalide"),
  motDePasse: z
    .string()
    .min(
      LONGUEUR_MINIMALE,
      "Le mot de passe doit faire au moins " + LONGUEUR_MINIMALE + " caractères"
    ),
});

/**
 * Demande d'un lien de réinitialisation.
 *
 * La réponse est la même que l'adresse soit connue ou non : distinguer ferait de
 * cette page un annuaire, interrogeable adresse par adresse pour savoir qui est
 * client. Le quota s'applique pour la même raison qu'à la connexion, et pour une
 * autre encore : sans lui, la page devient un moyen d'inonder la boîte mail d'un
 * tiers, depuis notre propre domaine.
 */
export const POST = route(async (requete: Request) => {
  const { email } = await validerCorps(DEMANDE, requete);

  await verifierQuota("reinitialisation", email, QUOTA_CONNEXION);
  await enregistrerTentative("reinitialisation", email);

  await demanderReinitialisation(email);
  return NextResponse.json({ ok: true, message: REPONSE_DEMANDE });
});

/**
 * Pose du nouveau mot de passe.
 *
 * Une session s'ouvre dans la foulée : la personne vient de prouver qu'elle a accès
 * à l'adresse du compte et de choisir son mot de passe, lui redemander de le saisir
 * à l'écran suivant n'apporte rien.
 */
export const PUT = route(async (requete: Request) => {
  const { jeton, motDePasse } = await validerCorps(NOUVEAU, requete);

  // Le quota porte ici sur le jeton : c'est lui qu'un essai systématique viserait.
  await verifierQuota("reinitialisation-jeton", jeton, QUOTA_CONNEXION);
  await enregistrerTentative("reinitialisation-jeton", jeton);

  const resultat = await reinitialiser(jeton, motDePasse);

  if (resultat.etat !== "valide" || !resultat.session) {
    return NextResponse.json(
      { error: messageReinitialisation(resultat.etat), etat: resultat.etat },
      { status: 400 }
    );
  }

  const reponse = NextResponse.json({ ok: true, message: CONFIRMATION_CHANGEMENT });
  reponse.cookies.set(NOM_COOKIE, resultat.session, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DUREE_ABSOLUE_MS / 1000,
  });
  return reponse;
});
