import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { listerDossiers } from "@/infrastructure/db/depots/dossiers";
import { route } from "@/lib/reponses";

export const GET = route(async () => {
  const utilisateur = await exigerUtilisateur();
  return NextResponse.json({ dossiers: await listerDossiers(utilisateur) });
});
