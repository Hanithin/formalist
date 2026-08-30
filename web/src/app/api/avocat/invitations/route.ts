import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  inviterUnAvocat,
  retirerUnAvocat,
  avocatsInvitesDuDossier,
} from "@/infrastructure/db/depots/avocat";
import { exigerDossier } from "@/infrastructure/db/depots/dossiers";
import { validerCorps, validerParametres, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Les avocats invités sur un dossier.
 *
 * L'assignation est unique - c'est elle qui dit qui répond du dossier - et un avocat
 * qui voulait un second regard n'avait qu'un choix : rendre le dossier en entier, et
 * le perdre de vue. L'invité lit et travaille le dossier comme lui.
 */
export const GET = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = validerParametres(
    z.object({ dossier: schemas.identifiant }),
    new URL(requete.url)
  );

  /* L'accès au dossier commande l'accès à la liste : elle nomme des personnes. */
  await exigerDossier(utilisateur, dossier);
  return NextResponse.json({ avocats: await avocatsInvitesDuDossier(dossier) });
});

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier, courriel } = await validerCorps(
    z.object({ dossier: schemas.identifiant, courriel: schemas.email }),
    requete
  );

  return NextResponse.json(await inviterUnAvocat(utilisateur, dossier, courriel));
});

export const DELETE = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier, avocat } = await validerCorps(
    z.object({ dossier: schemas.identifiant, avocat: schemas.identifiant }),
    requete
  );

  return NextResponse.json(await retirerUnAvocat(utilisateur, dossier, avocat));
});
