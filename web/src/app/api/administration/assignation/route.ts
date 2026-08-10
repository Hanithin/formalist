import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  assignerDepuisAdministration,
  ChangementRefuse,
} from "@/infrastructure/db/depots/administration";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({ dossier: schemas.identifiant, avocat: schemas.identifiant });

export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier, avocat } = await validerCorps(SCHEMA, requete);

  try {
    return NextResponse.json(await assignerDepuisAdministration(utilisateur, dossier, avocat));
  } catch (e) {
    if (e instanceof ChangementRefuse) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
});
