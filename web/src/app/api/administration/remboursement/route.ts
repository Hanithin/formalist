import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { marquerRembourse, ChangementRefuse } from "@/infrastructure/db/depots/administration";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({ paiement: schemas.identifiant });

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { paiement } = await validerCorps(SCHEMA, requete);

  try {
    return NextResponse.json(await marquerRembourse(utilisateur, paiement));
  } catch (e) {
    if (e instanceof ChangementRefuse) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
});
