import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  transmettreALAvocat,
  DossierIncompletPourTransmission,
} from "@/infrastructure/db/depots/brouillons";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({ dossier: schemas.identifiant });

/**
 * Le client transmet son dossier.
 *
 * Ce geste n'existait pas : la seule route qui change l'état d'un dossier exige d'être
 * avocat, et le dossier restait « en cours » quoi que le client fasse.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(SCHEMA, requete);

  try {
    return NextResponse.json(await transmettreALAvocat(utilisateur, dossier));
  } catch (e) {
    if (e instanceof DossierIncompletPourTransmission) {
      return NextResponse.json({ error: e.message, etape: e.etape }, { status: 400 });
    }
    throw e;
  }
});
