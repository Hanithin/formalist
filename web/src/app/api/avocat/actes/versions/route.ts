import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { revenirALaVersion } from "@/infrastructure/db/depots/avocat";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Revenir à une version antérieure d'un acte.
 *
 * Reproduire un acte le détruisait : la ligne partait, le fichier avec, et l'avocat qui
 * corrigeait une coquille perdait la version d'origine. Les versions sont archivées ;
 * celle-ci les rétablit.
 *
 * La lecture n'a pas de route : les versions se rendent avec le dossier, dans la page.
 */
export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { version } = await validerCorps(z.object({ version: schemas.identifiant }), requete);

  const { retablie } = await revenirALaVersion(utilisateur, version);
  return NextResponse.json({ retablie });
});
