import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerRole } from "@/infrastructure/db/utilisateur-courant";
import { validerCorps } from "@/lib/valider";
import { route } from "@/lib/reponses";
import { chiffrementDisponible } from "@/lib/chiffrement";
import {
  compteDeLaSession,
  enProduction,
  hoteDuGuichet,
  oublierLeJeton,
  ouvrirUneSession,
} from "@/infrastructure/guichet/transport";
import { compteDeLaReponse } from "@/infrastructure/guichet/formalites";
import {
  compteDeLAvocat,
  enregistrerLeCompte,
  oublierLeCompte,
} from "@/infrastructure/db/depots/identifiants-guichet";

/**
 * Connecter son compte e-procedures, pour déposer en son nom.
 *
 * Le compte du guichet unique est nominatif : la formalité part sous la responsabilité
 * de celui qui la signe, et le journal de l'INPI doit pouvoir dire qui a agi. Un compte
 * de cabinet partagé rendrait tous les dépôts identiques chez eux.
 *
 * On vérifie avant d'enregistrer. Écrire d'abord ferait porter à l'avocat un compte qui
 * ne fonctionne pas, et il ne l'apprendrait qu'au moment de déposer - c'est-à-dire au
 * pire moment. La cause la plus fréquente n'est d'ailleurs pas le mot de passe mais les
 * conditions particulières d'utilisation, qui se valident une fois sur le site de
 * l'INPI et sans lesquelles l'API refuse la session sans le dire.
 *
 * Le mot de passe entre ici et n'en ressort jamais : ni vers le navigateur, ni vers le
 * journal. L'écran n'affiche que l'identifiant et le nom que le guichet a rendus.
 */

const SCHEMA = z.object({
  username: z.string().trim().min(1, "L'identifiant est vide"),
  password: z.string().min(1, "Le mot de passe est vide"),
});

/** Ce que l'écran sait du compte, sans jamais le secret. */
export const GET = route(async () => {
  const utilisateur = await exigerRole("avocat", "admin");

  return NextResponse.json({
    hote: hoteDuGuichet(),
    production: enProduction(),
    /* Sans clé, rien ne peut être enregistré : autant le dire avant la saisie. */
    chiffrementPret: chiffrementDisponible(),
    compte: await compteDeLAvocat(utilisateur.id),
  });
});

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerRole("avocat", "admin");
  const identifiants = await validerCorps(SCHEMA, requete);

  /*
   * Une session neuve, forcée.
   *
   * Sans `force`, un jeton déjà en cache pour ce même identifiant rendrait la
   * vérification muette : on croirait avoir validé un mot de passe qu'on n'a pas
   * essayé.
   */
  await ouvrirUneSession(true, identifiants);
  const compte = compteDeLaReponse(compteDeLaSession(identifiants));

  await enregistrerLeCompte(utilisateur.id, identifiants);

  return NextResponse.json({
    hote: hoteDuGuichet(),
    production: enProduction(),
    compte: {
      username: identifiants.username,
      nom: [compte.prenom, compte.nom].filter(Boolean).join(" ") || null,
      societe: compte.societe,
    },
  });
});

/** Oublier son compte. Les dépôts déjà faits demeurent : c'est le secret qui s'efface. */
export const DELETE = route(async () => {
  const utilisateur = await exigerRole("avocat", "admin");
  await oublierLeCompte(utilisateur.id);
  /* Les sessions en mémoire tombent avec : un jeton déjà ouvert survivrait au secret
     qu'on vient d'effacer. Les autres se rouvrent au premier appel, sans qu'on le voie. */
  oublierLeJeton();
  return NextResponse.json({ oublie: true });
});
